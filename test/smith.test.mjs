import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {World,newHero,makeLoot,persistentHero,safeHero,stats} from '../dist/world.js';
import {stand,safe,clearPath,distance} from '../dist/public/game/location.js';
import {CAMP_SPAWN} from '../dist/public/game/camp-layout.js';
import {PORTALS} from '../dist/public/game/stadium.js';
import {SHOP} from '../dist/public/game/shop.js';
import {locationAt} from '../dist/public/game/world-layout.js';
import {rollEquipment} from '../dist/public/game/equipment-items.js';
import {consumableQuantity} from '../dist/public/game/consumables.js';
import {shopConsumables} from '../dist/public/game/shop.js';
import {characterStats} from '../dist/public/rules.js';
import {activeSetBonuses} from '../dist/public/game/equipment-sets.js';
import {SMITH,WHETSTONE_ID,INGOT_ID,MAX_ENHANCE,WHETSTONE_CHANCE,ELITE_WHETSTONE_CHANCE,MATERIAL_LINGER,enhanceChance,enhanceGold,enhanceMaterial,enhancePowerBonus,enhanceRollBonus,enhanceStatPreview,enhanceStep,itemEnhance,itemTitle,rollSmithMaterials,smithMaterialEligible,smithMaterialUntil} from '../dist/public/game/smith.js';
import {openHeroStore} from '../dist/storage/postgres.js';
import {createTestDatabase,hasTestDatabase} from './helpers/postgres.mjs';
import {removeEnhanceSchema,testAccount} from './helpers/historical-schema.mjs';

const tick=(w,n=1)=>{for(let i=0;i<n;i++)w.tick(.05,w.t+50);};
const fixture=()=>{const w=new World({random:()=>0}),p=newHero('Кузнец');w.add(p);w.mobs=[];return {w,p};};
const openSmith=(w,p)=>{w.command(p,{type:'interact',npcId:SMITH.id});for(let i=0;i<80&&!p.smithActive;i++)tick(w);assert(p.smithActive);};
const stones=(p,whetstone=20,ingot=10)=>{
  p.consumableInventory=p.consumableInventory.filter(stack=>stack.definitionId!==WHETSTONE_ID&&stack.definitionId!==INGOT_ID);
  if(whetstone)p.consumableInventory.push({id:randomUUID(),definitionId:WHETSTONE_ID,quantity:whetstone});
  if(ingot)p.consumableInventory.push({id:randomUUID(),definitionId:INGOT_ID,quantity:ingot});
};
const seq=(...values)=>{let i=0;return ()=>values[Math.min(i++,values.length-1)];};

test('smith stands in the safe camp with a clear path from the fire',()=>{
  const gate=PORTALS.find(portal=>portal.id==='camp-stadium');assert(gate);
  assert(stand(SMITH.x,SMITH.z));assert(safe(SMITH));assert(clearPath(CAMP_SPAWN,SMITH));
  assert(clearPath(SMITH,SHOP));
  assert(distance(CAMP_SPAWN,SMITH)>SMITH.range);
  assert(distance(SMITH,gate)>4);
});

test('camp stadium portal mesh is parented to the forest scene',async()=>{
  const source=await readFile(new URL('../public/game/stadium-environment.ts',import.meta.url),'utf8');
  assert.match(source,/inStadium\(portal\)\?scene:campScene/);
  const scene=await readFile(new URL('../public/game/scene.ts',import.meta.url),'utf8');
  assert.match(scene,/createStadiumEnvironment\(stadiumRegion,forestRegion\)/);
});

test('enhance chances, materials and gold follow the locked table',()=>{
  assert.equal(MAX_ENHANCE,9);
  for(const next of [1,2,3]){assert.equal(enhanceChance(next),1);assert.equal(enhanceMaterial(next),WHETSTONE_ID);}
  for(const next of [4,5,6]){assert.equal(enhanceChance(next),.8);assert.equal(enhanceMaterial(next),WHETSTONE_ID);}
  for(const next of [7,8,9]){assert.equal(enhanceChance(next),.6);assert.equal(enhanceMaterial(next),INGOT_ID);}
  assert.equal(enhanceGold(1),2000);assert.equal(enhanceGold(6),25000);assert.equal(enhanceGold(9),100000);
  assert.equal(itemTitle({name:'Меч странника простого качества',enhance:3}),'Меч странника +3');
});

