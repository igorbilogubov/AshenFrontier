import test from 'node:test';
import {testAccount,removeAccountSchema,ownMigratedFixture} from './helpers/historical-schema.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {World,newHero,makeLoot,persistentHero,safeHero,stats} from '../dist/world.js';
import {backpackUsage,consumableQuantity,CONSUMABLE_CATALOG,CONSUMABLE_LIMIT,CONSUMABLE_STACK_LIMIT} from '../dist/public/game/consumables.js';
import {shopConsumables} from '../dist/public/game/shop.js';
import {openHeroStore} from '../dist/storage/postgres.js';
import {createTestDatabase,hasTestDatabase} from './helpers/postgres.mjs';

const fixture=()=>{const p=newHero('Зелья'),w=new World();w.add(p);w.mobs=[];return {p,w};};
const fill=p=>{while(backpackUsage(p)<16)p.items.push(makeLoot(p.classId,1,0,'ring'));};

test('catalog exposes four server-authoritative potion sizes for each resource',()=>{
  assert.equal(CONSUMABLE_STACK_LIMIT,999);assert.equal(CONSUMABLE_LIMIT,3996);
  assert.deepEqual(Object.values(CONSUMABLE_CATALOG).map(({id,kind,restore,price,cooldown,stackLimit})=>({id,kind,restore,price,cooldown,stackLimit})),[
    {id:'hp-basic',kind:'hp',restore:45,price:6,cooldown:4,stackLimit:999},
    {id:'hp-medium',kind:'hp',restore:180,price:24,cooldown:4,stackLimit:999},
    {id:'hp-large',kind:'hp',restore:600,price:80,cooldown:4,stackLimit:999},
    {id:'hp-greater',kind:'hp',restore:1800,price:240,cooldown:4,stackLimit:999},
    {id:'mana-basic',kind:'mana',restore:40,price:8,cooldown:4,stackLimit:999},
    {id:'mana-medium',kind:'mana',restore:160,price:32,cooldown:4,stackLimit:999},
    {id:'mana-large',kind:'mana',restore:500,price:100,cooldown:4,stackLimit:999},
    {id:'mana-greater',kind:'mana',restore:1500,price:300,cooldown:4,stackLimit:999}
  ]);
  assert.deepEqual(shopConsumables(),Object.values(CONSUMABLE_CATALOG));
});

test('vendor buys one or fifty bottles atomically by definition and keeps legacy basic purchases',()=>{
  const {p,w}=fixture();w.vendorAvailable=()=>true;p.shopActive=true;p.gold=100000;
  w.command(p,{type:'buyConsumable',definitionId:'hp-large',quantity:50,requestId:'large-50'});
  assert.equal(consumableQuantity(p,'hp-large'),50);assert.equal(p.gold,96000);
  w.command(p,{type:'buyConsumable',definitionId:'hp-large',quantity:50,requestId:'large-50'});
  assert.equal(consumableQuantity(p,'hp-large'),50);assert.equal(p.gold,96000);
  assert.equal(w.buyConsumable(p,'mana-greater','greater-one',1),true);
  assert.equal(consumableQuantity(p,'mana-greater'),1);assert.equal(p.gold,95700);
  assert.equal(w.buyConsumable(p,'mana','legacy-basic'),true);
  assert.equal(consumableQuantity(p,'mana-basic'),4);assert.equal(p.gold,95692);

  for(const [definitionId,quantity] of [['missing',50],['hp-large',2],['hp-large',0],['hp-large',51],['hp-large','50'],['hp-large',null],['hp-large',undefined]]){
    const before=structuredClone(p.consumableInventory),gold=p.gold;
    const message={type:'buyConsumable',definitionId,requestId:`invalid-${definitionId}-${quantity}`};if(quantity!==undefined)message.quantity=quantity;
    w.command(p,message);
    assert.deepEqual(p.consumableInventory,before);assert.equal(p.gold,gold);
  }

  const large=p.consumableInventory.find(stack=>stack.definitionId==='hp-large');large.quantity=950;
  const beforeGold=p.gold;assert.equal(w.buyConsumable(p,'hp-large','over-stack',50),false);
  assert.equal(large.quantity,950);assert.equal(p.gold,beforeGold);
  large.quantity=949;assert.equal(w.buyConsumable(p,'hp-large','fill-stack',50),true);
  assert.equal(large.quantity,999);assert.equal(p.gold,beforeGold-4000);

  const poor=fixture();poor.w.vendorAvailable=()=>true;poor.p.shopActive=true;poor.p.gold=3999;
  const poorInventory=structuredClone(poor.p.consumableInventory);
  assert.equal(poor.w.buyConsumable(poor.p,'hp-large','too-expensive',50),false);
  assert.deepEqual(poor.p.consumableInventory,poorInventory);assert.equal(poor.p.gold,3999);
});

