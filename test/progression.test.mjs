import {equipLegacySkills} from './helpers/skill-builds.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {World,newHero,safeHero,persistentHero,stats,makeLoot,SAVE_VERSION} from '../dist/world.js';
import {STAT_KEYS,CLASS_PROGRESSION,baseAttributes,statBudget,characterStats} from '../dist/public/rules.js';
import {safe,MOB_TYPES} from '../dist/public/game/location.js';
import {SKILLS,legacySkillId} from '../dist/public/game/skills.js';

const fixture=(classId='warrior',random=()=>0)=>{
  const w=new World({random}),p=newHero('Развитие',classId);w.add(p);return {w,p};
};
const allocate=(w,p,points,revision=p.statRevision)=>w.command(p,{type:'allocateStats',points,revision});
const reset=(w,p,revision=p.statRevision)=>w.command(p,{type:'resetStats',revision});
const result=w=>w.events.filter(e=>e.type==='statResult').at(-1);
const step=(w,count=1)=>{for(let i=0;i<count;i++)w.tick(.05,w.t+50);};
function field(w,p){
  const m=w.mobs[0];w.mobs=[m];
  Object.assign(m,{x:8,z:1.8,homeX:8,homeZ:1.8,state:'idle',hp:60});
  Object.assign(p,{x:6.6,z:1.8,yaw:Math.PI/2,targetYaw:Math.PI/2});
  return m;
}

test('each class starts with five unspent points and distinct base attributes, copied safely',()=>{
  for(const classId of Object.keys(CLASS_PROGRESSION)){
    const {p}=fixture(classId),s=stats(p);
    assert.equal(s.unspentPoints,5);assert.equal(p.statRevision,0);
    assert.deepEqual(s.attributes,CLASS_PROGRESSION[classId].base);
    assert.deepEqual(s.allocatedStats,Object.fromEntries(STAT_KEYS.map(key=>[key,0])));
    assert.equal(p.hp,s.maxHp);assert.equal(p.mana,s.maxMana);
    assert.deepEqual(s,characterStats(p));
    const copy=baseAttributes(classId);copy.strength=999;
    assert.notEqual(baseAttributes(classId).strength,999);
  }
  assert.equal(statBudget(1),5);assert.equal(statBudget(20),100);assert.equal(statBudget(81),405);
});

test('allocation is atomic, consumes exactly its budget and acknowledges privately',()=>{
  const {w,p}=fixture(),other=newHero('Зритель');w.add(other);
  allocate(w,p,{strength:2,dexterity:1,vitality:1,energy:1});
  assert.deepEqual(p.allocatedStats,{strength:2,dexterity:1,vitality:1,energy:1});
  assert.equal(stats(p).unspentPoints,0);assert.equal(p.statRevision,1);
  assert.deepEqual(result(w),{type:'statResult',ok:true,revision:1,owner:p.id});
  assert(!w.snapshot(other.id).events.some(e=>e.type==='statResult'));
  const peer=w.snapshot(other.id).players.find(peer=>peer.id===p.id);
  for(const key of ['allocatedStats','statRevision','attributes','unspentPoints','items','mana'])assert(!(key in peer));
  for(const key of ['attributes','allocatedStats','unspentPoints','statRevision','maxMana','mana','hpRegen','manaRegen','hitChance','damageReduction','attackPower','armor','specialManaCost'])assert(key in w.snapshot(p.id).self,key);
  assert.equal(w.snapshot(p.id).self.attack,null);
});