test('ordinary forest drops only whetstones; stadium never drops materials',()=>{
  assert.equal(WHETSTONE_CHANCE,.02);assert.equal(ELITE_WHETSTONE_CHANCE,.06);
  assert.deepEqual(rollSmithMaterials({type:'wolf',region:'forest',heroLevel:1},()=>0),[{definitionId:WHETSTONE_ID,amount:1}]);
  assert.deepEqual(rollSmithMaterials({type:'wolf',region:'forest',heroLevel:1},()=>.5),[]);
  assert.deepEqual(rollSmithMaterials({type:'wolf',region:'wasteland',heroLevel:25},seq(0.5,0)),[{definitionId:INGOT_ID,amount:1}]);
  assert.deepEqual(rollSmithMaterials({type:'wolf',eliteId:'ash-alpha',region:'forest',heroLevel:1},seq(0,0)),[{definitionId:INGOT_ID,amount:1},{definitionId:WHETSTONE_ID,amount:1}]);
  assert.deepEqual(rollSmithMaterials({type:'wolf',eliteId:'ash-alpha',region:'forest',heroLevel:1},seq(.5,.5)),[]);
  assert.deepEqual(rollSmithMaterials({type:'wolf',bossId:'forest-dungeon',region:'forest',heroLevel:1},seq(0,.1)),[{definitionId:INGOT_ID,amount:1},{definitionId:WHETSTONE_ID,amount:1}]);
  assert.deepEqual(rollSmithMaterials({type:'wolf',bossId:'forest-dungeon',region:'forest',heroLevel:1},seq(.5,.5)),[]);
  assert.deepEqual(rollSmithMaterials({type:'wolf',eliteId:'guard-forest',dungeonId:'forest-dungeon',region:'forest',heroLevel:1},()=>0),[{definitionId:INGOT_ID,amount:1},{definitionId:WHETSTONE_ID,amount:1}]);
  assert.deepEqual(rollSmithMaterials({type:'wolf',eliteId:'guard-forest',dungeonId:'forest-dungeon',region:'forest',heroLevel:1},()=>.5),[]);
  const w=new World({random:()=>0}),p=newHero('Арена');w.add(p);
  const m=w.mobs.find(mob=>locationAt(mob)==='stadium');assert(m);
  Object.assign(p,{x:m.x,z:m.z});m.contributors.set(p.id,{at:w.t,damage:m.hp||99});w.mobs=w.mobs.filter(mob=>mob.id===m.id);
  w.kill(m);
  assert.equal(w.snapshot(p.id).groundLoot.length,0);
});

