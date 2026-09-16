import {createHash,randomUUID} from 'node:crypto';
import pg from 'pg';
import type {PoolClient} from 'pg';
import type {EquipmentSlot,Item,PersistentHero,ConsumableStack} from '../shared/types.js';
import {MAX_CHARACTERS,type Account,type CharacterSummary,type GoogleIdentity} from '../shared/accounts.js';
import {migrate} from './schema.js';
import {BAG_CAPACITY,STASH_CAPACITY,backpackItems} from '../public/rules.js';
import {CONSUMABLE_LIMIT,validateConsumables,backpackUsage,consumableKindQuantity} from '../public/game/consumables.js';
import {defaultAfkPreferences,parseAfkPreferences} from '../public/game/afk-preferences.js';

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
const numeric=(value:unknown)=>Number(value);
const optional=<T>(value:T|null|undefined)=>value===null||value===undefined?undefined:value;

export class StoreConflictError extends Error{
  constructor(message='Hero storage revision or identity conflict'){super(message);this.name='StoreConflictError';}
}
export class CharacterLimitError extends StoreConflictError{
  constructor(){super('Account character limit reached');this.name='CharacterLimitError';}
}
export class StoreUnavailableError extends Error{
  constructor(message='Hero storage unavailable'){super(message);this.name='StoreUnavailableError';}
}
export interface CommitEntry {accountId:string;hero:PersistentHero;expectedRevision:number}
export interface CommitReceipt {id:string;revision:number}
export interface HeroStore{
  load(heroId:string,accountId:string):Promise<{hero:PersistentHero;revision:number}|null>;
  upsertGoogleAccount(identity:GoogleIdentity):Promise<Account>;
  listHeroes(accountId:string):Promise<CharacterSummary[]>;
  createSession(accountId:string,tokenHash:string,expiresAt:Date):Promise<void>;
  findSession(tokenHash:string):Promise<{account:Account;expiresAt:number}|null>;
  deleteSession(tokenHash:string):Promise<void>;
  commit(entries:CommitEntry[],operationId:string,reason?:string):Promise<CommitReceipt[]>;
  schemaVersion():Promise<number>;
  health():Promise<boolean>;
  close():Promise<void>;
}