test('malformed, overspent, empty and replayed stat requests never alter the point ledger',()=>{
  const {w,p}=fixture();
  const invalid=[null,[],{}, {strength:0},{strength:-1},{strength:1.1},{strength:'1'},{strength:null},{strength:Infinity},{strength:NaN},{strength:6},{strength:1,dexterity:-1},{strength:1,damage:99},{strength:Number.MAX_SAFE_INTEGER,energy:Number.MAX_SAFE_INTEGER}];
  for(const points of invalid){
    const before=persistentHero(p);allocate(w,p,points);
    assert.deepEqual(persistentHero(p),before);assert.equal(result(w).ok,false);
  }
  for(const revision of [undefined,null,-1,1,.5,'0',Number.MAX_SAFE_INTEGER]){
    const before=persistentHero(p);w.command(p,{type:'allocateStats',points:{strength:1},revision});
    assert.deepEqual(persistentHero(p),before);assert.equal(result(w).ok,false);
  }
  allocate(w,p,{strength:3},0);const accepted=persistentHero(p);
  allocate(w,p,{strength:3},0);reset(w,p,0);
  assert.deepEqual(persistentHero(p),accepted);assert.equal(result(w).ok,false);
  assert.equal(stats(p).unspentPoints,2);
});

test('allocation and reset require a living, idle character at camp outside combat',()=>{
  for(const change of [{x:8,z:2},{dead:2},{attack:{id:1}},{combatUntil:Infinity}]){
    const {w,p}=fixture();allocate(w,p,{strength:1});Object.assign(p,change);
    const before=persistentHero(p);
    allocate(w,p,{vitality:1});assert.equal(result(w).ok,false);
    reset(w,p);assert.equal(result(w).ok,false);assert.deepEqual(persistentHero(p),before);
  }
});

test('allocation and reset clamp resources without healing or changing earned progress',()=>{
  const {w,p}=fixture();p.level=5;p.hp=31;p.mana=7;p.gold=150;p.xp=83;
  allocate(w,p,{vitality:12,energy:13});
  assert.equal(p.hp,31);assert.equal(p.mana,7);
  p.hp=stats(p).maxHp;p.mana=stats(p).maxMana;reset(w,p);
  assert.equal(p.hp,stats(p).maxHp);assert.equal(p.mana,stats(p).maxMana);
  p.hp=31;p.mana=7;const revision=p.statRevision;
  reset(w,p);assert.equal(p.statRevision,revision);assert.equal(result(w).ok,false);
  allocate(w,p,{vitality:5,energy:5});
  reset(w,p);
  assert.equal(p.classId,'warrior');assert.equal(stats(p).unspentPoints,25);
  assert.equal(p.hp,31);assert.equal(p.mana,7);assert.equal(p.gold,150);assert.equal(p.xp,83);
});

test('class changes never alter identity, stats, resources or gear in any character state',()=>{
  for(const classId of Object.keys(CLASS_PROGRESSION)){
    const {w,p}=fixture(classId);allocate(w,p,{strength:2,energy:2});
    p.hp=31;p.mana=7;p.gold=101;
    const initial=persistentHero(p);
    for(const state of [{},{x:8,z:2},{dead:2},{attack:{id:1}},{combatUntil:w.t+15000}]){
      Object.assign(p,structuredClone(initial),state);
      for(const target of [...Object.keys(CLASS_PROGRESSION),'unknown',null]){
        const before=persistentHero(p);w.command(p,{type:'class',classId:target});
        assert.deepEqual(persistentHero(p),before);
        assert.equal(w.events.at(-1).text,'Класс выбирается при создании героя и не меняется');
      }
    }
    Object.assign(p,structuredClone(initial));
    while(p.items.length<16)p.items.push(makeLoot(classId,1,0,'ring'));
    const before=persistentHero(p);w.command(p,{type:'class',classId:'mage'});
    assert.deepEqual(persistentHero(p),before);
  }
});

test('real kills advance the existing XP curve, award five points per level and survive a save round trip',()=>{
  const {w,p}=fixture();allocate(w,p,{strength:5});p.xp=64;
  const m=field(w,p);w.hurtMob(p,m,60);
  assert.equal(p.level,2);assert.equal(p.xp,11);assert.equal(stats(p).xpNeeded,130);
  assert.equal(stats(p).unspentPoints,5);assert.equal(p.statRevision,2);
  assert.equal(w.events.filter(e=>e.type==='level').length,1);
  const saved=persistentHero(p),restored=safeHero(saved);
  assert.deepEqual(persistentHero(restored),saved);
  w.kill(m);assert.equal(p.level,2);assert.equal(stats(p).unspentPoints,5);
});

