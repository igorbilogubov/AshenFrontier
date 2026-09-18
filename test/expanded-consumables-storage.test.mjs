import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {newHero,persistentHero} from '../dist/world.js';
import {CONSUMABLE_CATALOG,CONSUMABLE_STACK_LIMIT} from '../dist/public/game/consumables.js';
import {openHeroStore} from '../dist/storage/postgres.js';
import {createTestDatabase,hasTestDatabase} from './helpers/postgres.mjs';
import {removeExpandedConsumableSchema,testAccount} from './helpers/historical-schema.mjs';

test('schema 7 expands potion storage and persists all eight large stacks and quick slots', {skip:!hasTestDatabase},async()=>{
  const db=await createTestDatabase();let store;
  const sql=new pg.Client({connectionString:db.url});
  try{
    store=await openHeroStore({connectionString:db.url});
    const accountId=await testAccount(store),p=newHero('Запас зелий','mage');
    for(const stack of p.consumableInventory)stack.quantity=50;
    const original=persistentHero(p);
    await store.commit([{accountId,hero:original,expectedRevision:0}],randomUUID());
    await store.close();store=null;await sql.connect();
    await removeExpandedConsumableSchema(sql);
    await assert.rejects(()=>sql.query('UPDATE consumable_stacks SET quantity=51 WHERE hero_id=$1',[p.id]),error=>error.code==='23514');
    store=await openHeroStore({connectionString:db.url});
    assert.equal(await store.schemaVersion(),10);
    assert.deepEqual((await store.load(p.id,accountId)).hero,original);
    p.consumableInventory=Object.values(CONSUMABLE_CATALOG).filter(def=>def.kind!=='material').map(def=>({id:randomUUID(),definitionId:def.id,quantity:CONSUMABLE_STACK_LIMIT}));
    assert.equal(p.consumableInventory.length,8);
    p.quickSlots={q:'hp-greater',w:'mana-large'};
    const expanded=persistentHero(p);
    assert.equal(expanded.potions,3996);assert.equal(expanded.manaPotions,3996);
    await store.commit([{accountId,hero:expanded,expectedRevision:1}],randomUUID());
    await store.close();store=await openHeroStore({connectionString:db.url});
    assert.deepEqual((await store.load(p.id,accountId)).hero,expanded);
    await assert.rejects(()=>sql.query('UPDATE consumable_stacks SET quantity=1000 WHERE hero_id=$1',[p.id]),error=>error.code==='23514');
    await assert.rejects(()=>sql.query('UPDATE heroes SET potions=3997 WHERE id=$1',[p.id]),error=>error.code==='23514');
    await assert.rejects(()=>sql.query('UPDATE heroes SET mana_potions=3997 WHERE id=$1',[p.id]),error=>error.code==='23514');
  }finally{await sql.end();await store?.close();await db.close();}
});

test('schema 7 waits for the previous world writer to stop', {skip:!hasTestDatabase},async()=>{
  const db=await createTestDatabase();let store;
  const sql=new pg.Client({connectionString:db.url});
  try{
    store=await openHeroStore({connectionString:db.url});await store.close();store=null;
    await sql.connect();await removeExpandedConsumableSchema(sql);
    await sql.query('SELECT pg_advisory_lock(8675309,4732)');
    await assert.rejects(()=>openHeroStore({connectionString:db.url}),/writer/i);
    assert.equal((await sql.query('SELECT max(version) AS version FROM schema_migrations')).rows[0].version,6);
    await sql.query('SELECT pg_advisory_unlock(8675309,4732)');
    store=await openHeroStore({connectionString:db.url,writer:true});assert.equal(await store.schemaVersion(),10);
  }finally{await sql.end();await store?.close();await db.close();}
});