test('smith stones last until the next region plus five linger levels',()=>{
  assert.equal(MATERIAL_LINGER,5);
  assert.equal(smithMaterialUntil('forest'),14);
  assert.equal(smithMaterialUntil('snow'),29);
  assert.equal(smithMaterialUntil('wasteland'),44);
  assert.equal(smithMaterialUntil('swamp'),59);
  assert.equal(smithMaterialUntil('mines'),74);
  assert.equal(smithMaterialUntil('rift'),89);
  assert.equal(smithMaterialUntil('citadel'),Infinity);
  assert.equal(smithMaterialEligible(14,'forest'),true);
  assert.equal(smithMaterialEligible(15,'forest'),false);
  assert.equal(smithMaterialEligible(29,'snow'),true);
  assert.equal(smithMaterialEligible(30,'snow'),false);
  assert.equal(smithMaterialEligible(44,'wasteland'),true);
  assert.equal(smithMaterialEligible(45,'wasteland'),false);
  assert.equal(smithMaterialEligible(54,'swamp'),true);
  assert.equal(smithMaterialEligible(59,'swamp'),true);
  assert.equal(smithMaterialEligible(60,'swamp'),false);
  assert.equal(smithMaterialEligible(100,'citadel'),true);
  assert.deepEqual(rollSmithMaterials({type:'wolf',region:'forest',heroLevel:14},()=>0),[{definitionId:WHETSTONE_ID,amount:1}]);
  assert.deepEqual(rollSmithMaterials({type:'wolf',region:'forest',heroLevel:15},()=>0),[]);
  assert.deepEqual(rollSmithMaterials({type:'wolf',eliteId:'ash-alpha',region:'forest',heroLevel:48},seq(0,0)),[]);
  assert.deepEqual(rollSmithMaterials({type:'wolf',region:'wasteland',heroLevel:44},seq(0.5,0)),[{definitionId:INGOT_ID,amount:1}]);
  assert.deepEqual(rollSmithMaterials({type:'wolf',region:'wasteland',heroLevel:45},seq(0.5,0)),[]);
  const w=new World({random:()=>0}),p=newHero('Ветеран');p.level=48;w.add(p);
  const m=w.mobs.find(mob=>locationAt(mob)==='forest'&&!mob.eliteId&&!mob.bossId);assert(m);
  Object.assign(p,{x:m.x,z:m.z});m.contributors.set(p.id,{at:w.t,damage:m.hp||99});w.mobs=w.mobs.filter(mob=>mob.id===m.id);
  w.kill(m);
  const loot=w.snapshot(p.id).groundLoot;
  assert(loot.some(drop=>drop.kind==='gold'));
  assert.equal(loot.filter(drop=>drop.kind==='material').length,0);
});

test('smith opens on arrival; +1…+3 always succeed and spend gold plus a whetstone',()=>{
  const {w,p}=fixture();const item=p.items.find(owned=>owned.id===p.equipment.weapon);p.gold=200000;stones(p,5,0);
  w.command(p,{type:'enhance',id:item.id});assert.equal(itemEnhance(item),0);assert.equal(p.gold,200000);
  w.command(p,{type:'interact',npcId:SMITH.id});assert(p.interactionTarget);assert.equal(p.smithActive,false);
  const origin={x:p.x,z:p.z};tick(w,2);assert(distance(p,SMITH)<distance(origin,SMITH));openSmith(w,p);
  assert(w.events.some(e=>e.type==='smithOpen'&&e.owner===p.id));
  w.command(p,{type:'enhance',id:item.id});
  assert.equal(item.enhance,1);assert.equal(p.gold,198000);assert.equal(consumableQuantity(p,WHETSTONE_ID),4);
  w.command(p,{type:'enhance',id:item.id});w.command(p,{type:'enhance',id:item.id});
  assert.equal(item.enhance,3);assert.equal(p.gold,189000);assert.equal(consumableQuantity(p,WHETSTONE_ID),2);
});

test('failed +4…+6 spends the stone and resets enhance to +0',()=>{
  const {w,p}=fixture();const item=p.items.find(owned=>owned.id===p.equipment.weapon);item.enhance=3;p.gold=20000;stones(p,3,0);
  openSmith(w,p);w.random=()=>.9;
  w.command(p,{type:'enhance',id:item.id});
  assert.equal(item.enhance,undefined);assert.equal(itemEnhance(item),0);
  assert.equal(p.gold,20000-9000);assert.equal(consumableQuantity(p,WHETSTONE_ID),2);
  assert(w.events.some(e=>e.type==='notice'&&e.text.includes('сброшена')));
});

test('+7…+9 consume an ingot; +9 is the cap; stash items cannot be sharpened',()=>{
  const {w,p}=fixture();const item=p.items.find(owned=>owned.id===p.equipment.weapon);item.enhance=6;p.gold=200000;stones(p,0,3);
  openSmith(w,p);w.random=()=>0;
  w.command(p,{type:'enhance',id:item.id});assert.equal(item.enhance,7);assert.equal(consumableQuantity(p,INGOT_ID),2);assert.equal(p.gold,160000);
  item.enhance=9;const gold=p.gold;w.command(p,{type:'enhance',id:item.id});
  assert.equal(item.enhance,9);assert.equal(p.gold,gold);assert.equal(consumableQuantity(p,INGOT_ID),2);
  const extra=makeLoot('warrior',1,0,'ring');p.items.push(extra);p.stash.push(extra.id);
  extra.enhance=0;w.command(p,{type:'enhance',id:extra.id});
  assert.equal(itemEnhance(extra),0);assert.equal(consumableQuantity(p,INGOT_ID),2);assert.equal(p.gold,gold);
});

