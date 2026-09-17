import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {World,newHero,persistentHero,safeHero} from '../dist/world.js';
import {RARE_CLASS_ITEMS,rollEquipment} from '../dist/public/game/equipment-items.js';
import {BAG_SLOT_PRICE,STASH_SLOT_PRICE,DEFAULT_BAG_CAPACITY,DEFAULT_STASH_CAPACITY,MAX_BAG_CAPACITY,MAX_STASH_CAPACITY,clampBagCapacity,clampStashCapacity} from '../dist/public/rules.js';
import {CHEST_APPROACH} from '../dist/public/game/personal-stash.js';
import {createTestDatabase,hasTestDatabase} from './helpers/postgres.mjs';
import {openHeroStore} from '../dist/storage/postgres.js';
import {removeStorageCapacitySchema,testAccount} from './helpers/historical-schema.mjs';
import pg from 'pg';

test('new heroes start with 16 bag cells and 32 chest cells',()=>{
  const p=newHero('Сумка');
  assert.equal(p.bagCapacity,DEFAULT_BAG_CAPACITY);
  assert.equal(p.stashCapacity,DEFAULT_STASH_CAPACITY);
  const restored=safeHero(persistentHero(p));
  assert.equal(restored.bagCapacity,DEFAULT_BAG_CAPACITY);
  assert.equal(restored.stashCapacity,DEFAULT_STASH_CAPACITY);
});

test('legacy saves without capacities keep the starting bag and chest sizes',()=>{
  const p=newHero('Старый');
  const saved=persistentHero(p);
  delete saved.bagCapacity;delete saved.stashCapacity;
  const restored=safeHero(saved);
  assert.equal(restored.bagCapacity,DEFAULT_BAG_CAPACITY);
  assert.equal(restored.stashCapacity,DEFAULT_STASH_CAPACITY);
});

test('inventory plus buys one bag cell for gold',()=>{
  const w=new World({random:()=>0}),p=newHero('Сумка');w.add(p);p.gold=BAG_SLOT_PRICE*2;
  assert.equal(w.command(p,{type:'buyBagSlot'}),undefined);
  assert.equal(p.bagCapacity,DEFAULT_BAG_CAPACITY+1);assert.equal(p.gold,BAG_SLOT_PRICE);
  w.command(p,{type:'buyBagSlot'});assert.equal(p.bagCapacity,DEFAULT_BAG_CAPACITY+2);assert.equal(p.gold,0);
  w.command(p,{type:'buyBagSlot'});assert.equal(p.bagCapacity,DEFAULT_BAG_CAPACITY+2);
  const snapshot=w.snapshot(p.id).self;
  assert.equal(snapshot.bagCapacity,DEFAULT_BAG_CAPACITY+2);
  assert.equal(safeHero(persistentHero(p)).bagCapacity,DEFAULT_BAG_CAPACITY+2);
});

test('chest plus buys one stash cell only while the chest is open',()=>{
  const w=new World({random:()=>0}),p=newHero('Сундук');w.add(p);p.gold=STASH_SLOT_PRICE;
  w.command(p,{type:'buyStashSlot'});assert.equal(p.stashCapacity,DEFAULT_STASH_CAPACITY);assert.equal(p.gold,STASH_SLOT_PRICE);
  Object.assign(p,CHEST_APPROACH);assert(w.openStash(p));
  w.command(p,{type:'buyStashSlot'});assert.equal(p.stashCapacity,DEFAULT_STASH_CAPACITY+1);assert.equal(p.gold,0);
});

test('storage slots stop at the documented maxima',()=>{
  const w=new World({random:()=>0}),p=newHero('Предел');w.add(p);p.gold=1e6;p.bagCapacity=MAX_BAG_CAPACITY;
  w.command(p,{type:'buyBagSlot'});assert.equal(p.bagCapacity,MAX_BAG_CAPACITY);
  Object.assign(p,CHEST_APPROACH);assert(w.openStash(p));
  p.stashCapacity=MAX_STASH_CAPACITY;w.command(p,{type:'buyStashSlot'});assert.equal(p.stashCapacity,MAX_STASH_CAPACITY);
});