test('larger bottles restore their configured amount and share cooldown by resource kind',()=>{
  const {p,w}=fixture();p.level=100;p.allocatedStats={strength:0,dexterity:0,vitality:250,energy:250};p.consumableInventory.push(
    {id:randomUUID(),definitionId:'hp-large',quantity:1},
    {id:randomUUID(),definitionId:'hp-greater',quantity:1},
    {id:randomUUID(),definitionId:'mana-medium',quantity:1}
  );
  p.quickSlots={q:'hp-large',w:'hp-greater'};p.hp=1;
  assert(w.useConsumable(p,'q'));assert.equal(p.hp,601);assert.equal(p.potionCooldown,4);
  assert.equal(w.useConsumable(p,'w'),false);assert.equal(consumableQuantity(p,'hp-greater'),1);
  p.quickSlots.q='mana-medium';p.mana=0;
  assert(w.useConsumable(p,'q'));assert.equal(p.mana,160);assert.equal(p.manaPotionCooldown,4);
});

test('bottles occupy shared cells; owned type assignment alone neither drinks nor duplicates',()=>{
  const {p,w}=fixture();assert.equal(backpackUsage(p),2);
  const original=structuredClone(p.consumableInventory);p.hp=10;p.mana=0;
  for(const slot of ['q','w'])assert(w.assignConsumable(p,slot,'mana-basic'));
  assert.deepEqual(p.consumableInventory,original);assert.equal(p.hp,10);assert.equal(p.mana,0);
  assert.equal(w.assignConsumable(p,'e','hp-basic'),false);assert.equal(w.assignConsumable(p,'q','missing'),false);
  assert(w.useConsumable(p,'q'));assert.equal(p.mana,40);assert.equal(p.manaPotions,2);assert.equal(p.potions,3);
  p.mana=0;assert.equal(w.useConsumable(p,'w'),false,'same kind shares cooldown across both keys');
  assert(w.assignConsumable(p,'w','hp-basic'));assert(w.useConsumable(p,'w'));assert.equal(p.hp,55);
  assert(w.assignConsumable(p,'w',null));p.hp=1;p.potionCooldown=0;
  assert.equal(w.potion(p,'hp'),false,'AFK cannot consume unassigned HP stock');assert.equal(p.potions,2);
  assert.equal(w.useConsumable(p,'w'),false);
  p.quickSlots={q:'mana-basic',w:'hp-basic'};w.command(p,{type:'potion',kind:'hp'});
  assert.equal(p.hp,46);assert.equal(p.mana,0);assert.equal(p.potions,1);
});

test('empty stacks free a cell and retain their binding; repeated use cannot create negative stock',()=>{
  const {p,w}=fixture();p.consumableInventory.find(stack=>stack.definitionId==='hp-basic').quantity=1;
  p.hp=stats(p).maxHp-1;assert(w.useConsumable(p,'q'));assert.equal(p.hp,stats(p).maxHp);
  assert.equal(p.potions,0);assert.equal(backpackUsage(p),1);assert.equal(p.quickSlots.q,'hp-basic');
  for(let i=0;i<8;i++){p.hp=1;p.potionCooldown=0;assert.equal(w.useConsumable(p,'q'),false);}
  assert.equal(w.assignConsumable(p,'w','hp-basic'),false,'cannot newly assign an unowned type');
  w.vendorAvailable=()=>true;p.shopActive=true;p.gold=100;
  assert(w.buyConsumable(p,'hp','rebuy'));assert.equal(p.potions,1);assert.equal(p.quickSlots.q,'hp-basic');
  assert.equal(w.buyConsumable(p,'hp','rebuy'),false);assert.equal(p.potions,1);assert.equal(p.gold,94);
});

