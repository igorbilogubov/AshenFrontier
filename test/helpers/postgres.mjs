import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {Client} from 'pg';
import {newHero,persistentHero} from '../../dist/world.js';
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
  const fixtures=new Map();
  async function identity(label=randomUUID()){
    const account=await withStore(store=>store.upsertGoogleAccount({sub:BigInt('0x'+createHash('sha256').update(label).digest('hex')).toString(),email:`${randomUUID()}@example.invalid`,name:'Test account'}));
    const cookie=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(cookie).digest('hex');
    await withStore(store=>store.createSession(account.id,hash,new Date(Date.now()+86400000)));
    return {account,cookie,sessionHash:hash,fixture:label};
  }
  async function withStore(action){
    assert(!closed,'Test database is closed');
    const store=await openHeroStore({connectionString:url.href});
    try{return await action(store);}finally{await store.close();}
  }
  return {
    url:url.href,
    name,
    withStore,
    identity,
    async seed(label,hero){
      const login=await identity(label);login.heroId=hero.id;fixtures.set(label,login);
      return withStore(store=>store.commit([{accountId:login.account.id,hero,expectedRevision:0}],randomUUID(),'test fixture'));
    },
    load(label){const login=fixtures.get(label);assert(login,'Unknown fixture');return withStore(store=>store.load(login.heroId,login.account.id));},
    async player(claim={}){
      if(claim.fixture&&fixtures.has(claim.fixture))return fixtures.get(claim.fixture);
      if(claim.fixture){const login=await identity();return {...login,heroId:claim.fixture};}
      const hero=persistentHero(newHero(claim.name||'Странник',claim.classId||'warrior'));
      const label=randomUUID(),login=await identity(label);login.heroId=hero.id;fixtures.set(label,login);
      await withStore(store=>store.commit([{accountId:login.account.id,hero,expectedRevision:0}],randomUUID(),'test fixture'));
      return login;
    },
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
