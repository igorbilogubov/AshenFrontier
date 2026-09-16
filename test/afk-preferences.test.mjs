import {equipLegacySkills} from './helpers/skill-builds.mjs';
import test from 'node:test';
import {testAccount,removeAccountSchema,ownMigratedFixture} from './helpers/historical-schema.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {WebSocket} from 'ws';
import pg from 'pg';
import {World,newHero,makeLoot,persistentHero,stats} from '../dist/world.js';
import {rollEquipment} from '../dist/public/game/equipment-items.js';
import {AFK_SPOTS} from '../dist/public/game/location.js';
import {defaultAfkPreferences,parseAfkPreferences,afkCombatRadius} from '../dist/public/game/afk-preferences.js';
import {createTestDatabase,hasTestDatabase} from './helpers/postgres.mjs';
import {openHeroStore} from '../dist/storage/postgres.js';
import {testPlayer} from './helpers/network.mjs';
import {startTestServer,stopTestServer,until} from './helpers/network.mjs';
const setBottles=(p,kind,quantity)=>{const id=kind==='hp'?'hp-basic':'mana-basic';p.consumableInventory=p.consumableInventory.filter(stack=>stack.definitionId!==id);if(quantity)p.consumableInventory.push({id:crypto.randomUUID(),definitionId:id,quantity});p[kind==='hp'?'potions':'manaPotions']=quantity;};


function fixture(classId='warrior'){
  const w=new World({random:()=>.5}),p=newHero('Настройки',classId),spot=AFK_SPOTS[0];
  w.add(p);Object.assign(p,{x:spot.x,z:spot.z,level:22});equipLegacySkills(p);p.hp=stats(p).maxHp;p.mana=stats(p).maxMana;
  w.mobs=w.mobs.filter(m=>spot.spawnIds.includes(m.id));w.command(p,{type:'afk',enabled:true});assert(p.afk);
  return {w,p,spot};
}
const step=(w,n=1)=>{for(let i=0;i<n;i++)w.tick(.05,w.t+50);};

test('settings reject malformed or foreign class skills while a valid update keeps AFK running',()=>{
  const {w,p}=fixture(),before=structuredClone(p.afkPreferences);
  for(const bad of [
    {...before,skillOrder:['mage-fireball']},
    {...before,skillOrder:['warrior-cleave','warrior-cleave']},
    {...before,pickupRarities:[0,0]},
    {...before,radiusPercent:24},
    {...before,hpPotion:{enabled:true,belowPercent:100}},
    {...before,basicAttackFallback:'yes'}
  ]){
    assert.equal(parseAfkPreferences(bad,p.classId),null);
    w.command(p,{type:'afkPreferences',preferences:bad});assert.deepEqual(p.afkPreferences,before);assert(p.afk);
  }
  const updated={...before,pickupGold:false,skillOrder:[],radiusPercent:25};
  w.command(p,{type:'afkPreferences',preferences:updated});
  assert.deepEqual(p.afkPreferences,updated);assert(p.afk);
  assert(w.events.some(e=>e.type==='preferencesSaved'&&e.ok&&e.owner===p.id));
});

test('AFK respects gold and rarity filters without destroying ignored personal drops',()=>{
  const {w,p}=fixture();w.mobs=[];
  w.command(p,{type:'afkPreferences',preferences:{...p.afkPreferences,pickupGold:false,pickupRarities:[2]}});
  const common=makeLoot('warrior',1,0,'ring'),rare=makeLoot('warrior',1,2,'ring');
  w.addGroundDrop(p.id,{id:'skip-gold',kind:'gold',x:p.x,z:p.z,amount:8,expiresAt:w.t+10000});
  w.addGroundDrop(p.id,{id:'skip-common',kind:'item',x:p.x,z:p.z,item:common,expiresAt:w.t+10000});
  w.addGroundDrop(p.id,{id:'take-rare',kind:'item',x:p.x,z:p.z,item:rare,expiresAt:w.t+10000});
  step(w,5);
  assert(p.afk);assert.equal(p.gold,0);assert(p.items.some(item=>item.id===rare.id));
  assert(!p.items.some(item=>item.id===common.id));
  assert.deepEqual(w.snapshot(p.id).groundLoot.map(drop=>drop.id).sort(),['skip-common','skip-gold']);
});