test('all equipment inflows respect bottle cells and existing stacks can be topped up in full bag',()=>{
  const {p,w}=fixture();fill(p);assert.equal(backpackUsage(p),16);assert.equal(p.items.length,16);
  const pending=makeLoot(p.classId,1,0,'helmet');p.pendingItems=[pending];
  w.command(p,{type:'claim'});assert.equal(p.pendingItems.length,1);
  w.command(p,{type:'unequip',id:p.equipment.weapon});assert(p.equipment.weapon);
  w.vendorAvailable=()=>true;p.shopActive=true;p.gold=100;
  assert.equal(w.buy(p,'copper-ring','gear-full'),false);assert(w.buyConsumable(p,'hp','top-up'));
  assert.equal(backpackUsage(p),16);assert.equal(p.potions,4);
  const drop=makeLoot(p.classId,1,0,'ring');w.addGroundDrop(p.id,{id:'drop',kind:'item',item:drop,x:p.x,z:p.z,expiresAt:w.t+1000});
  assert.equal(w.pickUp(p,'drop'),false);assert(w.groundDrop(p,'drop'));
  const stashed=makeLoot(p.classId,1,0,'ring');p.items.push(stashed);p.stash.push(stashed.id);p.stashActive=true;w.chestAvailable=()=>true;
  assert.equal(w.transferStash(p,stashed.id,true),false);assert(p.stash.includes(stashed.id));
  p.consumableInventory=p.consumableInventory.filter(stack=>stack.definitionId!=='hp-basic');fill(p);
  const gold=p.gold;assert.equal(w.buyConsumable(p,'hp','no-cell'),false);assert.equal(p.gold,gold);
});

test('assigned AFK bottles follow resource type after swapping Q/W and honor thresholds',()=>{
  const {p,w}=fixture();Object.assign(p,{x:0,z:-16});assert(w.startAfk(p));p.combatUntil=w.t+10000;
  p.quickSlots={q:'mana-basic',w:'hp-basic'};p.hp=stats(p).maxHp*.1;p.mana=0;
  w.tick(.05,w.t+50);assert.equal(p.potions,2);assert.equal(p.manaPotions,2);
  p.quickSlots={q:null,w:null};p.hp=1;p.mana=0;p.potionCooldown=p.manaPotionCooldown=0;
  w.tick(.05,w.t+50);assert.equal(p.potions,2);assert.equal(p.manaPotions,2);
});

test('schema 3 to 4 migration preserves exact old heroes and full bags, then overflow only shrinks',{skip:!hasTestDatabase},async()=>{
  const db=await createTestDatabase();let store=await openHeroStore({connectionString:db.url});
  let accountId=await testAccount(store);
  try{
    const p=newHero('Старый полный');p.consumableInventory=[];fill(p);p.gold=321;p.level=5;p.allocatedStats={strength:2,dexterity:1,vitality:2,energy:0};p.statRevision=3;p.mana=7;p.hp=31;
    const saved=persistentHero(p);await store.commit([{accountId,hero:saved,expectedRevision:0}],randomUUID());await store.close();store=null;
    const client=new pg.Client({connectionString:db.url});await client.connect();let before;
    try{
      await removeAccountSchema(client);
      await client.query('DROP TABLE consumable_stacks');
      await client.query('ALTER TABLE heroes DROP COLUMN quick_slot_q,DROP COLUMN quick_slot_w,DROP COLUMN consumable_overflow');
      await client.query('DELETE FROM schema_migrations WHERE version=4');
      await client.query('UPDATE heroes SET potions=50,mana_potions=17 WHERE id=$1',[p.id]);
      before=(await client.query('SELECT * FROM heroes WHERE id=$1',[p.id])).rows[0];
    }finally{await client.end();}
    store=await openHeroStore({connectionString:db.url});accountId=await ownMigratedFixture(store,db.url,p.id);const result=await store.load(p.id,accountId),hero=result.hero;
    assert.equal(await store.schemaVersion(),6);assert.equal(await store.health(),true);assert.equal(result.revision,1);
    assert.equal(hero.potions,50);assert.equal(hero.manaPotions,17);assert.equal(hero.consumableOverflow,2);assert.equal(backpackUsage(hero),18);
    assert.deepEqual(hero.items,saved.items);assert.deepEqual(hero.equipment,saved.equipment);assert.deepEqual(hero.allocatedStats,saved.allocatedStats);assert.equal(hero.mana,7);assert.equal(hero.hp,31);assert.equal(hero.gold,321);
    const verify=new pg.Client({connectionString:db.url});await verify.connect();try{const after=(await verify.query('SELECT * FROM heroes WHERE id=$1',[p.id])).rows[0];for(const key of Object.keys(before).filter(key=>key!=='token_hash'))assert.deepEqual(after[key],before[key],key);}finally{await verify.end();}
    const runtime=safeHero(hero);assert.equal(runtime.mana,7);assert.deepEqual(runtime.allocatedStats,saved.allocatedStats);
    const w=new World();w.add(runtime);w.vendorAvailable=()=>true;runtime.shopActive=true;
    assert.equal(w.buy(runtime,'copper-ring','overflow-block'),false);
    runtime.consumableInventory=runtime.consumableInventory.filter(stack=>stack.definitionId!=='mana-basic');
    const shrunk=persistentHero(runtime);assert.equal(shrunk.consumableOverflow,1);
    const entry={accountId,hero:shrunk,expectedRevision:1},op=randomUUID();await store.commit([entry],op);await store.commit([entry],op);
    assert.deepEqual((await store.load(hero.id,accountId)).hero,shrunk);
    const invalid=structuredClone(shrunk);invalid.consumableOverflow=2;
    await assert.rejects(()=>store.commit([{accountId,hero:invalid,expectedRevision:2}],randomUUID()),/overflow cannot increase/);
    await store.close();store=await openHeroStore({connectionString:db.url});assert.deepEqual((await store.load(hero.id,accountId)).hero,shrunk);
  }finally{if(store)await store.close();await db.close();}
});

