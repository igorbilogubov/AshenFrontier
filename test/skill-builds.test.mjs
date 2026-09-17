import test from 'node:test';
import assert from 'node:assert/strict';
import {World,newHero,safeHero,persistentHero,stats} from '../dist/world.js';
import {SKILLS,skillsForClass} from '../dist/public/game/skills.js';
import {TALENTS,talentPoints,talentBranches,parseSkillBuild,effectiveSkill,defaultSkillBuild} from '../dist/public/game/skill-builds.js';
import {CAMP_SPAWN} from '../dist/public/game/camp-layout.js';
import {stand,distance,clearPath,safe} from '../dist/public/game/location.js';
const east=Math.PI/2;
const advance=(w,seconds)=>{for(let i=0;i<Math.round(seconds*20);i++)w.tick(.05,w.t+50);};
function fixture(classId,ids){
 const w=new World({random:()=>0}),p=newHero('Сборка',classId);Object.assign(p,{level:86,x:8,z:1.8,yaw:east,targetYaw:east});
 p.skillBuild={slots:[...ids,...Array(5-ids.length).fill(null)],talents:{}};p.mana=stats(p).maxMana;p.hp=stats(p).maxHp;w.add(p);
 w.mobs=w.mobs.slice(0,3);w.mobs.forEach((m,i)=>Object.assign(m,{x:9.4+i*.4,z:1.8,homeX:9.4+i*.4,homeZ:1.8,hp:10000,state:'recover',timer:1000,target:p.id}));
 return {w,p,m:w.mobs[0]};
}
const cast=(f,id,targetId)=>f.w.castSkill(f.p,id,east,targetId);
const settle=(f)=>{for(let i=0;f.p.attack&&i<100;i++)advance(f.w,.05);};

