import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {newHero,persistentHero,safeHero} from '../dist/world.js';
import {defaultSkillBuild} from '../dist/public/game/skill-builds.js';
import {createTestDatabase,hasTestDatabase} from './helpers/postgres.mjs';
import {openHeroStore} from '../dist/storage/postgres.js';
import {removeBuildSchema,testAccount} from './helpers/historical-schema.mjs';

test('schema 6 persists exact loadout, ranked talents, three presets and remaining cooldowns',{skip:!hasTestDatabase},async()=>{
 const db=await createTestDatabase();let store;
 try{
  store=await openHeroStore({connectionString:db.url});const accountId=await testAccount(store),p=newHero('Таланты','mage');
  p.level=86;p.skillBuild={slots:['mage-beam','mage-teleport','mage-mana-shield','mage-mana-source'],talents:{'mage-arcanist-1':2,'mage-arcanist-2':2,'mage-arcanist-3':2,'mage-arcanist-4':2,'mage-arcanist-mastery':1}};
  p.skillPresets=[structuredClone(p.skillBuild),defaultSkillBuild('mage',86),null];p.buildRevision=7;p.skillCooldowns={'mage-teleport':6.4,'mage-ice-step':6.4,'mage-mana-shield':17};
  const original=persistentHero(p);await store.commit([{accountId,hero:original,expectedRevision:0}],randomUUID(),'build fixture');
  const loaded=await store.load(p.id,accountId);assert.equal(await store.schemaVersion(),6);assert.equal(loaded.revision,1);
  assert.deepEqual(loaded.hero.skillBuild,p.skillBuild);assert.deepEqual(loaded.hero.skillPresets,p.skillPresets);assert.equal(loaded.hero.buildRevision,7);assert.deepEqual(loaded.hero.skillCooldowns,p.skillCooldowns);
  const restarted=safeHero(loaded.hero);assert.deepEqual(restarted.skillBuild,p.skillBuild);assert.equal(restarted.effects.length,0);assert.deepEqual(restarted.skillCooldowns,{...p.skillCooldowns,'mage-fireball':0});
  const invalid={...original,skillBuild:{...original.skillBuild,talents:{'mage-arcanist-1':3}}};
  await assert.rejects(()=>store.commit([{accountId,hero:invalid,expectedRevision:1}],randomUUID()),/Invalid skill build/);
  assert.equal((await store.load(p.id,accountId)).revision,1);
 }finally{await store?.close();await db.close();}
});

test('schema5 migration adds legal level-based defaults without granting talents or resetting cooldowns',{skip:!hasTestDatabase},async()=>{
 const db=await createTestDatabase();let store;
 try{
  store=await openHeroStore({connectionString:db.url});const accountId=await testAccount(store),p=newHero('До талантов','archer');p.level=14;p.skillCooldowns={'archer-rain':4.25};
  await store.commit([{accountId,hero:persistentHero(p),expectedRevision:0}],randomUUID());await store.close();store=null;
  const client=new pg.Client({connectionString:db.url});await client.connect();try{await removeBuildSchema(client);}finally{await client.end();}
  store=await openHeroStore({connectionString:db.url});const restored=(await store.load(p.id,accountId)).hero;
  assert.equal(await store.schemaVersion(),6);assert.deepEqual(restored.skillBuild,defaultSkillBuild('archer',14));assert.deepEqual(restored.skillPresets,[null,null,null]);assert.equal(restored.buildRevision,0);assert.deepEqual(restored.skillCooldowns,{'archer-rain':4.25});
  assert.deepEqual(restored.items,p.items);assert.equal(restored.level,14);
  await store.commit([{accountId,hero:restored,expectedRevision:1}],randomUUID());assert.deepEqual((await store.load(p.id,accountId)).hero.skillBuild,restored.skillBuild);
 }finally{await store?.close();await db.close();}
});