test('stack IDs, quantities, assignments and economic replay persist atomically in PostgreSQL',{skip:!hasTestDatabase},async()=>{
  const db=await createTestDatabase(),store=await openHeroStore({connectionString:db.url});
  try{
    const {p,w}=fixture(),accountId=await testAccount(store);await store.commit([{accountId,hero:persistentHero(p),expectedRevision:0}],randomUUID());
    const hpId=p.consumableInventory[0].id;p.hp=1;p.quickSlots={q:'mana-basic',w:'hp-basic'};assert(w.useConsumable(p,'w'));
    const hero=persistentHero(p),entry={accountId,hero,expectedRevision:1},op=randomUUID();await store.commit([entry],op);await store.commit([entry],op);
    const loaded=await store.load(hero.id,accountId);assert.equal(loaded.revision,2);assert.deepEqual(loaded.hero,hero);assert.equal(loaded.hero.consumableInventory[0].id,hpId);
    const bad=structuredClone(hero);bad.consumableInventory[0].quantity=-1;
    await assert.rejects(()=>store.commit([{accountId,hero:bad,expectedRevision:2}],randomUUID()),/consumable/);
    assert.equal(consumableQuantity((await store.load(hero.id,accountId)).hero,'hp-basic'),2);
  }finally{await store.close();await db.close();}
});

test('schema 4 migration cannot copy counters while a schema 3 writer is still live',{skip:!hasTestDatabase},async()=>{
  const db=await createTestDatabase(),hero=persistentHero(newHero('Старый writer'));
  let store=await openHeroStore({connectionString:db.url});
  let accountId=await testAccount(store);
  const oldWriter=new pg.Client({connectionString:db.url});await oldWriter.connect();
  try{
    await store.commit([{accountId,hero,expectedRevision:0}],randomUUID());await store.close();store=null;
    await removeAccountSchema(oldWriter);
    await oldWriter.query('DROP TABLE consumable_stacks');
    await oldWriter.query('ALTER TABLE heroes DROP COLUMN quick_slot_q,DROP COLUMN quick_slot_w,DROP COLUMN consumable_overflow');
    await oldWriter.query('DELETE FROM schema_migrations WHERE version=4');
    await oldWriter.query('SELECT pg_advisory_lock(8675309,4732)');
    for(const writer of [true,false])await assert.rejects(()=>openHeroStore({connectionString:db.url,writer}),/writer/i);
    assert.equal(Number((await oldWriter.query('SELECT max(version) AS version FROM schema_migrations')).rows[0].version),3);
    assert.equal((await oldWriter.query("SELECT to_regclass('consumable_stacks') AS name")).rows[0].name,null);
    // The old writer remains able to buy a bottle after a refused new startup.
    await oldWriter.query('UPDATE heroes SET potions=potions+1 WHERE id=$1',[hero.id]);
    await oldWriter.query('SELECT pg_advisory_unlock(8675309,4732)');
    store=await openHeroStore({connectionString:db.url,writer:true});
    accountId=await ownMigratedFixture(store,db.url,hero.id);
    assert.equal((await store.load(hero.id,accountId)).hero.potions,4);assert.equal(await store.health(),true);
    const reader=await openHeroStore({connectionString:db.url});try{assert.equal((await reader.load(hero.id,accountId)).hero.potions,4);}finally{await reader.close();}
  }finally{if(store)await store.close();await oldWriter.end();await db.close();}
});