test('v2 migration preserves 3D state, death, cooldowns, quest and gear; legacy pixels alone reset location',()=>{
  const {p}=fixture('archer');
  const v2={...persistentHero(p),schemaVersion:2,level:81,xp:73,x:8,z:2,hp:0,dead:1.8,combatUntil:123456,potionCooldown:2.2,specialCooldown:4.2,potions:1,questKills:8,boss:true,questClaimed:true,attack:{id:3,age:.1,duration:.72,yaw:1,hit:false,special:false}};
  delete v2.mana;delete v2.allocatedStats;delete v2.statRevision;delete v2.consumableInventory;delete v2.quickSlots;delete v2.consumableOverflow;
  const source=structuredClone(v2),m=safeHero(v2);assert.deepEqual(v2,source);
  assert.equal(m.schemaVersion,SAVE_VERSION);assert.equal(stats(m).unspentPoints,405);assert.equal(m.mana,stats(m).maxMana);
  for(const key of ['id','name','classId','level','xp','gold','kills','x','z','hp','dead','combatUntil','potions','potionCooldown','specialCooldown','questKills','boss','questClaimed','attack','items','equipment'])assert.deepEqual(m[key],v2[key],key);
  assert.deepEqual(persistentHero(safeHero(persistentHero(m))),persistentHero(m));
  const old=safeHero({...v2,schemaVersion:undefined,x:720,z:1728});assert(safe(old));assert.equal(old.questKills,0);assert.equal(old.boss,false);
});

test('v3 reconnect preserves spent points and depleted mana; corrupt allocation data cannot exceed budget',()=>{
  const {w,p}=fixture('mage');allocate(w,p,{energy:3,vitality:2});p.hp=20;p.mana=0;
  const before=persistentHero(p),restored=safeHero(before);
  assert.deepEqual(persistentHero(restored),before);assert.equal(restored.mana,0);assert.equal(stats(restored).unspentPoints,0);
  for(const allocatedStats of [{strength:6},{strength:-1},{strength:1.1},{strength:Number.MAX_SAFE_INTEGER,energy:Number.MAX_SAFE_INTEGER},[]]){
    const recovered=safeHero({...before,allocatedStats});assert.equal(stats(recovered).unspentPoints,5);
    assert.equal(recovered.hp,20);assert.equal(recovered.mana,0);
  }
  assert.equal(safeHero({...before,mana:undefined}).mana,0);
});

test('class formulas give their main attribute damage and all classes benefit from accuracy, vitality and energy',()=>{
  for(const [classId,main] of [['warrior','strength'],['archer','dexterity'],['mage','energy']]){
    const {p}=fixture(classId);p.level=20;const before=stats(p);
    p.allocatedStats[main]=10;assert(stats(p).attackPower>before.attackPower);
    p.allocatedStats.dexterity+=10;const dex=stats(p);assert(dex.hitChance>before.hitChance);assert(dex.damageReduction>before.damageReduction);
    p.allocatedStats.vitality+=10;const vit=stats(p);assert(vit.maxHp>before.maxHp);assert(vit.hpRegen>before.hpRegen);
    p.allocatedStats.energy+=10;const ene=stats(p);assert(ene.maxMana>before.maxMana);assert(ene.manaRegen>before.manaRegen);
    assert(ene.hitChance<=.95&&ene.hitChance>=.72);assert(ene.damageReduction<=.65);
  }
  const {p}=fixture();p.level=10000;p.allocatedStats.dexterity=50000;
  assert(stats(p).hitChance<=.95);assert(stats(p).armor<22);
  const armor=makeLoot('warrior',10000,0,'armor');p.items.push(armor);p.equipment.armor=armor.id;
  assert.equal(stats(p).damageReduction,.65);
});