test('catalog has thirteen unique level unlocks per class and 54 functional talents',()=>{
 assert.equal(Object.keys(SKILLS).length,39);assert.equal(TALENTS.length,54);
 for(const c of ['warrior','archer','mage']){
  assert.deepEqual(skillsForClass(c).map(s=>s.unlockLevel),[1,3,5,8,10,14,18,20,22,27,32,38,45]);
  assert.equal(skillsForClass(c)[3].kind,'mobility');
  assert.equal(talentBranches(c).length,3);
  assert.equal(TALENTS.filter(t=>t.classId===c&&t.keystone).length,3);
 }
 assert.deepEqual([1,9,10,13,14,86,100,500].map(talentPoints),[0,0,1,1,2,20,20,20]);
});
test('build parser rejects foreign, duplicate, locked skills and invalid talent budget/keystones',()=>{
 const base=defaultSkillBuild('warrior',1);assert(parseSkillBuild(base,'warrior',1));
 for(const slots of [['mage-fireball',null,null,null,null],['warrior-cleave','warrior-cleave',null,null,null],['warrior-heavy',null,null,null,null]])assert.equal(parseSkillBuild({slots,talents:{}},'warrior',1),null);
 assert.equal(parseSkillBuild({...base,talents:{'warrior-duelist-1':1}},'warrior',9),null);
 assert.equal(parseSkillBuild({...base,talents:{'warrior-duelist-mastery':1}},'warrior',86),null);
 const talents=Object.fromEntries(TALENTS.filter(t=>t.classId==='warrior'&&t.branch==='duelist'&&!t.keystone).slice(0,4).map(t=>[t.id,2]));talents['warrior-duelist-mastery']=1;
 assert(parseSkillBuild({...base,talents},'warrior',86));
 for(const t of TALENTS.filter(t=>t.classId==='warrior'&&t.branch==='crowd'&&!t.keystone).slice(0,4))talents[t.id]=2;
 talents['warrior-crowd-mastery']=1;assert.equal(parseSkillBuild({...base,talents},'warrior',86),null);
});
test('server enforces equipped skills and level gate even for forged payloads',()=>{
 const f=fixture('warrior',['warrior-heavy']);assert.equal(cast(f,'warrior-cleave'),false);assert.equal(cast(f,'mage-beam'),false);
 f.p.level=1;assert.equal(cast(f,'warrior-heavy'),false);assert.equal(f.p.attack,null);
});
test('combat build apply cancels actions and buffs, retains cooldowns, saves/loads presets with revision guard',()=>{
 const f=fixture('warrior',['warrior-guard','warrior-heavy']);assert(cast(f,'warrior-guard'));settle(f);assert(f.p.effects.length);const cd=f.p.skillCooldowns['warrior-guard'];
 const build={slots:['warrior-cleave',null,null,null,null],talents:{}};
 f.w.command(f.p,{type:'buildApply',revision:0,build});assert.equal(f.p.buildRevision,1);assert.equal(f.p.effects.length,0);assert.equal(f.p.skillCooldowns['warrior-guard'],cd);
 const campBuild={slots:['warrior-heavy',null,null,null,null],talents:{}};
 Object.assign(f.p,CAMP_SPAWN);f.w.startAfk(f.p);f.w.command(f.p,{type:'buildApply',revision:1,build:campBuild});
 assert.equal(f.p.buildRevision,2);assert.equal(f.p.afk,null);
 f.w.command(f.p,{type:'buildSavePreset',index:0});assert.deepEqual(f.p.skillPresets[0],campBuild);
 f.w.command(f.p,{type:'buildApply',revision:0,build:{slots:[null,null,null,null,null],talents:{}}});
 assert.deepEqual(f.p.skillBuild,campBuild);
 f.w.command(f.p,{type:'buildApply',revision:2,build});
 f.w.command(f.p,{type:'buildLoadPreset',revision:3,index:0});assert.deepEqual(f.p.skillBuild,campBuild);assert.equal(f.p.buildRevision,4);
 const restored=safeHero(persistentHero(f.p));assert.deepEqual(restored.skillBuild,f.p.skillBuild);assert.deepEqual(restored.skillPresets,f.p.skillPresets);assert.equal(restored.skillCooldowns['warrior-guard'],cd);
});
test('level-20 large-area skills hit distant packs up to their cap while respecting safe ground and outer radius',()=>{
 for(const [classId,id] of [['warrior','warrior-earthquake'],['archer','archer-arrow-storm'],['mage','mage-arcane-nova']]){
  const f=fixture(classId,[id]),skill=SKILLS[id],template=f.m;Object.assign(f.p,{x:-3,z:7,yaw:east,targetYaw:east});
  const hit={x:-3,z:11},outside={x:-3,z:12.8};assert(stand(hit.x,hit.z)&&clearPath(f.p,hit)&&distance(f.p,hit)===4);
  const make=(mobId,point)=>({...template,id:mobId,...point,homeX:point.x,homeZ:point.z,hp:10000,state:'recover',timer:1000,target:f.p.id,contributors:new Map(),dots:[]});
  const pack=Array.from({length:skill.maxTargets+2},(_,index)=>make(1000+index,hit)),far=make(2000,outside),protectedMob=make(2001,CAMP_SPAWN);
  assert(safe(protectedMob)&&distance(f.p,protectedMob)<skill.range);f.w.mobs=[...pack,far,protectedMob];
  const mana=f.p.mana,started=id==='archer-arrow-storm'?f.w.castSkill(f.p,id,east,undefined,{x:f.p.x,z:f.p.z}):cast(f,id);
  assert(started,id);assert.equal(f.p.mana,mana-skill.manaCost);advance(f.w,3);
  assert.equal(pack.filter(m=>m.hp<10000).length,skill.maxTargets,id);
  assert.equal(far.hp,10000,`${id} exceeded its five-metre radius`);assert.equal(protectedMob.hp,10000,`${id} damaged safe ground`);
  assert.equal(f.p.skillCooldowns[id],0);
 }
});
test('large-area skills discard historical saved cooldowns, reject parallel casts and repeat after recovery',()=>{
 for(const [classId,id] of [['warrior','warrior-earthquake'],['archer','archer-arrow-storm'],['mage','mage-arcane-nova']]){
  const f=fixture(classId,[id]),skill=SKILLS[id];
  const restored=safeHero({...persistentHero(f.p),skillCooldowns:{[id]:13}});f.w.players.clear();f.w.add(restored);f.p=restored;f.p.mana=stats(f.p).maxMana;
  assert.equal(f.p.skillCooldowns[id],0,`${id} must not retain its old saved cooldown`);
  const castArea=()=>id==='archer-arrow-storm'?f.w.castSkill(f.p,id,east,undefined,{x:f.p.x,z:f.p.z}):cast(f,id);
  const mana=f.p.mana;assert(castArea(),id);const attackId=f.p.attack.id;
  assert.equal(f.p.mana,mana-skill.manaCost);assert.equal(castArea(),false,`${id} must not start a parallel attack`);assert.equal(f.p.attack.id,attackId);assert.equal(f.p.mana,mana-skill.manaCost);
  settle(f);assert.equal(f.p.skillCooldowns[id],0);assert(castArea(),`${id} must repeat as soon as its animation recovers`);
 }
});
test('loading a large-area skill without a saved cooldown does not create a cooldown entry',()=>{
 for(const [classId,id] of [['warrior','warrior-earthquake'],['archer','archer-arrow-storm'],['mage','mage-arcane-nova']]){
  const f=fixture(classId,[id]),restored=safeHero(persistentHero(f.p));
  assert.equal(Object.hasOwn(restored.skillCooldowns,id),false,`${id} was not saved with a cooldown`);
 }
});
test('new self-centred area casts ignore a distant hovered enemy without moving or extending reach',()=>{
 for(const [classId,id] of [['warrior','warrior-earthquake'],['mage','mage-arcane-nova']]){
  const f=fixture(classId,[id]);Object.assign(f.m,{x:25,z:1.8});const before={x:f.p.x,z:f.p.z};
  assert(cast(f,id,f.m.id));assert.equal(f.p.attack.targetId,undefined);settle(f);
  assert.equal(f.m.hp,10000);assert.deepEqual({x:f.p.x,z:f.p.z},before);
 }
});
test('all six mobility skills move, share class cooldown and remain on valid paths',()=>{
 for(const [c,ids] of [['warrior',['warrior-charge','warrior-leap']],['archer',['archer-retreat','archer-roll']],['mage',['mage-teleport','mage-ice-step']]])for(const id of ids){
  const f=fixture(c,ids);f.w.mobs=[];const before={x:f.p.x,z:f.p.z};assert(cast(f,id));settle(f);
  assert(distance(before,f.p)>.3,id);assert(stand(f.p.x,f.p.z));assert(clearPath(before,f.p));
  assert(f.p.skillCooldowns[ids[0]]>0&&f.p.skillCooldowns[ids[1]]>0);assert.equal(cast(f,ids.find(x=>x!==id)),false);
 }
});
test('mobility cannot cross a collision or map gap',()=>{
 const f=fixture('mage',['mage-teleport']);f.w.mobs=[];Object.assign(f.p,{x:72.4,z:14});
 const before={x:f.p.x,z:f.p.z};cast(f,'mage-teleport');settle(f);assert(stand(f.p.x,f.p.z));assert(f.p.x<=72.7);assert(clearPath(before,f.p));
});
test('new repeatable single attacks create real damage and poison/bleed refresh without stacking or tick delay',()=>{
 for(const [c,id] of [['warrior','warrior-heavy'],['warrior','warrior-bleed'],['archer','archer-aimed'],['archer','archer-poison'],['mage','mage-ice-lance']]){
  const f=fixture(c,[id]);assert(cast(f,id,f.m.id));advance(f.w,1.8);assert(f.m.hp<10000,id);
  if(id.includes('bleed')||id.includes('poison')){
   assert.equal(f.m.dots.length,1);const next=f.m.dots[0].nextTick;f.w.addDot(f.p,f.m,id,10,4,false);assert.equal(f.m.dots.length,1);assert.equal(f.m.dots[0].nextTick,next);
   const hp=f.m.hp;advance(f.w,1.1);assert(f.m.hp<hp);
  }
  if(id==='mage-ice-lance')assert(f.m.slowUntil>0);
 }
});
test('beam ticks consume mana only while held; movement/release/target loss cancel it',()=>{
 const f=fixture('mage',['mage-beam','mage-fireball']),startMana=f.p.mana;assert(cast(f,'mage-beam',f.m.id));
 for(let i=0;i<8;i++){assert(cast(f,'mage-beam',f.m.id));advance(f.w,.15);}
 assert(f.m.hp<10000);assert(f.p.mana<startMana);assert(f.p.channel);assert.equal(cast(f,'mage-fireball'),false);
 f.w.command(f.p,{type:'skillStop'});const hp=f.m.hp;advance(f.w,.8);assert.equal(f.m.hp,hp);assert(!f.p.channel);
 assert(cast(f,'mage-beam',f.m.id));advance(f.w,.55);assert(!f.p.channel,'pulse timeout');
 assert(cast(f,'mage-beam',f.m.id));f.w.command(f.p,{type:'input',x:1,z:0,aim:east,seq:1});assert(!f.p.channel);
});
test('guard and berserk have real defensive/offensive tradeoffs; shout reserves mana without refilling',()=>{
 const guard=fixture('warrior',['warrior-guard']),base=fixture('warrior',['warrior-heavy']);
 assert(cast(guard,'warrior-guard'));settle(guard);const a=guard.p.hp,b=base.p.hp;guard.w.damagePlayer(guard.p,100);base.w.damagePlayer(base.p,100);
 assert(a-guard.p.hp<b-base.p.hp);assert(stats(guard.p).attack<stats(base.p).attack);
 const rage=fixture('warrior',['warrior-berserk']);assert(cast(rage,'warrior-berserk'));settle(rage);assert(stats(rage.p).attackSpeed>stats(base.p).attackSpeed);const hp=rage.p.hp;rage.w.damagePlayer(rage.p,100);assert(hp-rage.p.hp>b-base.p.hp);
 const shout=fixture('warrior',['warrior-shout']),max=stats(shout.p).maxMana;assert(cast(shout,'warrior-shout'));settle(shout);assert.equal(stats(shout.p).maxMana,Math.floor(max*.8));assert(shout.p.mana<=stats(shout.p).maxMana);
});
test('focus ends on movement and wind changes only movement speed',()=>{
 const f=fixture('archer',['archer-focus','archer-wind']);assert(cast(f,'archer-focus'));settle(f);assert(f.w.hasEffect(f.p,'archer-focus'));
 f.w.command(f.p,{type:'input',x:1,z:0,aim:east,seq:1});assert(!f.w.hasEffect(f.p,'archer-focus'));
 f.w.command(f.p,{type:'input',x:0,z:0,aim:null,seq:2});const s=stats(f.p);assert(cast(f,'archer-wind'));settle(f);assert(stats(f.p).speedScale>s.speedScale);assert.equal(stats(f.p).attackSpeed,s.attackSpeed);
});
test('mana shield absorbs a bounded fraction, competes for mana and disappears on death',()=>{
 const f=fixture('mage',['mage-mana-shield']);assert(cast(f,'mage-mana-shield'));settle(f);const mana=f.p.mana,hp=f.p.hp;f.w.damagePlayer(f.p,80);assert(f.p.mana<mana);assert(f.p.hp<hp);assert(f.p.shieldBudget<80);
 f.p.mana=0;const hp2=f.p.hp;f.w.damagePlayer(f.p,80);assert(hp2-f.p.hp>hp-f.p.hp-(hp2-f.p.hp));
 f.w.damagePlayer(f.p,100000);assert.equal(f.p.effects.length,0);assert.equal(f.w.skillZones.length,0);
});
test('zones are bounded, personal, effective only within radius and cleaned on build/region/disconnect',()=>{
 const banner=fixture('warrior',['warrior-banner']);assert(cast(banner,'warrior-banner'));settle(banner);assert.equal(banner.w.skillZones.length,1);assert(banner.w.inSkillZone(banner.p,'warrior-banner',banner.p.id));
 const other=newHero('Другой');banner.w.add(other);Object.assign(other,{x:banner.p.x,z:banner.p.z});assert(!banner.w.inSkillZone(other,'warrior-banner',other.id));
 banner.p.x+=4;assert(!banner.w.inSkillZone(banner.p,'warrior-banner',banner.p.id));banner.p.connected=false;advance(banner.w,.1);assert.equal(banner.w.skillZones.length,0);
});
test('mana source has a per-recipient 30-second cap, no multi-source or shield feedback loop',()=>{
 const f=fixture('mage',['mage-mana-source']);f.p.mana=25;assert(cast(f,'mage-mana-source'));settle(f);assert.equal(f.w.skillZones.length,1);
 const zone=f.w.skillZones[0];f.w.skillZones.push({...zone,id:'injected-overlap',budget:1000});advance(f.w,10);
 assert(f.p.manaSourceReceived.amount<=24);assert(f.p.manaSourceReceived.amount>20);
});
test('trap and seals interrupt mobs; elites get shorter control and root immunity',()=>{
 const trap=fixture('archer',['archer-trap']);assert(cast(trap,'archer-trap'));advance(trap.w,.8);assert(trap.m.rootUntil>trap.w.t);assert.equal(trap.w.skillZones.length,0);
 const f=fixture('mage',['mage-seals']);f.m.eliteId='grey-alpha';assert(cast(f,'mage-seals'));advance(f.w,.65);assert(f.m.rootUntil>f.w.t);const until=f.m.rootUntil;f.w.rootMob(f.p,f.m,100);assert.equal(f.m.rootUntil,until);
});
test('AFK uses equipped stationary skills, keeps buffs and does not repeatedly spend on active aura',()=>{
 const f=fixture('warrior',['warrior-shout','warrior-heavy','warrior-charge']);f.p.afkPreferences={...f.p.afkPreferences,attackSkill:'warrior-heavy',buffSkills:['warrior-shout']};f.w.startAfk(f.p);const point={x:f.p.x,z:f.p.z};advance(f.w,7);
 assert(f.w.hasEffect(f.p,'warrior-shout'));assert(f.m.hp<10000);assert.equal(f.p.x,point.x);assert.equal(f.p.z,point.z);assert.equal(f.p.skillCooldowns['warrior-charge']??0,0);
 assert.equal(f.w.events.filter(e=>e.type==='skillImpact'&&e.skillId==='warrior-shout'&&e.phase==='start').length,1);
});
test('talent descriptions have effective numeric impact and keystone drawbacks',()=>{
 const f=fixture('mage',['mage-beam']),s=effectiveSkill(f.p,'mage-beam');
 f.p.skillBuild.talents={'mage-arcanist-1':2,'mage-arcanist-2':2,'mage-arcanist-3':2,'mage-arcanist-4':2,'mage-arcanist-mastery':1};assert(parseSkillBuild(f.p.skillBuild,'mage',86));
 const tuned=effectiveSkill(f.p,'mage-beam');assert(tuned.damageScale>s.damageScale);assert(tuned.manaCost<s.manaCost);assert(tuned.range<s.range);
});