function checkEntry(entry:CommitEntry):void{
  const {hero,expectedRevision}=entry;
  if(typeof entry.accountId!=='string'||!entry.accountId)throw new Error('Account is required');
  if(!hero||typeof hero.id!=='string'||!hero.id||!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new Error('Invalid hero commit entry');
  if(!Array.isArray(hero.items)||!Array.isArray(hero.pendingItems)||!Array.isArray(hero.stash))throw new Error('Invalid hero inventory');
  const all=[...hero.items,...hero.pendingItems],ids=new Set<string>();
  if(hero.items.length>22+STASH_CAPACITY||hero.pendingItems.length>16||hero.stash.length>STASH_CAPACITY)throw new Error('Inventory capacity exceeded');
  for(const item of all){if(!item||typeof item.id!=='string'||!item.id||ids.has(item.id)||!slots.includes(item.slot))throw new Error('Invalid or duplicate item');ids.add(item.id);}
  const worn=new Set<string>();
  for(const slot of slots){const id=hero.equipment?.[slot];if(id){const item=hero.items.find(item=>item.id===id);if(!item||item.slot!==slot||worn.has(id))throw new Error('Invalid equipped item');worn.add(id);}}
  const stashIds=new Set(hero.stash);
  if(stashIds.size!==hero.stash.length||hero.stash.some(id=>typeof id!=='string'||!hero.items.some(item=>item.id===id)||worn.has(id)))throw new Error('Invalid stash references');
  if(backpackItems(hero).length>BAG_CAPACITY)throw new Error('Backpack capacity exceeded');
  if(!Number.isSafeInteger(hero.potions)||hero.potions<0||hero.potions>CONSUMABLE_LIMIT||!Number.isSafeInteger(hero.manaPotions)||hero.manaPotions<0||hero.manaPotions>CONSUMABLE_LIMIT||!Number.isFinite(hero.manaPotionCooldown)||hero.manaPotionCooldown<0)throw new Error('Invalid consumables');
  validateConsumables(hero.consumableInventory,hero.quickSlots);
  if(hero.potions!==consumableKindQuantity(hero,'hp')||hero.manaPotions!==consumableKindQuantity(hero,'mana'))throw new Error('Consumable counters must match inventory');
  if(hero.consumableInventory.some(stack=>ids.has(stack.id)))throw new Error('Duplicate item and consumable identity');
  if(!Number.isSafeInteger(hero.consumableOverflow)||hero.consumableOverflow<0||hero.consumableOverflow>2||backpackUsage(hero)>BAG_CAPACITY+hero.consumableOverflow)throw new Error('Backpack capacity exceeded');
  if(!parseAfkPreferences(hero.afkPreferences,hero.classId))throw new Error('Invalid AFK preferences');
}
function heroValues(hero:PersistentHero,accountId:string):unknown[]{
  const a=hero.allocatedStats;
  return [hero.id,accountId,hero.schemaVersion,hero.name,hero.classId,hero.level,hero.xp,hero.gold,hero.kills,hero.statRevision,
    a.strength,a.dexterity,a.vitality,a.energy,hero.x,hero.z,hero.yaw,hero.weapon,hero.hp,hero.mana,hero.potions,
    hero.potionCooldown,hero.manaPotions,hero.manaPotionCooldown,hero.specialCooldown,hero.dead,hero.combatUntil,hero.attackSerial,hero.running,hero.questKills,
    hero.boss,hero.questClaimed,JSON.stringify(hero.skillCooldowns??{}),hero.attack===null?null:JSON.stringify(hero.attack),JSON.stringify(hero.afkPreferences),hero.quickSlots.q,hero.quickSlots.w,Math.min(hero.consumableOverflow,Math.max(0,backpackUsage(hero)-BAG_CAPACITY))];
}
const heroColumns=`id,account_id,schema_version,name,class_id,level,xp,gold,kills,stat_revision,
  strength,dexterity,vitality,energy,x,z,yaw,weapon,hp,mana,potions,potion_cooldown,mana_potions,mana_potion_cooldown,special_cooldown,dead,
  combat_until,attack_serial,running,quest_kills,boss,quest_claimed,skill_cooldowns,attack,afk_preferences,quick_slot_q,quick_slot_w,consumable_overflow`;
const updateColumns=heroColumns.split(',').map(s=>s.trim()).filter(s=>s!=='id'&&s!=='account_id');

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
  const stashPositions=new Map(hero.stash.map((id,index)=>[id,index]));
  for(const item of hero.items){
    const equipped=hero.equipment?.[item.slot]===item.id;
    const stashPosition=stashPositions.get(item.id);
    const kind=equipped?'equipped':stashPosition===undefined?'bag':'stash';
    await client.query(`INSERT INTO inventory_locations(item_id,hero_id,kind,position,equipped_slot)
      VALUES ($1,$2,$3,$4,$5)`,[item.id,hero.id,kind,equipped?null:stashPosition??bag++,equipped?item.slot:null]);
  }
  for(let position=0;position<hero.pendingItems.length;position++){
    const item=hero.pendingItems[position];
    await client.query(`INSERT INTO inventory_locations(item_id,hero_id,kind,position,equipped_slot)
      VALUES ($1,$2,'pending',$3,NULL)`,[item.id,hero.id,position]);
  }
  return {gained,lost};
}

async function writeConsumables(client:PoolClient,hero:PersistentHero):Promise<void>{
  // Keep stable stack IDs while changing quantities; a foreign hero cannot reuse one.
  const previous=await client.query<{id:string;definition_id:string}>('SELECT id,definition_id FROM consumable_stacks WHERE hero_id=$1',[hero.id]);
  const old=new Map(previous.rows.map(row=>[row.id,row.definition_id]));
  for(const stack of hero.consumableInventory)if(old.has(stack.id)&&old.get(stack.id)!==stack.definitionId)throw new StoreConflictError('Consumable stack definition changed');
  const ids=hero.consumableInventory.map(stack=>stack.id);
  await client.query('DELETE FROM consumable_stacks WHERE hero_id=$1 AND NOT(id=ANY($2::text[]))',[hero.id,ids]);
  await client.query('UPDATE consumable_stacks SET stack_index=stack_index+1000 WHERE hero_id=$1',[hero.id]);
  for(let index=0;index<hero.consumableInventory.length;index++){
    const stack=hero.consumableInventory[index];
    if(old.has(stack.id))await client.query('UPDATE consumable_stacks SET quantity=$1,stack_index=$2 WHERE hero_id=$3 AND id=$4',[stack.quantity,index,hero.id,stack.id]);
    else await client.query('INSERT INTO consumable_stacks(id,hero_id,definition_id,quantity,stack_index) VALUES ($1,$2,$3,$4,$5)',[stack.id,hero.id,stack.definitionId,stack.quantity,index]);
  }
}