test('shop and smith sessions are exclusive; materials cannot be bought or assigned to Q/W',()=>{
  const {w,p}=fixture();p.gold=1000;stones(p,2,1);
  openSmith(w,p);assert(p.smithActive);assert.equal(p.shopActive,false);
  w.command(p,{type:'interact',npcId:SHOP.id});
  for(let i=0;i<200&&!p.shopActive;i++)tick(w);
  assert(p.shopActive);assert.equal(p.smithActive,false);
  const gold=p.gold,whetstones=consumableQuantity(p,WHETSTONE_ID);
  w.command(p,{type:'buyConsumable',definitionId:WHETSTONE_ID,quantity:1,requestId:'stone'});
  assert.equal(p.gold,gold);assert.equal(consumableQuantity(p,WHETSTONE_ID),whetstones);
  assert.equal(w.assignConsumable(p,'q',WHETSTONE_ID),false);assert.equal(w.assignConsumable(p,'w',INGOT_ID),false);
  assert.equal(p.quickSlots.q,'hp-basic');
  assert(!shopConsumables().some(definition=>definition.kind==='material'));
});

test('each enhance level adds 10% of the primary stat in whole points; set bonuses stay untouched',()=>{
  assert.equal(enhanceStep(3),1);
  assert.equal(enhanceStep(12),1);
  assert.equal(enhanceStep(25),3);
  const item=rollEquipment('wanderer-blade','sharp-blade',()=>.5);item.enhance=5;
  const primary=item.rolls[0];
  assert.equal(enhanceRollBonus(item,primary,0),enhanceStep(primary.value)*5);
  assert.equal(enhanceRollBonus(item,item.rolls[1],1),0);
  assert.equal(enhancePowerBonus({power:40,enhance:5}),20);
  const preview=enhanceStatPreview(item,6);
  assert.equal(preview.bonus,enhanceStep(primary.value)*6);
  assert.equal(preview.shown,primary.value+preview.bonus);
  assert.equal(Number.isInteger(preview.bonus),true);
  const source={classId:'warrior',level:48,allocatedStats:{strength:10,dexterity:10,vitality:10,energy:10},items:[item],equipment:{weapon:item.id}};
  const plain=characterStats({...source,items:[{...item,enhance:0}]});
  const sharpened=characterStats(source);
  assert.ok(sharpened.attack>=plain.attack+5);
  assert.deepEqual(activeSetBonuses(source),activeSetBonuses({...source,items:[{...item,enhance:0}]}));
  const hero=newHero('Бонус');hero.items[0].enhance=9;
  const withEnhance=stats(hero).attackPower;delete hero.items[0].enhance;
  assert.ok(withEnhance>stats(hero).attackPower);
});

test('AFK always picks stones even when gear filters would skip items',()=>{
  const {w,p}=fixture();
  p.afkPreferences={...p.afkPreferences,pickupGold:false,pickupRarities:[]};
  stones(p,0,0);
  w.groundLoot.push({id:'afk-stone',kind:'material',definitionId:WHETSTONE_ID,amount:2,x:p.x,z:p.z,expiresAt:w.t+60_000,owner:p.id});
  w.command(p,{type:'afk',enabled:true});assert(p.afk);
  tick(w,8);
  assert.equal(consumableQuantity(p,WHETSTONE_ID),2);
  assert.equal(w.snapshot(p.id).groundLoot.filter(drop=>drop.kind==='material').length,0);
});

