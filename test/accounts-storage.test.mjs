import {removeBuildSchema} from './helpers/historical-schema.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import pg from 'pg';
import {openHeroStore,StoreConflictError,CharacterLimitError} from '../dist/storage/postgres.js';
import {newHero,persistentHero} from '../dist/world.js';
import {createTestDatabase,hasTestDatabase} from './helpers/postgres.mjs';

const identity=()=>({sub:randomUUID(),email:'same@example.com',name:'Игрок'});
const hero=(name='Герой')=>persistentHero(newHero(name,'warrior'));
const write=(store,accountId,value,revision=0)=>store.commit([{accountId,hero:value,expectedRevision:revision}],randomUUID());
async function fixture(action){
  const db=await createTestDatabase(),store=await openHeroStore({connectionString:db.url});
  try{await action(store,db);}finally{await store.close();await db.close();}
}

test('Google subject owns identity; email changes preserve account and equal emails do not merge', {skip:!hasTestDatabase},()=>fixture(async store=>{
  const google=identity(),account=await store.upsertGoogleAccount(google);
  assert.deepEqual(await store.upsertGoogleAccount({...google,email:'changed@example.com',name:'Новое имя'}),{...account,email:'changed@example.com',name:'Новое имя'});
  const other=await store.upsertGoogleAccount({...google,sub:randomUUID()});
  assert.notEqual(account.id,other.id);
  const value=hero();await write(store,account.id,value);
  assert.equal(await store.load(value.id,other.id),null);
  assert.deepEqual(await store.listHeroes(other.id),[]);
  assert.deepEqual(await store.listHeroes(account.id),[{id:value.id,name:value.name,classId:'warrior',level:1}]);
  await assert.rejects(()=>write(store,other.id,{...value,gold:9},1),StoreConflictError);
  assert.equal((await store.load(value.id,account.id)).hero.gold,0);
}));

test('concurrent creation and batch creation cannot exceed five heroes', {skip:!hasTestDatabase},()=>fixture(async(store,db)=>{
  const account=await store.upsertGoogleAccount(identity());
  const second=await openHeroStore({connectionString:db.url});
  try{
    const outcomes=await Promise.allSettled(Array.from({length:12},(_,i)=>write(i%2?store:second,account.id,hero(`Герой ${i}`))));
    assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,5);
    const rejected=outcomes.filter(result=>result.status==='rejected');
    assert(rejected.every(result=>result.reason instanceof CharacterLimitError),rejected.map(result=>`${result.reason.name}: ${result.reason.message}`).join('\n'));
    assert.equal((await store.listHeroes(account.id)).length,5);
    const sql=new pg.Client({connectionString:db.url});await sql.connect();
    try{
      const columns=(await sql.query("SELECT column_name FROM information_schema.columns WHERE table_name='heroes' ORDER BY ordinal_position")).rows.map(row=>row.column_name);
      const source=(await store.listHeroes(account.id))[0].id;
      const projection=columns.map(column=>column==='id'?"'direct-sixth'":column).join(',');
      await assert.rejects(()=>sql.query(`INSERT INTO heroes(${columns.join(',')}) SELECT ${projection} FROM heroes WHERE id=$1`,[source]),e=>e.code==='23514');
    }finally{await sql.end();}
    const empty=await store.upsertGoogleAccount(identity());
    await assert.rejects(()=>store.commit(Array.from({length:6},()=>({accountId:empty.id,hero:hero(),expectedRevision:0})),randomUUID()),CharacterLimitError);
    assert.equal((await store.listHeroes(empty.id)).length,0);
  }finally{await second.close();}
}));

test('sessions store hashes only, expire and can be revoked independently', {skip:!hasTestDatabase},()=>fixture(async(store,db)=>{
  const account=await store.upsertGoogleAccount(identity()),secret=randomUUID(),hash=createHash('sha256').update(secret).digest('hex');
  const expiry=new Date(Date.now()+60000);
  await store.createSession(account.id,hash,expiry);
  assert.deepEqual(await store.findSession(hash),{account,expiresAt:expiry.getTime()});
  assert.equal(await store.findSession(secret),null);
  await assert.rejects(()=>store.createSession(account.id,secret,expiry),/Invalid account session/);
  const client=new pg.Client({connectionString:db.url});await client.connect();
  try{
    assert.equal(JSON.stringify((await client.query('SELECT * FROM account_sessions')).rows).includes(secret),false);
    await client.query("UPDATE account_sessions SET expires_at=now()-interval '1 second'");
    assert.equal(await store.findSession(hash),null);
  }finally{await client.end();}
  const other=createHash('sha256').update(randomUUID()).digest('hex');
  await store.createSession(account.id,other,expiry);await store.deleteSession(other);
  assert.equal(await store.findSession(other),null);
}));

test('schema5 removes guest key access and retains orphaned legacy hero without assigning it', {skip:!hasTestDatabase},()=>fixture(async(store,db)=>{
  const account=await store.upsertGoogleAccount(identity()),value=hero('Старый герой');await write(store,account.id,value);
  const client=new pg.Client({connectionString:db.url});await client.connect();
  try{
    await removeBuildSchema(client);
    // Reconstruct schema4 fixture in this disposable database only.
    await client.query(`DROP TRIGGER character_account_guard ON heroes; DROP FUNCTION assign_character_slot();
      DROP TABLE account_sessions; ALTER TABLE heroes DROP COLUMN account_slot; ALTER TABLE heroes DROP COLUMN account_id;
      DROP TABLE accounts; ALTER TABLE heroes ADD COLUMN token_hash char(64) NOT NULL DEFAULT '${'a'.repeat(64)}' UNIQUE;
      DELETE FROM schema_migrations WHERE version=5;`);
  }finally{await client.end();}
  const migrated=await openHeroStore({connectionString:db.url});
  try{
    assert.equal(await migrated.schemaVersion(),8);
    const newAccount=await migrated.upsertGoogleAccount(identity());
    assert.equal(await migrated.load(value.id,newAccount.id),null);
    assert.deepEqual(await migrated.listHeroes(newAccount.id),[]);
    await assert.rejects(()=>write(migrated,newAccount.id,value,1),StoreConflictError);
    const sql=new pg.Client({connectionString:db.url});await sql.connect();
    try{
      const row=(await sql.query('SELECT id,name,account_id,account_slot FROM heroes WHERE id=$1',[value.id])).rows[0];
      assert.deepEqual(row,{id:value.id,name:value.name,account_id:null,account_slot:null});
      assert.equal((await sql.query("SELECT 1 FROM information_schema.columns WHERE table_name='heroes' AND column_name='token_hash'")).rowCount,0);
      await assert.rejects(()=>sql.query('UPDATE heroes SET account_id=$1,account_slot=1 WHERE id=$2',[newAccount.id,value.id]),e=>e.code==='23514');
    }finally{await sql.end();}
  }finally{await migrated.close();}
}));
