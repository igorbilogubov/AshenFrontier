import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import pg from 'pg';
import {openHeroStore,StoreConflictError,StoreUnavailableError} from '../dist/storage/postgres.js';
import {newHero,persistentHero} from '../dist/world.js';
import {rollEquipment} from '../dist/public/game/equipment-items.js';

const adminUrl=process.env.GAME_TEST_DATABASE_URL;
async function database(){
  const name=`ashen_test_${randomBytes(12).toString('hex')}`;
  const admin=new pg.Client({connectionString:adminUrl});
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  const url=new URL(adminUrl);url.pathname=`/${name}`;
  return {url:url.toString(),admin,close:async()=>{
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await admin.end();
  }};
}
const account=async store=>(await store.upsertGoogleAccount({sub:randomUUID(),email:'test@example.com',name:'Test'})).id;
const hero=(name,classId='warrior')=>persistentHero(newHero(name,classId));
const commit=(store,accountId,value,revision,operationId=randomUUID(),reason)=>
  store.commit([{accountId,hero:value,expectedRevision:revision}],operationId,reason);

test('normalized hero, rolls, bag, equipped gear and pending loot survive exact round trip',
  {skip:!adminUrl},async()=>{
  const db=await database(),store=await openHeroStore({connectionString:db.url});
  try{
    const token=await account(store),value=hero('Хранитель','mage');
    const bag=rollEquipment('moon-amulet',randomUUID(),()=>.6);
    const pending=rollEquipment('runekeeper-crown',randomUUID(),()=>.3);
    value.items.push(bag);value.pendingItems.push(pending);
    value.gold=13;value.skillCooldowns={'mage-fireball':1.25};
    const receipt=await commit(store,token,value,0,randomUUID(),'test reward');
    assert.deepEqual(receipt,[{id:value.id,revision:1}]);
    assert.deepEqual(await store.load(value.id,token),{hero:value,revision:1});
    assert.equal(await store.load(randomUUID(),token),null);
    const client=new pg.Client({connectionString:db.url});await client.connect();
    try{
      assert.equal(Number((await client.query('SELECT count(*) AS n FROM item_instances WHERE hero_id=$1',[value.id])).rows[0].n),4);
      assert.equal(Number((await client.query('SELECT count(*) AS n FROM item_rolls WHERE item_id=$1',[bag.id])).rows[0].n),2);
      const locations=(await client.query('SELECT kind FROM inventory_locations WHERE hero_id=$1 ORDER BY kind',[value.id])).rows.map(r=>r.kind);
      assert.deepEqual(locations,['bag','equipped','equipped','pending']);
    }finally{await client.end();}
  }finally{await store.close();await db.close();}
});

test('journal replay, stale revisions and a failed batch leave no partial economic changes',
  {skip:!adminUrl},async()=>{
  const db=await database(),store=await openHeroStore({connectionString:db.url});
  try{
    const first=hero('Первый'),second=hero('Второй','archer'),a=await account(store),b=await account(store),op=randomUUID();
    const entries=[{accountId:a,hero:first,expectedRevision:0},{accountId:b,hero:second,expectedRevision:0}];
    const receipt=await store.commit(entries,op,'initial');
    assert.deepEqual(await store.commit(entries,op,'initial'),receipt);
    await assert.rejects(()=>store.commit([{...entries[0],hero:{...first,gold:7}},...entries.slice(1)],op,'initial'),StoreConflictError);
    const changed={...first,gold:50};
    await assert.rejects(()=>store.commit([
      {accountId:a,hero:changed,expectedRevision:1},{accountId:b,hero:{...second,gold:99},expectedRevision:0}
    ],randomUUID(),'failed batch'),StoreConflictError);
    assert.equal((await store.load(first.id,a)).hero.gold,0);assert.equal((await store.load(second.id,b)).hero.gold,0);
    const success=await commit(store,a,changed,1,randomUUID(),'quest payout');
    assert.deepEqual(success,[{id:first.id,revision:2}]);
    await assert.rejects(()=>commit(store,a,{...changed,gold:1},1),StoreConflictError);
  }finally{await store.close();await db.close();}
});

test('SQL ownership, positions and immutable rolled stats reject direct tampering',
  {skip:!adminUrl},async()=>{
  const db=await database(),store=await openHeroStore({connectionString:db.url});
  try{
    const a=hero('A'),b=hero('B'),tokenA=await account(store),tokenB=await account(store);
    const ring=rollEquipment('copper-ring',randomUUID(),()=>.4),other=rollEquipment('ember-amulet',randomUUID(),()=>.2);
    a.items.push(ring,other);
    await store.commit([{accountId:tokenA,hero:a,expectedRevision:0},{accountId:tokenB,hero:b,expectedRevision:0}],randomUUID());
    const client=new pg.Client({connectionString:db.url});await client.connect();
    try{
      await assert.rejects(()=>client.query('UPDATE inventory_locations SET hero_id=$1 WHERE item_id=$2',[b.id,ring.id]),e=>e.code==='23503');
      await assert.rejects(()=>client.query('UPDATE inventory_locations SET position=0 WHERE item_id=$1',[other.id]),e=>e.code==='23505');
      await assert.rejects(()=>client.query('UPDATE item_rolls SET value=value+1 WHERE item_id=$1',[ring.id]),e=>e.code==='23514');
      await assert.rejects(()=>client.query(`INSERT INTO item_rolls(item_id,ordinal,stat_key,value,min_value,max_value)
        VALUES ($1,10,'attack',1,1,1)`,[ring.id]),e=>e.code==='23514');
      await assert.rejects(()=>client.query('DELETE FROM item_rolls WHERE item_id=$1',[ring.id]),e=>e.code==='23514');
      await assert.rejects(()=>client.query('UPDATE item_instances SET power=power+1 WHERE id=$1',[ring.id]),e=>e.code==='23514');
    }finally{await client.end();}
    const equipped=structuredClone(a);equipped.equipment.ring=ring.id;
    await commit(store,tokenA,equipped,1);
    assert.deepEqual((await store.load(a.id,tokenA)).hero.items.find(item=>item.id===ring.id),ring);
    const sold=structuredClone(equipped);sold.equipment.ring=null;sold.items=sold.items.filter(item=>item.id!==ring.id);
    await commit(store,tokenA,sold,2);
    assert.equal((await store.load(a.id,tokenA)).hero.items.some(item=>item.id===ring.id),false);
    const resurrected=structuredClone(sold);resurrected.items.push(ring);
    await assert.rejects(()=>commit(store,tokenA,resurrected,3),StoreConflictError);
  }finally{await store.close();await db.close();}
});

test('one retained writer owns the world lock; losing its session disables writes',
  {skip:!adminUrl},async()=>{
  const db=await database(),writer=await openHeroStore({connectionString:db.url,writer:true});
  try{
    assert.equal(await writer.health(),true);
    await assert.rejects(()=>openHeroStore({connectionString:db.url,writer:true}),StoreUnavailableError);
    const client=new pg.Client({connectionString:db.url});await client.connect();
    try{
      const lock=(await client.query(`SELECT pid FROM pg_locks WHERE locktype='advisory' AND classid=8675309::oid
        AND objid=4732::oid AND mode='ExclusiveLock' AND granted
        AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`)).rows[0];
      assert(lock);
      await client.query('SELECT pg_terminate_backend($1)',[lock.pid]);
    }finally{await client.end();}
    assert.equal(await writer.health(),false);
    await assert.rejects(()=>commit(writer,randomUUID(),hero('Недоступен'),0),StoreUnavailableError);
  }finally{await writer.close();await db.close();}
});
