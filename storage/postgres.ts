import {createHash} from 'node:crypto';
import pg from 'pg';
import type {PoolClient} from 'pg';
import type {EquipmentSlot,Item,PersistentHero} from '../shared/types.js';
import {migrate} from './schema.js';

const {Pool}=pg;
const slots:readonly EquipmentSlot[]=['weapon','armor','helmet','boots','ring','amulet'];
const lockSql='SELECT pg_try_advisory_lock(8675309, 4732) AS locked';
const lockHealthSql=`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=pg_backend_pid()
  AND locktype='advisory' AND classid=8675309::oid AND objid=4732::oid
  AND mode='ExclusiveLock' AND granted) AS locked`;
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
function canonical(value:unknown):string{
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
function tokenHash(token:string):string{
  if(typeof token!=='string'||!token.length)throw new Error('Hero token is required');
  return digest(token);
}
const numeric=(value:unknown)=>Number(value);
const optional=<T>(value:T|null|undefined)=>value===null||value===undefined?undefined:value;

export class StoreConflictError extends Error{
  constructor(message='Hero storage revision or identity conflict'){super(message);this.name='StoreConflictError';}
}
export class StoreUnavailableError extends Error{
  constructor(message='Hero storage unavailable'){super(message);this.name='StoreUnavailableError';}
}
export interface CommitEntry {token:string;hero:PersistentHero;expectedRevision:number}
export interface CommitReceipt {id:string;revision:number}
export interface HeroStore{
  load(token:string):Promise<{hero:PersistentHero;revision:number}|null>;
  commit(entries:CommitEntry[],operationId:string,reason?:string):Promise<CommitReceipt[]>;
  health():Promise<boolean>;
  close():Promise<void>;
}

function checkEntry(entry:CommitEntry):void{
  const {hero,expectedRevision}=entry;
  if(!hero||typeof hero.id!=='string'||!hero.id||!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new Error('Invalid hero commit entry');
  if(!Array.isArray(hero.items)||!Array.isArray(hero.pendingItems))throw new Error('Invalid hero inventory');
  const all=[...hero.items,...hero.pendingItems],ids=new Set<string>();
  if(hero.items.length>22||hero.pendingItems.length>16)throw new Error('Inventory capacity exceeded');
  for(const item of all){if(!item||typeof item.id!=='string'||!item.id||ids.has(item.id)||!slots.includes(item.slot))throw new Error('Invalid or duplicate item');ids.add(item.id);}
  const worn=new Set<string>();
  for(const slot of slots){const id=hero.equipment?.[slot];if(id){const item=hero.items.find(item=>item.id===id);if(!item||item.slot!==slot||worn.has(id))throw new Error('Invalid equipped item');worn.add(id);}}
  if(hero.items.length-worn.size>16)throw new Error('Backpack capacity exceeded');
}
function heroValues(hero:PersistentHero,hash:string):unknown[]{
  const a=hero.allocatedStats;
  return [hero.id,hash,hero.schemaVersion,hero.name,hero.classId,hero.level,hero.xp,hero.gold,hero.kills,hero.statRevision,
    a.strength,a.dexterity,a.vitality,a.energy,hero.x,hero.z,hero.yaw,hero.weapon,hero.hp,hero.mana,hero.potions,
    hero.potionCooldown,hero.specialCooldown,hero.dead,hero.combatUntil,hero.attackSerial,hero.running,hero.questKills,
    hero.boss,hero.questClaimed,JSON.stringify(hero.skillCooldowns??{}),hero.attack===null?null:JSON.stringify(hero.attack)];
}
const heroColumns=`id,token_hash,schema_version,name,class_id,level,xp,gold,kills,stat_revision,
  strength,dexterity,vitality,energy,x,z,yaw,weapon,hp,mana,potions,potion_cooldown,special_cooldown,dead,
  combat_until,attack_serial,running,quest_kills,boss,quest_claimed,skill_cooldowns,attack`;
const updateColumns=heroColumns.split(',').map(s=>s.trim()).filter(s=>s!=='id'&&s!=='token_hash');

async function writeInventory(client:PoolClient,hero:PersistentHero):Promise<{gained:string[];lost:string[]}>{
  const all=[...hero.items,...hero.pendingItems];
  const old=await client.query<{id:string}>('SELECT id FROM item_instances WHERE hero_id=$1 ORDER BY item_index',[hero.id]);
  const oldIds=new Set(old.rows.map(row=>row.id)),newIds=new Set(all.map(item=>item.id));
  const lost=[...oldIds].filter(id=>!newIds.has(id)),gained=[...newIds].filter(id=>!oldIds.has(id));
  // Clear locations before swaps. Existing item rows are shifted out of the
  // unique index range before writing their final array positions.
  await client.query('DELETE FROM inventory_locations WHERE hero_id=$1',[hero.id]);
  await client.query('UPDATE item_instances SET item_index=item_index+1000 WHERE hero_id=$1',[hero.id]);
  for(const id of lost)await client.query('DELETE FROM item_instances WHERE id=$1 AND hero_id=$2',[id,hero.id]);
  for(let index=0;index<all.length;index++){
    const item=all[index],fingerprint=digest(canonical(item));
    if(oldIds.has(item.id)){
      const identity=await client.query<{fingerprint:string}>('SELECT fingerprint FROM item_identity WHERE id=$1',[item.id]);
      if(identity.rows[0]?.fingerprint!==fingerprint)throw new StoreConflictError('Rolled item identity changed');
      await client.query('UPDATE item_instances SET item_index=$1 WHERE id=$2 AND hero_id=$3',[index,item.id,hero.id]);
    }else{
      const identity=await client.query<{fingerprint:string}>('SELECT fingerprint FROM item_identity WHERE id=$1',[item.id]);
      if(identity.rowCount)throw new StoreConflictError('Item identity already exists');
      await client.query('INSERT INTO item_identity(id,fingerprint) VALUES ($1,$2)',[item.id,fingerprint]);
      await client.query(`INSERT INTO item_instances(id,hero_id,item_index,name,slot,rarity,power,class_id,bound,definition_id,roll_version,item_level)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[
          item.id,hero.id,index,item.name,item.slot,item.rarity,item.power,item.classId??null,item.bound??null,
          item.definitionId??null,item.rollVersion??null,item.itemLevel??null]);
      for(let ordinal=0;ordinal<(item.rolls?.length??0);ordinal++){
        const roll=item.rolls![ordinal];
        await client.query(`INSERT INTO item_rolls(item_id,ordinal,stat_key,value,min_value,max_value,step)
          VALUES ($1,$2,$3,$4,$5,$6,$7)`,[item.id,ordinal,roll.key,roll.value,roll.min,roll.max,roll.step??null]);
      }
      await client.query('UPDATE item_instances SET sealed=true WHERE id=$1 AND hero_id=$2',[item.id,hero.id]);
    }
  }
  let bag=0;
  for(const item of hero.items){
    const equipped=hero.equipment?.[item.slot]===item.id;
    await client.query(`INSERT INTO inventory_locations(item_id,hero_id,kind,position,equipped_slot)
      VALUES ($1,$2,$3,$4,$5)`,[item.id,hero.id,equipped?'equipped':'bag',equipped?null:bag++,equipped?item.slot:null]);
  }
  for(let position=0;position<hero.pendingItems.length;position++){
    const item=hero.pendingItems[position];
    await client.query(`INSERT INTO inventory_locations(item_id,hero_id,kind,position,equipped_slot)
      VALUES ($1,$2,'pending',$3,NULL)`,[item.id,hero.id,position]);
  }
  return {gained,lost};
}

async function readHero(client:PoolClient,hash:string):Promise<{hero:PersistentHero;revision:number}|null>{
  const result=await client.query('SELECT * FROM heroes WHERE token_hash=$1',[hash]);
  const row=result.rows[0];if(!row)return null;
  const inventory=await client.query(`SELECT i.*,l.kind,l.position,l.equipped_slot FROM item_instances i
    JOIN inventory_locations l ON l.item_id=i.id AND l.hero_id=i.hero_id WHERE i.hero_id=$1 ORDER BY i.item_index`,[row.id]);
  const itemIds=inventory.rows.map(item=>item.id);
  const rolls=itemIds.length?await client.query(`SELECT * FROM item_rolls WHERE item_id = ANY($1::text[]) ORDER BY item_id,ordinal`,[itemIds]):{rows:[]};
  const byItem=new Map<string,Item['rolls']>();
  for(const roll of rolls.rows){const list=byItem.get(roll.item_id)??[];list.push({key:roll.stat_key,value:numeric(roll.value),min:numeric(roll.min_value),max:numeric(roll.max_value),...(roll.step===null?{}:{step:numeric(roll.step)})});byItem.set(roll.item_id,list);}
  const items:Item[]=[],pendingItems:Item[]=[],equipment:PersistentHero['equipment']={};
  for(const slot of slots)equipment[slot]=null;
  for(const raw of inventory.rows){
    const item:Item={id:raw.id,name:raw.name,slot:raw.slot,rarity:raw.rarity,power:numeric(raw.power),
      ...(raw.class_id===null?{}:{classId:raw.class_id}),...(raw.bound===null?{}:{bound:raw.bound}),
      ...(raw.definition_id===null?{}:{definitionId:raw.definition_id}),
      ...(raw.roll_version===null?{}:{rollVersion:raw.roll_version}),
      ...(raw.item_level===null?{}:{itemLevel:raw.item_level}),
      ...(raw.definition_id===null?{}:{rolls:byItem.get(raw.id)??[]})};
    if(raw.kind==='pending')pendingItems.push(item);else items.push(item);
    if(raw.kind==='equipped')equipment[raw.equipped_slot as EquipmentSlot]=item.id;
  }
  const hero:PersistentHero={
    schemaVersion:row.schema_version,id:row.id,name:row.name,classId:row.class_id,level:row.level,
    xp:numeric(row.xp),gold:numeric(row.gold),kills:row.kills,items,pendingItems,equipment,
    allocatedStats:{strength:row.strength,dexterity:row.dexterity,vitality:row.vitality,energy:row.energy},statRevision:row.stat_revision,
    x:row.x,z:row.z,yaw:row.yaw,weapon:row.weapon,hp:row.hp,mana:row.mana,potions:row.potions,
    potionCooldown:row.potion_cooldown,specialCooldown:row.special_cooldown,skillCooldowns:row.skill_cooldowns,
    dead:row.dead,combatUntil:row.combat_until,attack:row.attack,attackSerial:row.attack_serial,
    running:row.running,questKills:row.quest_kills,boss:row.boss,questClaimed:row.quest_claimed
  };
  return {hero,revision:numeric(row.revision)};
}

class PostgresHeroStore implements HeroStore{
  private tail:Promise<void>=Promise.resolve();
  private closed=false;
  private lost=false;
  constructor(private readonly pool:InstanceType<typeof Pool>,private readonly writer:PoolClient|null){}
  private serial<T>(task:()=>Promise<T>):Promise<T>{
    const next=this.tail.then(task,task);
    this.tail=next.then(()=>{},()=>{});
    return next;
  }
  private async withClient<T>(task:(client:PoolClient)=>Promise<T>):Promise<T>{
    if(this.closed||this.lost)throw new StoreUnavailableError();
    if(this.writer)return this.serial(async()=>{
      if(this.closed||this.lost)throw new StoreUnavailableError();
      try{return await task(this.writer!);}catch(error){this.noteFailure(error);throw this.translate(error);}
    });
    let client:PoolClient;
    try{client=await this.pool.connect();}catch(error){throw new StoreUnavailableError();}
    try{return await task(client);}catch(error){throw this.translate(error);}finally{client.release();}
  }
  private noteFailure(error:unknown):void{
    if(error instanceof StoreConflictError)return;
    if(error instanceof StoreUnavailableError){this.lost=true;return;}
    const code=(error as {code?:string})?.code;
    if(code&&(code.startsWith('08')||['57P01','57P02','57P03'].includes(code)))this.lost=true;
    if(error instanceof Error&&/connection error|not queryable|Connection terminated|Query read timeout/i.test(error.message))this.lost=true;
  }
  private translate(error:unknown):Error{
    if(error instanceof StoreConflictError||error instanceof StoreUnavailableError)return error;
    const code=(error as {code?:string})?.code;
    if(code==='23505')return new StoreConflictError();
    if(code&&(code.startsWith('08')||['57P01','57P02','57P03'].includes(code)))return new StoreUnavailableError();
    if(error instanceof Error&&/connection error|not queryable|Connection terminated|Query read timeout/i.test(error.message))return new StoreUnavailableError();
    return error instanceof Error?error:new Error('Hero storage error');
  }
  async load(token:string){const hash=tokenHash(token);return this.withClient(client=>readHero(client,hash));}
  async commit(entries:CommitEntry[],operationId:string,reason?:string):Promise<CommitReceipt[]>{
    if(!Array.isArray(entries)||!entries.length||typeof operationId!=='string'||!operationId.length||operationId.length>256)throw new Error('Invalid hero operation');
    entries.forEach(checkEntry);
    if(/(?:https?|wss?):\/\//i.test(operationId)||reason&&/(?:https?|wss?):\/\//i.test(reason)||
      entries.some(entry=>operationId.includes(entry.token)||reason?.includes(entry.token)))
      throw new Error('Operation metadata cannot contain tokens or URLs');
    const hashes=entries.map(entry=>tokenHash(entry.token)),idSet=new Set(entries.map(entry=>entry.hero.id)),hashSet=new Set(hashes);
    if(idSet.size!==entries.length||hashSet.size!==entries.length)throw new Error('Duplicate hero in operation');
    const payloadHash=digest(canonical({entries:entries.map((entry,i)=>({tokenHash:hashes[i],hero:entry.hero,expectedRevision:entry.expectedRevision})).sort((a,b)=>a.hero.id.localeCompare(b.hero.id)),reason:reason??null}));
    return this.withClient(async client=>{
      await client.query('BEGIN');
      try{
        if(this.writer){const lock=await client.query<{locked:boolean}>(lockHealthSql);if(!lock.rows[0]?.locked){this.lost=true;throw new StoreUnavailableError('World writer lock lost');}}
        const reserved=await client.query(`INSERT INTO operation_journal(operation_id,payload_hash,reason)
          VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING operation_id`,[operationId,payloadHash,reason??null]);
        const journal=await client.query<{payload_hash:string;receipt:Record<string,number>}>(
          'SELECT payload_hash,receipt FROM operation_journal WHERE operation_id=$1 FOR UPDATE',[operationId]);
        const existing=journal.rows[0];
        if(existing?.payload_hash!==payloadHash)throw new StoreConflictError('Operation id reused with a different payload');
        if(!reserved.rowCount){
          const receipt=entries.map(entry=>({id:entry.hero.id,revision:existing.receipt[entry.hero.id]}));
          if(receipt.some(item=>!Number.isSafeInteger(item.revision)))throw new Error('Incomplete operation receipt');
          await client.query('COMMIT');return receipt;
        }
        const receipt:CommitReceipt[]=[],changes:unknown[]=[];
        for(let i=0;i<entries.length;i++){
          const {hero,expectedRevision}=entries[i],hash=hashes[i],values=heroValues(hero,hash);
          const before=await client.query<{gold:string;revision:string;class_id:string}>(
            'SELECT gold,revision,class_id FROM heroes WHERE id=$1 FOR UPDATE',[hero.id]);
          if(expectedRevision===0){
            if(before.rowCount)throw new StoreConflictError('Hero already exists');
            const placeholders=values.map((_,n)=>`$${n+1}`).join(',');
            await client.query(`INSERT INTO heroes(${heroColumns}) VALUES (${placeholders})`,values);
            receipt.push({id:hero.id,revision:1});
          }else{
            if(!before.rowCount||numeric(before.rows[0].revision)!==expectedRevision)throw new StoreConflictError('Stale hero revision');
            if(before.rows[0].class_id!==hero.classId)throw new StoreConflictError('Hero class cannot change');
            const columns=updateColumns.map((column,n)=>`${column}=$${n+1}`).join(',');
            const params=values.slice(2);
            const updated=await client.query(`UPDATE heroes SET ${columns},revision=revision+1,updated_at=now()
              WHERE id=$${params.length+1} AND token_hash=$${params.length+2} AND revision=$${params.length+3}
              RETURNING revision`,[...params,hero.id,hash,expectedRevision]);
            if(!updated.rowCount)throw new StoreConflictError('Hero token or revision conflict');
            receipt.push({id:hero.id,revision:numeric(updated.rows[0].revision)});
          }
          const inventory=await writeInventory(client,hero);
          changes.push({heroId:hero.id,goldDelta:hero.gold-(before.rows[0]?numeric(before.rows[0].gold):0),...inventory});
        }
        await client.query('UPDATE operation_journal SET receipt=$2::jsonb,economic_changes=$3::jsonb WHERE operation_id=$1',[
          operationId,JSON.stringify(Object.fromEntries(receipt.map(item=>[item.id,item.revision]))),JSON.stringify(changes)]);
        await client.query('COMMIT');return receipt;
      }catch(error){await client.query('ROLLBACK').catch(()=>{this.lost=!!this.writer;});throw error;}
    });
  }
  async health():Promise<boolean>{
    if(this.closed||this.lost)return false;
    try{return await this.withClient(async client=>{
      const result=await client.query<{locked?:boolean}> (this.writer?lockHealthSql:'SELECT 1 AS ok');
      if(this.writer&&!result.rows[0]?.locked){this.lost=true;return false;}
      return !!result.rowCount;
    });}catch{if(this.writer)this.lost=true;return false;}
  }
  async close():Promise<void>{
    if(this.closed)return;this.closed=true;
    await this.tail;
    if(this.writer){await this.writer.query('SELECT pg_advisory_unlock(8675309, 4732)').catch(()=>{});this.writer.release();}
    await this.pool.end();
  }
}

export async function openHeroStore({connectionString,writer=false}:{connectionString:string;writer?:boolean}):Promise<HeroStore>{
  if(!connectionString)throw new Error('PostgreSQL connection string is required');
  const pool=new Pool({connectionString,max:writer?2:4,connectionTimeoutMillis:2000,query_timeout:2000});
  pool.on('error',()=>{});
  let client:PoolClient|null=null;
  try{
    client=await pool.connect();
    await migrate(client);
    if(writer){
      const result=await client.query<{locked:boolean}>(lockSql);
      if(!result.rows[0]?.locked)throw new StoreUnavailableError('Another world writer owns this database');
      client.on('error',()=>{});
      return new PostgresHeroStore(pool,client);
    }
    client.release();return new PostgresHeroStore(pool,null);
  }catch(error){if(client)client.release();await pool.end().catch(()=>{});throw error;}
}