test('HP and mana thresholds use separate paid bottles and disabled settings never consume',()=>{
  const {w,p}=fixture();w.mobs=[];p.combatUntil=w.t+15000;
  p.hp=stats(p).maxHp*.2;p.mana=stats(p).maxMana*.2;
  w.command(p,{type:'afkPreferences',preferences:{...p.afkPreferences,hpPotion:{enabled:false,belowPercent:35},manaPotion:{enabled:true,belowPercent:25}}});
  step(w);assert.equal(p.potions,3);assert.equal(p.manaPotions,2);assert(p.mana>stats(p).maxMana*.2);
  w.command(p,{type:'afkPreferences',preferences:{...p.afkPreferences,hpPotion:{enabled:true,belowPercent:35},manaPotion:{enabled:false,belowPercent:25}}});
  step(w);assert.equal(p.potions,2);assert.equal(p.manaPotions,2);
});

test('selected skills rotate after success; missing mana and disabled fallback yield no attack',()=>{
  const {w,p,spot}=fixture('mage'),target=w.mobs.find(m=>m.id===spot.spawnIds[0]);
  w.mobs=[target];Object.assign(target,{hp:10000,state:'recover',timer:100,target:p.id});
  p.afkPreferences={...p.afkPreferences,skillOrder:['mage-lightning','mage-fireball'],basicAttackFallback:false};
  assert(w.autoAttack(p));assert.equal(p.attack.skillId,'mage-lightning');assert.equal(p.afk.skillCursor,1);
  p.attack=null;assert(w.autoAttack(p));assert.equal(p.attack.skillId,'mage-fireball');assert.equal(p.afk.skillCursor,0);
  p.attack=null;p.mana=0;const cursor=p.afk.skillCursor;
  assert.equal(w.autoAttack(p),false);assert.equal(p.attack,null);assert.equal(p.afk.skillCursor,cursor);
  p.afkPreferences.basicAttackFallback=true;
  assert(w.autoAttack(p));assert.equal(p.attack.skillId,undefined);
});

test('configured radius changes engagement reach immediately while the activation anchor stays fixed',()=>{
  const {w,p,spot}=fixture(),target=w.mobs.find(m=>m.id===spot.spawnIds[0]),anchor={x:p.x,z:p.z};
  w.mobs=[target];Object.assign(target,{x:p.x+1.8,z:p.z,hp:10000,state:'recover',timer:100,target:p.id});
  w.command(p,{type:'afkPreferences',preferences:{...p.afkPreferences,radiusPercent:25}});
  assert.equal(afkCombatRadius(p.afkPreferences,stats(p).range),2.5*.25);
  assert.equal(w.snapshot(p.id).self.afkRadius,2.5*.25);
  step(w,40);assert.equal(p.attack,null);assert.equal(target.hp,10000);assert.equal(p.afk.targetId,null);
  assert.deepEqual({x:p.x,z:p.z},anchor);
  w.command(p,{type:'afkPreferences',preferences:{...p.afkPreferences,radiusPercent:100}});
  step(w,40);assert(target.hp<10000);assert.deepEqual({x:p.x,z:p.z},anchor);
  p.attack=null;p.mana=0;assert.equal(w.snapshot(p.id).self.afkRadius,2.5);
  w.command(p,{type:'afkPreferences',preferences:{...p.afkPreferences,skillOrder:[],basicAttackFallback:false}});
  assert.equal(w.snapshot(p.id).self.afkRadius,0);step(w,20);assert(p.afk);assert.equal(p.attack,null);
});

test('AFK uses each action range and target body allowance without casting an unavailable skill',()=>{
  const {w,p,spot}=fixture('mage'),target=w.mobs.find(m=>m.id===spot.spawnIds[0]);w.mobs=[target];
  p.afkPreferences={...p.afkPreferences,skillOrder:['mage-frost','mage-fireball'],basicAttackFallback:false};
  Object.assign(target,{x:p.x+5.95,z:p.z,hp:10000,state:'recover',timer:100,target:p.id});
  assert(w.autoAttack(p));assert.equal(p.attack.skillId,'mage-fireball');
  p.attack=null;p.mana=0;assert.equal(w.autoAttack(p),false);
  p.mana=100;Object.assign(target,{x:p.x+6.3});assert.equal(w.autoAttack(p),false);
  Object.assign(target,{x:p.x+1.8});p.afkPreferences.skillOrder=['mage-meteor','mage-fireball'];p.skillCooldowns['mage-meteor']=8;
  assert(w.autoAttack(p));assert.equal(p.attack.skillId,'mage-fireball');
});

