import test from 'node:test';
import assert from 'node:assert/strict';
import {World,newHero,safeHero,persistentHero,stats} from '../dist/world.js';
import {SKILLS,skillsForClass,legacySkillId} from '../dist/public/game/skills.js';
import {clearPath} from '../dist/public/game/location.js';

const east=Math.PI/2;
const step=(w,n=1)=>{for(let i=0;i<n;i++)w.tick(.05,w.t+50);};
function fixture(classId,positions){
  const w=new World({random:()=>0}),p=newHero('Навыки',classId);w.add(p);
  Object.assign(p,{x:8,z:1.8,yaw:east,targetYaw:east});
  w.mobs=w.mobs.slice(0,positions.length);
  w.mobs.forEach((m,i)=>Object.assign(m,{x:positions[i][0],z:positions[i][1],homeX:positions[i][0],homeZ:positions[i][1],hp:190,state:'recover',timer:100,target:p.id}));
  return {w,p,mobs:w.mobs};
}
const cast=(w,p,id,extra={})=>w.command(p,{type:'skill',skillId:id,yaw:east,...extra});
const damage=m=>190-m.hp;

test('twelve Q/E/Z/X skills have fixed class ownership, private cooldowns and server costs',()=>{
  assert.equal(Object.keys(SKILLS).length,12);
  for(const classId of ['warrior','archer','mage']){
    const skills=skillsForClass(classId);assert.deepEqual(skills.map(s=>s.slot),['Q','E','Z','X']);
    const {w,p}=fixture(classId,[[9.4,1.8]]);
    for(const other of Object.values(SKILLS).filter(s=>s.classId!==classId)){
      const before=persistentHero(p);cast(w,p,other.id,{damage:999999,manaCost:0,cooldown:0});
      assert.deepEqual(persistentHero(p),before);
    }
    const q=skills[0],e=skills[1];p.mana=q.manaCost-1;
    cast(w,p,q.id);assert.equal(p.attack,null);assert.equal(p.skillCooldowns[q.id]??0,0);
    p.mana=stats(p).maxMana;const start=p.mana;
    cast(w,p,q.id,{damage:999999,manaCost:0,cooldown:0});
    assert.equal(p.attack.skillId,q.id);assert.equal(p.attack.special,true);
    assert.equal(p.mana,start-q.manaCost);assert.equal(p.skillCooldowns[q.id],q.cooldown);
    const owner=w.snapshot(p.id).self,peer=newHero('Свидетель');w.add(peer);
    assert.equal(owner.skillCooldowns[q.id],q.cooldown);
    assert(!('skillCooldowns' in w.snapshot(peer.id).players.find(player=>player.id===p.id)));
    p.attack=null;cast(w,p,q.id);assert.equal(p.attack,null);assert.equal(p.mana,start-q.manaCost);
    cast(w,p,e.id);assert.equal(p.attack.skillId,e.id);assert.equal(p.mana,start-q.manaCost-e.manaCost);
  }
});

test('regular attacks remain free; old special command and V3 cooldown map to its class skill',()=>{
  for(const classId of ['warrior','archer','mage']){
    const {w,p}=fixture(classId,[[9.4,1.8]]),legacyId=legacySkillId(classId);
    p.mana=0;assert.equal(w.attack(p,east),true);assert.equal(p.mana,0);p.attack=null;
    assert.equal(w.attack(p,east,true),false);
    p.mana=SKILLS[legacyId].manaCost;w.command(p,{type:'attack',yaw:east,special:true});
    assert.equal(p.attack.skillId,legacyId);assert.equal(p.specialCooldown,5);assert.equal(p.mana,0);
    const old={...persistentHero(p),specialCooldown:2.4};delete old.skillCooldowns;
    const restored=safeHero(old);assert.equal(restored.specialCooldown,2.4);assert.equal(restored.skillCooldowns[legacyId],2.4);
    assert.deepEqual(persistentHero(safeHero(persistentHero(restored))),persistentHero(restored));
  }
});

