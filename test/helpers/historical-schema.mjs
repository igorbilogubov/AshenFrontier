import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';

export async function testAccount(store){return (await store.upsertGoogleAccount({sub:randomUUID(),email:'fixture@example.invalid',name:'Fixture'})).id;}
async function requireDisposable(client){
  const name=(await client.query('SELECT current_database() AS name')).rows[0].name;
  assert(/^ashen_test_[a-f0-9]{24}$/.test(name),'Historical fixtures require a disposable test database');
}
export async function removeAccountSchema(client){
  await requireDisposable(client);
  await client.query(`DROP TRIGGER character_account_guard ON heroes; DROP FUNCTION assign_character_slot();
    DROP TABLE account_sessions; ALTER TABLE heroes DROP COLUMN account_slot; ALTER TABLE heroes DROP COLUMN account_id;
    DROP TABLE accounts; ALTER TABLE heroes ADD COLUMN token_hash char(64);
    UPDATE heroes SET token_hash=md5(id)||md5(id); ALTER TABLE heroes ALTER COLUMN token_hash SET NOT NULL;
    ALTER TABLE heroes ADD CONSTRAINT legacy_fixture_tokens UNIQUE(token_hash);
    DELETE FROM schema_migrations WHERE version=5;`);
}
// Historical migrations intentionally leave heroes unowned. Assert that boundary,
// then assign a fixture owner using privileged SQL solely to exercise postmigration
// inventory writes. No such claim path exists in the game or storage API.
export async function ownMigratedFixture(store,url,heroId){
  const accountId=await testAccount(store);
  assert.equal(await store.load(heroId,accountId),null);
  const client=new pg.Client({connectionString:url});await client.connect();
  try{
    await requireDisposable(client);
    const row=(await client.query('SELECT account_id,account_slot FROM heroes WHERE id=$1',[heroId])).rows[0];
    assert.deepEqual(row,{account_id:null,account_slot:null});
    await client.query('BEGIN');
    await client.query('ALTER TABLE heroes DISABLE TRIGGER character_account_guard');
    await client.query('UPDATE heroes SET account_id=$1,account_slot=1 WHERE id=$2',[accountId,heroId]);
    await client.query('ALTER TABLE heroes ENABLE TRIGGER character_account_guard');
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
  return accountId;
}