test('ordinary kill with a zero rng also drops a whetstone outside the stadium',()=>{
  const w=new World({random:()=>0}),p=newHero('Охотник');w.add(p);
  const m=w.mobs.find(mob=>locationAt(mob)==='forest');assert(m);
  Object.assign(p,{x:m.x,z:m.z});m.contributors.set(p.id,{at:w.t,damage:m.hp||99});
  w.kill(m);
  const loot=w.snapshot(p.id).groundLoot;
  assert(loot.some(drop=>drop.kind==='material'&&drop.definitionId===WHETSTONE_ID));
  assert(!loot.some(drop=>drop.kind==='material'&&drop.definitionId===INGOT_ID));
});

test('enhance survives persistence and does not change the rolled identity',()=>{
  const {w,p}=fixture();const item=p.items.find(owned=>owned.id===p.equipment.weapon);
  const rolls=structuredClone(item.rolls);item.enhance=6;
  const stored=persistentHero(p),restored=safeHero(stored);
  const loaded=restored.items.find(owned=>owned.id===item.id);
  assert.equal(loaded.enhance,6);assert.deepEqual(loaded.rolls,rolls);
  w.remove(p.id);w.add(restored);
  assert.deepEqual(persistentHero(safeHero(persistentHero(restored))).items.find(owned=>owned.id===item.id).rolls,rolls);
  const again=structuredClone(loaded);again.enhance=9;
  assert.deepEqual(again.rolls,rolls);
});

test('schema 10 stores enhance and keeps the fingerprint when only enhance changes',{skip:!hasTestDatabase},async()=>{
  const db=await createTestDatabase();let store;
  try{
    store=await openHeroStore({connectionString:db.url});
    const accountId=await testAccount(store),p=newHero('Отпечаток заточки');
    const item=p.items.find(owned=>owned.id===p.equipment.weapon);item.enhance=4;
    const first=await store.commit([{accountId,hero:persistentHero(p),expectedRevision:0}],randomUUID());
    assert.equal(await store.schemaVersion(),10);
    const loaded=await store.load(p.id,accountId);
    assert.equal(loaded.hero.items.find(owned=>owned.id===item.id).enhance,4);
    loaded.hero.items.find(owned=>owned.id===item.id).enhance=7;
    await store.commit([{accountId,hero:persistentHero(safeHero(loaded.hero)),expectedRevision:first[0].revision}],randomUUID(),'normalize hero');
    const again=await store.load(p.id,accountId);
    assert.equal(again.hero.items.find(owned=>owned.id===item.id).enhance,7);
    await store.close();store=null;
    const sql=(await import('pg')).default;const client=new sql.Client({connectionString:db.url});
    await client.connect();await removeEnhanceSchema(client);await client.end();
    store=await openHeroStore({connectionString:db.url});
    assert.equal(await store.schemaVersion(),10);
  }finally{await store?.close();await db.close();}
});

test('tooltips show total stats with enhance bonus in parentheses; the smith waits for anvil confirm',async()=>{
  const details=await readFile(new URL('../public/game/item-details.ts',import.meta.url),'utf8');
  assert.match(details,/amount\(roll\.value\+bonus\)/);
  assert.match(details,/\(\+\$\{amount\(bonus\)\}\)/);
  assert.doesNotMatch(details,/\+\$\{amount\(roll\.value\)\}/);
  assert.match(details,/maximumFractionDigits:0/);
  const rolls=await readFile(new URL('../public/game/equipment-items.ts',import.meta.url),'utf8');
  assert.match(rolls,/rollValue=\(roll:ItemRoll\)=>`\$\{number\.format\(roll\.value\)\}/);
  assert.doesNotMatch(rolls,/rollValue=\(roll:ItemRoll\)=>`\+\$\{/);
  const ui=await readFile(new URL('../public/game/inventory-interactions.ts',import.meta.url),'utf8');
  assert.match(ui,/placeSmithItem/);
  assert.match(ui,/now\.shown/);
  assert.match(ui,/Положите вещь на наковальню/);
  assert.match(ui,/Заточить до/);
  assert.doesNotMatch(ui,/ПКМ по вещи — заточить/);
});