test('warrior cleave uses a forward sector; whirlwind reaches behind but caps four targets',()=>{
  const places=[[9.4,1.8],[9.3,2.2],[9.3,1.4],[6.7,1.8],[8,3.4],[8,.2]];
  const {w,p,mobs}=fixture('warrior',places);cast(w,p,'warrior-cleave');
  step(w,Math.ceil(p.attack.duration*SKILLS['warrior-cleave'].hitFraction/.05)-1);
  assert(mobs.every(m=>damage(m)===0));step(w);
  assert(mobs.slice(0,3).every(m=>damage(m)>0));assert(mobs.slice(3).every(m=>damage(m)===0));
  const first=mobs.map(damage);step(w,20);assert.deepEqual(mobs.map(damage),first);
  p.attack=null;cast(w,p,'warrior-whirlwind');step(w,20);
  assert(mobs.slice(0,4).every(m=>damage(m)>first[mobs.indexOf(m)]));
  assert.equal(mobs.slice(4).filter(m=>damage(m)>first[mobs.indexOf(m)]).length,0);
  assert(w.events.some(e=>e.type==='skillImpact'&&e.skillId==='warrior-whirlwind'&&e.yaw===east));
});

test('ordinary warrior attack strikes only one nearest target; AoE belongs to skills',()=>{
  const {w,p,mobs}=fixture('warrior',[[9.2,1.8],[9.4,2.1],[9.4,1.5]]);
  assert(w.attack(p,east));step(w,15);
  assert(damage(mobs[0])>0);
  assert.equal(damage(mobs[1]),0);assert.equal(damage(mobs[2]),0);
});

test('piercing arrow travels through three line targets, with falloff and no duplicate strike',()=>{
  const {w,p,mobs}=fixture('archer',[[9.4,1.8],[10.8,1.8],[12.2,1.8],[13.6,1.8]]);
  cast(w,p,'archer-piercing');step(w,25);
  assert(mobs.slice(0,3).every(m=>damage(m)>0));assert.equal(damage(mobs[3]),0);
  assert(damage(mobs[0])>damage(mobs[1])&&damage(mobs[1])>damage(mobs[2]));
  const before=mobs.map(damage);step(w,35);assert.deepEqual(mobs.map(damage),before);
  assert.equal(w.projectiles.length,0);
  assert.equal(w.events.filter(e=>e.type==='skillImpact'&&e.skillId==='archer-piercing').length,3);
});

test('fan volley spreads to three lanes and never damages a target twice per cast',()=>{
  const {w,p,mobs}=fixture('archer',[[11,1.8],[11,2.6],[11,1.0]]);
  cast(w,p,'archer-volley');step(w,30);
  assert(mobs.every(m=>damage(m)>0));
  const cap=Math.round(stats(p).attack*SKILLS['archer-volley'].damageScale);
  assert(mobs.every(m=>damage(m)<=cap));
  assert.equal(mobs.reduce((sum,m)=>sum+damage(m),0)<=cap*3,true);
  assert(w.events.some(e=>e.type==='skillImpact'&&e.skillId==='archer-volley'));
});

test('fireball has capped splash with falloff; frost pulse slows only successful hits for two seconds',()=>{
  const {w,p,mobs}=fixture('mage',[[10,1.8],[10,2.9],[10,.7],[11.4,1.8],[12.9,1.8]]);
  cast(w,p,'mage-fireball');step(w,30);
  assert(mobs.slice(0,4).every(m=>damage(m)>0));assert.equal(damage(mobs[4]),0);
  assert(damage(mobs[0])>damage(mobs[1]));
  assert.equal(mobs.filter(m=>damage(m)>0).length,4);
  assert(w.events.some(e=>e.type==='skillImpact'&&e.skillId==='mage-fireball'));
  const frost=fixture('mage',[[9.2,1.8],[8,3.0],[6.8,1.8],[8,.6],[11,1.8]]);
  cast(frost.w,frost.p,'mage-frost');step(frost.w,20);
  assert(frost.mobs.slice(0,4).every(m=>damage(m)>0&&m.slowUntil>frost.w.t));
  assert.equal(damage(frost.mobs[4]),0);assert.equal(frost.mobs[4].slowUntil??0,0);
  assert(frost.w.snapshot(frost.p.id).mobs[0].slow>0);
  step(frost.w,45);assert.equal(frost.w.snapshot(frost.p.id).mobs[0].slow,0);
});

