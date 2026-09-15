import test from 'node:test';
import assert from 'node:assert/strict';
import {World,newHero,safeHero,persistentHero,stats} from '../dist/world.js';
import {SKILLS,skillsForClass,legacySkillId} from '../dist/public/game/skills.js';

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

test('six Q/E skills have fixed class ownership, private cooldowns and server costs',()=>{
  assert.equal(Object.keys(SKILLS).length,6);
  for(const classId of ['warrior','archer','mage']){
    const skills=skillsForClass(classId);assert.deepEqual(skills.map(s=>s.slot),['Q','E']);
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