test('normal attacks remain free; repeatable specials spend mana once and respect attack recovery',()=>{
  for(const classId of Object.keys(CLASS_PROGRESSION)){
    const {w,p}=fixture(classId);equipLegacySkills(p);field(w,p);p.mana=0;
    assert.equal(w.attack(p,Math.PI/2,true),false);assert.equal(p.specialCooldown,0);assert.equal(p.attack,null);
    assert.equal(w.attack(p,Math.PI/2,false),true);assert.equal(p.mana,0);p.attack=null;
    const skill=SKILLS[legacySkillId(classId)];p.mana=skill.manaCost;
    assert.equal(w.attack(p,Math.PI/2,true),true);assert.equal(p.mana,0);assert.equal(p.specialCooldown,0);
    assert.equal(w.attack(p,Math.PI/2,true),false);assert.equal(p.mana,0);
    p.attack=null;p.mana=stats(p).maxMana;assert.equal(w.attack(p,Math.PI/2,true),true);
  }
});

test('melee accuracy is rolled only at contact; misses do no damage, grant no rewards and still engage combat',()=>{
  let rolls=0;const {w,p}=fixture('warrior',()=>{rolls++;return .99;}),m=field(w,p);
  assert(w.attack(p,Math.PI/2));step(w,5);assert.equal(rolls,0);assert.equal(m.hp,60);
  step(w,2);assert.equal(rolls,1);assert.equal(m.hp,60);assert.equal(p.gold,0);assert.equal(m.contributors.size,0);
  assert(w.events.some(e=>e.type==='miss'));assert(p.combatUntil>w.t);
  p.attack=null;w.random=()=>stats(p).hitChance-Number.EPSILON;
  assert(w.attack(p,Math.PI/2));step(w,7);assert(m.hp<60);
});

test('ranged projectiles also use server accuracy at collision and disappear on a miss',()=>{
  for(const classId of ['archer','mage']){
    let rolls=0;const {w,p}=fixture(classId,()=>{rolls++;return .99;}),m=field(w,p);
    Object.assign(p,{x:6,z:1.8});assert(w.attack(p,Math.PI/2));step(w,5);assert.equal(rolls,0);
    step(w,20);assert.equal(rolls,1);assert.equal(m.hp,60);assert.equal(w.projectiles.length,0);
    assert.equal(m.contributors.size,0);
  }
});

test('vitality regenerates only outside combat; mana regenerates alive, with camp recovery and full respawn',()=>{
  const {w,p}=fixture('mage');allocate(w,p,{vitality:2,energy:3});w.mobs=[];
  Object.assign(p,{x:8,z:2,hp:20,mana:0,combatUntil:w.t+1000});const s=stats(p);
  step(w,10);assert.equal(p.hp,20);assert(Math.abs(p.mana-s.manaRegen*.5)<1e-9);
  p.combatUntil=0;const mana=p.mana;step(w,10);
  assert(Math.abs(p.hp-(20+s.hpRegen*.5))<1e-9);assert(Math.abs(p.mana-(mana+s.manaRegen*.5))<1e-9);
  const hp=p.hp,mp=p.mana;w.camp(p,false);assert.equal(p.hp,hp);assert.equal(p.mana,mp);
  step(w,10);assert(p.hp>hp+s.hpRegen*.5);assert(p.mana>mp+s.manaRegen*.5);
  Object.assign(p,{dead:1,hp:0,mana:0});step(w,5);assert.equal(p.hp,0);assert.equal(p.mana,0);
  step(w,16);assert.equal(p.hp,stats(p).maxHp);assert.equal(p.mana,stats(p).maxMana);
});

test('dexterity-derived armor reduces real incoming damage consistently with the displayed mitigation',()=>{
  const {w,p}=fixture();p.level=40;allocate(w,p,{dexterity:200});field(w,p);
  const before=p.hp,s=stats(p);w.damagePlayer(p,MOB_TYPES.alpha.damage);
  assert.equal(before-p.hp,Math.max(1,Math.round(MOB_TYPES.alpha.damage*(1-s.damageReduction))));
  assert(before-p.hp<MOB_TYPES.alpha.damage);
});