test('server misses and line of sight still govern all skills; malformed yaw never spends mana',()=>{
  const {w,p,mobs}=fixture('warrior',[[9.4,1.8]]);w.random=()=>.999;
  const before=persistentHero(p);cast(w,p,'warrior-cleave',{yaw:NaN,damage:999999});
  assert.deepEqual(persistentHero(p),before);
  cast(w,p,'warrior-cleave');step(w,20);assert.equal(damage(mobs[0]),0);
  assert(w.events.some(e=>e.type==='miss'));
  const ranged=fixture('mage',[[10,1.8]]);ranged.w.random=()=>.999;
  cast(ranged.w,ranged.p,'mage-fireball');step(ranged.w,25);
  assert.equal(damage(ranged.mobs[0]),0);
});


test('new warrior skills separate a strong narrow thrust from a longer capped wave',()=>{
  const thrust=fixture('warrior',[[9.5,1.8],[9.5,2.65],[10.7,1.8]]);
  thrust.p.mana=stats(thrust.p).maxMana;cast(thrust.w,thrust.p,'warrior-thrust');step(thrust.w,20);
  assert(damage(thrust.mobs[0])>0);assert.equal(damage(thrust.mobs[1]),0);assert.equal(damage(thrust.mobs[2]),0);
  const wave=fixture('warrior',[[9.5,1.8],[10.7,1.8],[11.8,1.8],[12.1,2.8],[12.1,.8]]);
  wave.p.mana=stats(wave.p).maxMana;cast(wave.w,wave.p,'warrior-shockwave');step(wave.w,25);
  assert(wave.mobs.slice(0,3).every(m=>damage(m)>0));assert(wave.mobs.slice(3).every(m=>damage(m)===0));
});

test('frost arrow slows only a successful single hit; rain warns then damages at server center once',()=>{
  const frost=fixture('archer',[[10,1.8],[11.5,1.8]]);
  frost.p.mana=stats(frost.p).maxMana;cast(frost.w,frost.p,'archer-frost-shot');step(frost.w,25);
  assert(damage(frost.mobs[0])>0&&frost.mobs[0].slowUntil>frost.w.t);assert.equal(damage(frost.mobs[1]),0);
  const rain=fixture('archer',[[11.9,1.8],[12.3,2.7],[12.3,.9],[9.3,1.8]]);
  rain.p.mana=stats(rain.p).maxMana;cast(rain.w,rain.p,'archer-rain');
  step(rain.w,Math.ceil(rain.p.attack.duration*SKILLS['archer-rain'].hitFraction/.05));
  const warning=rain.w.events.find(e=>e.type==='skillImpact'&&e.skillId==='archer-rain'&&e.phase==='warning');
  assert(warning&&warning.radius===SKILLS['archer-rain'].radius);
  assert(rain.mobs.every(m=>damage(m)===0));step(rain.w,12);
  assert(rain.mobs.slice(0,3).every(m=>damage(m)>0));assert.equal(damage(rain.mobs[3]),0);
  assert.equal(rain.w.events.filter(e=>e.type==='skillImpact'&&e.skillId==='archer-rain'&&e.phase==='impact').length,1);
});

