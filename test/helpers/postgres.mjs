import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {openHeroStore} from '../../dist/storage/postgres.js';

// The runner supplies a disposable PostgreSQL cluster or admin database. Every
// test creates its own database so concurrent node:test workers cannot share heroes.
export const hasTestDatabase=Boolean(process.env.GAME_TEST_DATABASE_URL);

export async function createTestDatabase(){
  const adminUrl=process.env.GAME_TEST_DATABASE_URL;
  assert(adminUrl,'GAME_TEST_DATABASE_URL is required for PostgreSQL integration tests');
  const name=`ashen_test_${randomBytes(12).toString('hex')}`;
  const url=new URL(adminUrl);
  url.pathname=`/${name}`;
  const admin=new Client({connectionString:adminUrl});
  await admin.connect();
  try{await admin.query(`CREATE DATABASE ${name}`);}
  catch(error){await admin.end();throw error;}
  let closed=false;
  async function withStore(action){
    assert(!closed,'Test database is closed');
    const store=await openHeroStore({connectionString:url.href});
    try{return await action(store);}finally{await store.close();}
  }
  return {
    url:url.href,
    name,
    async seed(token,hero){
      const operationId=randomUUID();
      return withStore(store=>store.commit([{token,hero,expectedRevision:0}],operationId,'test fixture'));
    },
    load(token){return withStore(store=>store.load(token));},
    async close(){
      if(closed)return;
      closed=true;
      assert(/^ashen_test_[a-f0-9]{24}$/.test(name),'Refusing to drop a database outside the test namespace');
      try{
        await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',[name]);
        await admin.query(`DROP DATABASE ${name}`);
      }finally{await admin.end();}
    }
  };
}