test('schema 3 migration keeps a schema 2 hero, stash, potions and class-specific default preferences',
  {skip:!hasTestDatabase},async()=>{
  const db=await createTestDatabase(),hero=persistentHero(newHero('Старый','mage'));
  let store=await openHeroStore({connectionString:db.url});
  let accountId=await testAccount(store);
  const item=rollEquipment('moon-amulet',randomUUID(),()=>.42);
  hero.items.push(item);hero.stash.push(item.id);hero.gold=31;setBottles(hero,'hp',7);setBottles(hero,'mana',4);
  try{
    await store.commit([{accountId,hero,expectedRevision:0}],randomUUID(),'schema2 fixture');await store.close();store=null;
    const client=new pg.Client({connectionString:db.url});await client.connect();
    try{
      await client.query('BEGIN');
      await removeAccountSchema(client);
      await client.query('DELETE FROM schema_migrations WHERE version IN (3,4)');
      await client.query('ALTER TABLE heroes DROP COLUMN afk_preferences');
      await client.query('DROP TABLE consumable_stacks');
      await client.query('ALTER TABLE heroes DROP COLUMN quick_slot_q,DROP COLUMN quick_slot_w,DROP COLUMN consumable_overflow');
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
    store=await openHeroStore({connectionString:db.url});accountId=await ownMigratedFixture(store,db.url,hero.id);const restored=await store.load(hero.id,accountId);
    assert.equal(restored.revision,1);assert.equal(restored.hero.gold,31);assert.equal(restored.hero.potions,7);assert.equal(restored.hero.manaPotions,4);
    assert.deepEqual(restored.hero.items,hero.items);assert.deepEqual(restored.hero.stash,hero.stash);
    assert.deepEqual(restored.hero.afkPreferences,defaultAfkPreferences('mage'));
    assert.equal(await store.schemaVersion(),6);assert.equal(await store.health(),true);
  }finally{if(store)await store.close();await db.close();}
});

test('WebSocket settings save reaches PostgreSQL and survives reconnect without restarting AFK',
  {skip:!hasTestDatabase},async()=>{
  const db=await createTestDatabase(),fixture='a'.repeat(48),spot=AFK_SPOTS[0],hero=newHero('Настроенный');
  equipLegacySkills(hero);Object.assign(hero,{x:spot.x,z:spot.z});await db.seed(fixture,persistentHero(hero));
  let server,ws;
  try{
    server=await startTestServer(db);
    const login=await testPlayer(server,{fixture});
    ws=new WebSocket(server.url.replace('http:','ws:')+'/ws',{origin:server.url,headers:login.headers});
    let state;ws.on('message',data=>{const message=JSON.parse(data);if(message.type==='state')state=message;});
    await once(ws,'open');ws.send(JSON.stringify({type:'join',protocol:3,heroId:login.heroId}));await until(()=>state?.self);
    ws.send(JSON.stringify({type:'afk',enabled:true}));await until(()=>state.self.afk);
    const preferences={...defaultAfkPreferences('warrior'),pickupGold:false,skillOrder:['warrior-thrust'],radiusPercent:50};
    ws.send(JSON.stringify({type:'afkPreferences',preferences}));
    await until(()=>state?.self.afkPreferences.pickupGold===false);
    assert(state.self.afk);
    for(let i=0;i<40;i++){const saved=(await db.load(fixture)).hero;if(saved.afkPreferences.pickupGold===false)break;await delay(50);if(i===39)assert.fail('Preferences did not reach PostgreSQL');}
    const closed=once(ws,'close');ws.close();await closed;ws=null;
    await stopTestServer(server);server=await startTestServer(db);
    ws=new WebSocket(server.url.replace('http:','ws:')+'/ws',{origin:server.url,headers:login.headers});state=null;
    ws.on('message',data=>{const message=JSON.parse(data);if(message.type==='state')state=message;});
    await once(ws,'open');ws.send(JSON.stringify({type:'join',protocol:3,heroId:login.heroId}));await until(()=>state?.self);
    assert.deepEqual(state.self.afkPreferences,preferences);assert.equal(state.self.afk,null);
  }finally{if(ws?.readyState===WebSocket.OPEN){const closed=once(ws,'close');ws.close();await closed;}await stopTestServer(server);await db.close();}
});