test('chain lightning records actual unique jumps; meteor delays capped splash and preserves cooldown on save',()=>{
  const chain=fixture('mage',[[10,1.8],[11.4,1.8],[12.8,1.8],[15.2,1.8]]);
  chain.p.mana=stats(chain.p).maxMana;cast(chain.w,chain.p,'mage-lightning');step(chain.w,25);
  assert(chain.mobs.slice(0,3).every(m=>damage(m)>0));assert.equal(damage(chain.mobs[3]),0);
  const jumps=chain.w.events.filter(e=>e.type==='skillImpact'&&e.skillId==='mage-lightning');
  assert.equal(jumps.length,3);assert(jumps.every(e=>e.from));
  const meteor=fixture('mage',[[11.8,1.8],[12.2,2.8],[12.2,.8],[9.3,1.8]]);
  meteor.p.mana=stats(meteor.p).maxMana;cast(meteor.w,meteor.p,'mage-meteor');
  assert.equal(meteor.p.skillCooldowns['mage-meteor'],12);
  const saved=safeHero(persistentHero(meteor.p));assert.equal(saved.skillCooldowns['mage-meteor'],12);
  step(meteor.w,Math.ceil(meteor.p.attack.duration*SKILLS['mage-meteor'].hitFraction/.05));
  assert(meteor.w.events.some(e=>e.type==='skillImpact'&&e.skillId==='mage-meteor'&&e.phase==='warning'));
  assert(meteor.mobs.every(m=>damage(m)===0));step(meteor.w,16);
  assert(meteor.mobs.slice(0,3).every(m=>damage(m)>0));assert.equal(damage(meteor.mobs[3]),0);
  assert.equal(meteor.w.events.filter(e=>e.type==='skillImpact'&&e.skillId==='mage-meteor'&&e.phase==='impact').length,1);
});


test('every new Z/X cast ignores forged client cost, starts one private cooldown and respects mana',()=>{
  for(const classId of ['warrior','archer','mage'])for(const skill of skillsForClass(classId).slice(2)){
    const {w,p}=fixture(classId,[[9.5,1.8]]);p.mana=skill.manaCost-1;
    cast(w,p,skill.id,{manaCost:0,cooldown:0,damage:100000});assert.equal(p.attack,null);
    p.mana=stats(p).maxMana;const before=p.mana;
    cast(w,p,skill.id,{manaCost:0,cooldown:0,damage:100000});
    assert.equal(p.attack?.skillId,skill.id);assert.equal(p.mana,before-skill.manaCost);
    assert.equal(p.skillCooldowns[skill.id],skill.cooldown);
    p.attack=null;cast(w,p,skill.id);assert.equal(p.attack,null);
    assert.equal(p.mana,before-skill.manaCost);
  }
});

test('cancelled automatic delayed area has no impact damage or quest credit',()=>{
  const {w,p,mobs}=fixture('archer',[[11.9,1.8]]);p.mana=stats(p).maxMana;
  assert(w.castSkill(p,'archer-rain',east));p.attack.automatic=true;
  step(w,Math.ceil(p.attack.duration*SKILLS['archer-rain'].hitFraction/.05));
  assert.equal(w.pendingAreas.length,1);p.afk=null;step(w,12);
  assert.equal(damage(mobs[0]),0);assert.equal(p.questKills,0);assert.equal(w.pendingAreas.length,0);
});


test('lightning miss stops the chain at the attempted target',()=>{
  const {w,p,mobs}=fixture('mage',[[10,1.8],[11.4,1.8],[12.8,1.8]]);
  p.mana=stats(p).maxMana;w.random=()=>.999;cast(w,p,'mage-lightning');step(w,25);
  assert(mobs.every(m=>damage(m)===0));
  assert.equal(w.events.filter(e=>e.type==='miss').length,1);
  const arcs=w.events.filter(e=>e.type==='skillImpact'&&e.skillId==='mage-lightning');
  assert.equal(arcs.length,1);assert.deepEqual([arcs[0].x,arcs[0].z],[mobs[0].x,mobs[0].z]);
});

test('lightning cannot jump through an obstacle even if both targets are visible from caster',()=>{
  const {w,p,mobs}=fixture('mage',[[23,-2.7],[23,-4.1]]);
  Object.assign(p,{x:20,z:-3.4,yaw:east,targetYaw:east});p.mana=stats(p).maxMana;
  assert(clearPath(p,mobs[0])&&clearPath(p,mobs[1]));assert.equal(clearPath(mobs[0],mobs[1]),false);
  cast(w,p,'mage-lightning');step(w,25);
  assert(damage(mobs[0])>0);assert.equal(damage(mobs[1]),0);
  assert.equal(w.events.filter(e=>e.type==='skillImpact'&&e.skillId==='mage-lightning').length,1);
});