async function readHero(client:PoolClient,heroId:string,accountId:string):Promise<{hero:PersistentHero;revision:number}|null>{
  const result=await client.query('SELECT * FROM heroes WHERE id=$1 AND account_id=$2',[heroId,accountId]);
  const row=result.rows[0];if(!row)return null;
  const inventory=await client.query(`SELECT i.*,l.kind,l.position,l.equipped_slot FROM item_instances i
    JOIN inventory_locations l ON l.item_id=i.id AND l.hero_id=i.hero_id WHERE i.hero_id=$1 ORDER BY i.item_index`,[row.id]);
  const itemIds=inventory.rows.map(item=>item.id);
  const rolls=itemIds.length?await client.query(`SELECT * FROM item_rolls WHERE item_id = ANY($1::text[]) ORDER BY item_id,ordinal`,[itemIds]):{rows:[]};
  const byItem=new Map<string,Item['rolls']>();
  for(const roll of rolls.rows){const list=byItem.get(roll.item_id)??[];list.push({key:roll.stat_key,value:numeric(roll.value),min:numeric(roll.min_value),max:numeric(roll.max_value),...(roll.step===null?{}:{step:numeric(roll.step)})});byItem.set(roll.item_id,list);}
  const items:Item[]=[],pendingItems:Item[]=[],equipment:PersistentHero['equipment']={},stashLocations:{id:string;position:number}[]=[];
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
    if(raw.kind==='stash')stashLocations.push({id:item.id,position:raw.position});
  }
  const stackRows=await client.query<{id:string;definition_id:string;quantity:number}>('SELECT id,definition_id,quantity FROM consumable_stacks WHERE hero_id=$1 ORDER BY stack_index',[row.id]);
  const consumableInventory:ConsumableStack[]=stackRows.rows.map(stack=>({id:stack.id,definitionId:stack.definition_id,quantity:stack.quantity}));
  const stash=stashLocations.sort((a,b)=>a.position-b.position).map(location=>location.id);
  const hero:PersistentHero={
    schemaVersion:row.schema_version,id:row.id,name:row.name,classId:row.class_id,level:row.level,
    xp:numeric(row.xp),gold:numeric(row.gold),kills:row.kills,items,pendingItems,stash,equipment,consumableInventory,quickSlots:{q:row.quick_slot_q,w:row.quick_slot_w},consumableOverflow:row.consumable_overflow,
    allocatedStats:{strength:row.strength,dexterity:row.dexterity,vitality:row.vitality,energy:row.energy},statRevision:row.stat_revision,
    x:row.x,z:row.z,yaw:row.yaw,weapon:row.weapon,hp:row.hp,mana:row.mana,potions:consumableKindQuantity({consumableInventory},'hp'),
    potionCooldown:row.potion_cooldown,manaPotions:consumableKindQuantity({consumableInventory},'mana'),manaPotionCooldown:row.mana_potion_cooldown,specialCooldown:row.special_cooldown,skillCooldowns:row.skill_cooldowns,
    dead:row.dead,combatUntil:row.combat_until,attack:row.attack,attackSerial:row.attack_serial,
    running:row.running,questKills:row.quest_kills,boss:row.boss,questClaimed:row.quest_claimed,
    afkPreferences:parseAfkPreferences(row.afk_preferences,row.class_id)??defaultAfkPreferences(row.class_id)
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
  async load(heroId:string,accountId:string){return this.withClient(client=>readHero(client,heroId,accountId));}
  async upsertGoogleAccount(identity:GoogleIdentity):Promise<Account>{
    if(!identity||typeof identity.sub!=='string'||!identity.sub||identity.sub.length>255||typeof identity.email!=='string'||!identity.email||identity.email.length>320||typeof identity.name!=='string'||!identity.name||identity.name.length>256)throw new Error('Invalid Google identity');
    return this.withClient(async client=>{
      const result=await client.query<Account>(`INSERT INTO accounts(id,google_sub,email,name) VALUES ($1,$2,$3,$4)
        ON CONFLICT(google_sub) DO UPDATE SET email=EXCLUDED.email,name=EXCLUDED.name,updated_at=now()
        RETURNING id,email,name`,[randomUUID(),identity.sub,identity.email,identity.name]);
      return result.rows[0];
    });
  }
  async listHeroes(accountId:string):Promise<CharacterSummary[]>{
    return this.withClient(async client=>(await client.query<CharacterSummary>('SELECT id,name,class_id AS "classId",level FROM heroes WHERE account_id=$1 ORDER BY account_slot',[accountId])).rows);
  }
  async createSession(accountId:string,tokenHash:string,expiresAt:Date):Promise<void>{
    if(!/^[0-9a-f]{64}$/.test(tokenHash)||!Number.isFinite(expiresAt.getTime())||expiresAt.getTime()<=Date.now())throw new Error('Invalid account session');
    await this.withClient(async client=>{await client.query('INSERT INTO account_sessions(token_hash,account_id,expires_at) VALUES ($1,$2,$3)',[tokenHash,accountId,expiresAt]);});
  }
  async findSession(tokenHash:string):Promise<{account:Account;expiresAt:number}|null>{
    if(!/^[0-9a-f]{64}$/.test(tokenHash))return null;
    return this.withClient(async client=>{
      const result=await client.query<Account&{expires_at:Date}>(`SELECT a.id,a.email,a.name,s.expires_at FROM account_sessions s
        JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.expires_at>now()`,[tokenHash]);
      const row=result.rows[0];return row?{account:{id:row.id,email:row.email,name:row.name},expiresAt:row.expires_at.getTime()}:null;
    });
  }
  async deleteSession(tokenHash:string):Promise<void>{
    await this.withClient(async client=>{await client.query('DELETE FROM account_sessions WHERE token_hash=$1',[tokenHash]);});
  }
  async commit(entries:CommitEntry[],operationId:string,reason?:string):Promise<CommitReceipt[]>{
    if(!Array.isArray(entries)||!entries.length||typeof operationId!=='string'||!operationId.length||operationId.length>256)throw new Error('Invalid hero operation');
    entries.forEach(checkEntry);
    if(/(?:https?|wss?):\/\//i.test(operationId)||reason&&/(?:https?|wss?):\/\//i.test(reason))
      throw new Error('Operation metadata cannot contain URLs');
    const idSet=new Set(entries.map(entry=>entry.hero.id));
    if(idSet.size!==entries.length)throw new Error('Duplicate hero in operation');
    const payloadHash=digest(canonical({entries:entries.map(entry=>({accountId:entry.accountId,hero:entry.hero,expectedRevision:entry.expectedRevision})).sort((a,b)=>a.hero.id.localeCompare(b.hero.id)),reason:reason??null}));
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
        // Stable account lock order prevents concurrent sixth characters and batch deadlocks.
        for(const accountId of [...new Set(entries.map(entry=>entry.accountId))].sort()){
          const owner=await client.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE',[accountId]);
          if(!owner.rowCount)throw new StoreConflictError('Account does not exist');
        }
        const receipt:CommitReceipt[]=[],changes:unknown[]=[];
        for(let i=0;i<entries.length;i++){
          const {hero,expectedRevision,accountId}=entries[i],values=heroValues(hero,accountId);
          const before=await client.query<{gold:string;revision:string;class_id:string;account_id:string|null;consumable_overflow:number}>(
            'SELECT gold,revision,class_id,account_id,consumable_overflow FROM heroes WHERE id=$1 FOR UPDATE',[hero.id]);
          if(hero.consumableOverflow>(before.rows[0]?.consumable_overflow??0))throw new StoreConflictError('Consumable overflow cannot increase');
          if(expectedRevision===0){
            if(before.rowCount)throw new StoreConflictError('Hero already exists');
            const count=await client.query<{count:string}>('SELECT count(*) FROM heroes WHERE account_id=$1',[accountId]);
            if(Number(count.rows[0].count)>=MAX_CHARACTERS)throw new CharacterLimitError();
            const placeholders=values.map((_,n)=>`$${n+1}`).join(',');
            await client.query(`INSERT INTO heroes(${heroColumns}) VALUES (${placeholders})`,values);
            receipt.push({id:hero.id,revision:1});
          }else{
            if(!before.rowCount||numeric(before.rows[0].revision)!==expectedRevision)throw new StoreConflictError('Stale hero revision');
            if(before.rows[0].account_id!==accountId)throw new StoreConflictError('Hero belongs to another account');
            if(before.rows[0].class_id!==hero.classId)throw new StoreConflictError('Hero class cannot change');
            const columns=updateColumns.map((column,n)=>`${column}=$${n+1}`).join(',');
            const params=values.slice(2);
            const updated=await client.query(`UPDATE heroes SET ${columns},revision=revision+1,updated_at=now()
              WHERE id=$${params.length+1} AND account_id=$${params.length+2} AND revision=$${params.length+3}
              RETURNING revision`,[...params,hero.id,accountId,expectedRevision]);
            if(!updated.rowCount)throw new StoreConflictError('Hero ownership or revision conflict');
            receipt.push({id:hero.id,revision:numeric(updated.rows[0].revision)});
          }
          const inventory=await writeInventory(client,hero);
          await writeConsumables(client,hero);
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
      const schema=await client.query<{version:number}>('SELECT max(version)::integer AS version FROM schema_migrations');
      return !!result.rowCount&&schema.rows[0]?.version===5;
    });}catch{if(this.writer)this.lost=true;return false;}
  }
  async schemaVersion():Promise<number>{
    return this.withClient(async client=>{
      const result=await client.query<{version:number}>('SELECT max(version)::integer AS version FROM schema_migrations');
      return result.rows[0]?.version??0;
    });
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
    if(writer){
      const result=await client.query<{locked:boolean}>(lockSql);
      if(!result.rows[0]?.locked)throw new StoreUnavailableError('Another world writer owns this database');
      await migrate(client);
      client.on('error',()=>{});
      return new PostgresHeroStore(pool,client);
    }
    await migrate(client);
    client.release();return new PostgresHeroStore(pool,null);
  }catch(error){if(client)client.release();await pool.end().catch(()=>{});throw error;}
}