test('dead heroes cannot buy bag cells',()=>{
  const w=new World({random:()=>0}),p=newHero('Павший');w.add(p);p.gold=BAG_SLOT_PRICE;p.dead=2.5;p.hp=0;
  w.command(p,{type:'buyBagSlot'});assert.equal(p.bagCapacity,DEFAULT_BAG_CAPACITY);assert.equal(p.gold,BAG_SLOT_PRICE);
});

test('clamp keeps purchased capacities inside the documented range',()=>{
  assert.equal(clampBagCapacity(DEFAULT_BAG_CAPACITY-1),DEFAULT_BAG_CAPACITY);
  assert.equal(clampBagCapacity(MAX_BAG_CAPACITY+8),MAX_BAG_CAPACITY);
  assert.equal(clampStashCapacity(1),DEFAULT_STASH_CAPACITY);
  assert.equal(clampStashCapacity(MAX_STASH_CAPACITY),MAX_STASH_CAPACITY);
});

test('schema 9 stores purchased bag and chest cells and fills defaults for older heroes',{skip:!hasTestDatabase},async()=>{
  const db=await createTestDatabase();let store;
  const sql=new pg.Client({connectionString:db.url});
  try{
    store=await openHeroStore({connectionString:db.url});
    const accountId=await testAccount(store),p=newHero('Расширение');
    p.gold=BAG_SLOT_PRICE+STASH_SLOT_PRICE;
    const w=new World({random:()=>0});w.add(p);
    w.command(p,{type:'buyBagSlot'});
    Object.assign(p,CHEST_APPROACH);assert(w.openStash(p));
    w.command(p,{type:'buyStashSlot'});
    const saved=persistentHero(p);
    await store.commit([{accountId,hero:saved,expectedRevision:0}],randomUUID());
    assert.equal(await store.schemaVersion(),9);
    assert.deepEqual((await store.load(p.id,accountId)).hero.bagCapacity,DEFAULT_BAG_CAPACITY+1);
    assert.equal((await store.load(p.id,accountId)).hero.stashCapacity,DEFAULT_STASH_CAPACITY+1);
    await store.close();store=null;
    await sql.connect();
    await removeStorageCapacitySchema(sql);
    store=await openHeroStore({connectionString:db.url});
    const restored=(await store.load(p.id,accountId)).hero;
    assert.equal(await store.schemaVersion(),9);
    assert.equal(restored.bagCapacity,DEFAULT_BAG_CAPACITY);
    assert.equal(restored.stashCapacity,DEFAULT_STASH_CAPACITY);
  }finally{await sql.end();await store?.close();await db.close();}
});

test('hero normalize commit keeps historical item fingerprints',{skip:!hasTestDatabase},async()=>{
  const db=await createTestDatabase();let store;
  try{
    store=await openHeroStore({connectionString:db.url});
    const accountId=await testAccount(store),p=newHero('Отпечаток');
    const rare=rollEquipment(RARE_CLASS_ITEMS.warrior.find(item=>item.slot==='ring').id,'hist-rare',()=>.4);
    rare.rolls=rare.rolls.slice(0,2);
    p.items.push(rare);
    const first=await store.commit([{accountId,hero:persistentHero(p),expectedRevision:0}],randomUUID());
    const loaded=await store.load(p.id,accountId);
    const normalized=persistentHero(safeHero(loaded.hero));
    assert.equal(normalized.items.find(item=>item.id==='hist-rare').rolls.length,2);
    await store.commit([{accountId,hero:normalized,expectedRevision:first[0].revision}],randomUUID(),'normalize hero');
  }finally{await store?.close();await db.close();}
});