test('guardian mastery applies one ten-percent outgoing tradeoff to basic and skill damage',()=>{
 const a=fixture('warrior',['warrior-heavy']),b=fixture('warrior',['warrior-heavy']);
 a.p.skillBuild.talents={'warrior-guardian-1':2,'warrior-guardian-2':2,'warrior-guardian-3':2,'warrior-guardian-4':2,'warrior-guardian-mastery':1};
 assert(parseSkillBuild(a.p.skillBuild,'warrior',86));assert(Math.abs(stats(a.p).attack/stats(b.p).attack-.9)<1e-9);
 assert.equal(effectiveSkill(a.p,'warrior-heavy').damageScale,effectiveSkill(b.p,'warrior-heavy').damageScale);
});

test('hunter minor talent widens actual volley projectile angles',()=>{
 const f=fixture('archer',['archer-volley']);f.p.skillBuild.talents={'archer-hunter-1':2};
 assert(parseSkillBuild(f.p.skillBuild,'archer',86));
 const skill=effectiveSkill(f.p,'archer-volley');assert(skill.halfAngle>SKILLS['archer-volley'].halfAngle);
 f.w.resolveAttack(f.p,{id:1,age:0,duration:1,yaw:east,special:true,hit:true,skillId:skill.id},stats(f.p).attack);
 assert.deepEqual(f.w.projectiles.map(p=>p.yaw),[east-skill.halfAngle,east,east+skill.halfAngle]);
});
test('leap landing obeys effective radius, damage and four-target cap',()=>{
 const f=fixture('warrior',['warrior-leap']);f.p.skillBuild.talents={'warrior-crowd-1':2,'warrior-crowd-2':2};
 const template=f.m;f.w.mobs=Array.from({length:6},(_,i)=>({...template,id:i,x:12+(i%3)*.15,z:1.8+Math.floor(i/3)*.15,homeX:12,homeZ:1.8,contributors:new Map(),hp:10000}));
 const skill=effectiveSkill(f.p,'warrior-leap');assert(skill.radius>SKILLS['warrior-leap'].radius);
 assert(cast(f,skill.id));settle(f);const struck=f.w.mobs.filter(m=>m.hp<10000);
 assert.equal(struck.length,skill.maxTargets);assert.equal(struck.length,4);
 assert(struck.every(m=>10000-m.hp===Math.round(stats(f.p).attack*skill.damageScale)));
});
