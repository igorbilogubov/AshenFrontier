import {randomUUID} from 'node:crypto';
import {CLASSES,EQUIPMENT_SLOTS,BAG_CAPACITY,classFor,canEquip,STAT_KEYS,CLASS_PROGRESSION,characterStats,normalizedAllocations} from './public/rules.js';
import {BOUNDS,CAMP,SPAWNS,MOB_TYPES,WEAPONS,safe,stand,clearPath,distance,translate,moveHero} from './public/game/location.js';
import {angleDelta,turnTowards,inStrike} from './public/game/motion.js';
export {CLASSES,EQUIPMENT_SLOTS,CAMP,BOUNDS};
export const SAVE_VERSION=3;
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const nonnegative=(value,fallback=0)=>Math.max(0,finite(value,fallback));
const slotNames={armor:['Кожаный доспех','Доспех дозорного','Пепельный панцирь'],helmet:['Кожаный шлем','Шлем дозорного','Шлем рубежа'],boots:['Походные сапоги','Сапоги следопыта','Сапоги рубежа'],ring:['Медное кольцо','Кольцо охотника','Кольцо рассвета'],amulet:['Оберег путника','Оберег леса','Оберег огня']};
export function makeLoot(classId,level=1,rarity=0,slot='weapon'){
  return {id:randomUUID(),name:(slot==='weapon'?classFor(classId).weaponNames:slotNames[slot])[rarity],slot,rarity,power:Math.max(1,Math.round(level+rarity*3+(slot==='amulet'?5:0))),...(slot==='weapon'?{classId}:{} )};
}
export const stats=characterStats;
export function newHero(name='Странник',classId='warrior'){
  if(!Object.hasOwn(CLASSES,classId))classId='warrior';
  const weapon={...makeLoot(classId,1,0,'weapon'),bound:true},armor={...makeLoot(classId,1,0,'armor'),bound:true};
  return safeHero({schemaVersion:SAVE_VERSION,id:randomUUID(),name,classId,level:1,xp:0,gold:0,kills:0,items:[weapon,armor],equipment:{weapon:weapon.id,armor:armor.id},x:.5,z:2,hp:classFor(classId).hp,mana:CLASS_PROGRESSION[classId].mana,potions:3});
}
export function safeHero(saved){
  const p=structuredClone(saved),legacy=!Number.isInteger(p.schemaVersion)||p.schemaVersion<2,migrateStats=p.schemaVersion!==SAVE_VERSION;
  p.schemaVersion=SAVE_VERSION;p.id=typeof p.id==='string'?p.id:randomUUID();p.name=String(p.name||'Странник').replace(/[\p{C}<>]/gu,'').slice(0,18);
  p.classId=Object.hasOwn(CLASSES,p.classId)?p.classId:'warrior';p.level=Math.max(1,Math.floor(nonnegative(p.level,1)));p.xp=nonnegative(p.xp);p.gold=nonnegative(p.gold??p.coins);p.kills=Math.floor(nonnegative(p.kills));
  p.items=Array.isArray(p.items)?p.items:[];p.pendingItems=Array.isArray(p.pendingItems)?p.pendingItems:[];
  for(const i of [...p.items,...p.pendingItems])if(i.slot==='weapon'&&!i.classId)i.classId='warrior';
  p.equipment=Object.fromEntries(Object.keys(EQUIPMENT_SLOTS).map(slot=>[slot,p.items.some(i=>i.id===p.equipment?.[slot]&&i.slot===slot&&canEquip(p,i))?p.equipment[slot]:null]));
  p.allocatedStats=normalizedAllocations(migrateStats?null:p.allocatedStats,p.level);
  p.statRevision=!migrateStats&&Number.isSafeInteger(p.statRevision)&&p.statRevision>=0?p.statRevision:0;
  if(legacy||!stand(p.x,p.z)){p.x=.5;p.z=2;}
  p.yaw=finite(p.yaw,Math.PI*.25);p.targetYaw=p.yaw;p.weapon=p.weapon==='axe'?'axe':'sword';
  p.questKills=legacy?0:nonnegative(p.questKills);p.boss=legacy?false:!!p.boss;p.questClaimed=legacy?false:!!p.questClaimed;
  p.potions=Math.min(3,Math.floor(nonnegative(p.potions,3)));p.potionCooldown=legacy?0:nonnegative(p.potionCooldown);
  p.specialCooldown=legacy?0:nonnegative(p.specialCooldown);p.dead=legacy?0:nonnegative(p.dead);p.combatUntil=legacy?0:nonnegative(p.combatUntil);
  p.hp=Math.min(stats(p).maxHp,nonnegative(p.hp,stats(p).maxHp));if(!p.hp&&!p.dead)p.dead=2.5;
  // V2 had no mana. Grant its initial pool once; reconnecting V3 never refills it.
  p.mana=migrateStats?stats(p).maxMana:Math.min(stats(p).maxMana,nonnegative(p.mana));
  p.attack=legacy?null:p.attack||null;p.attackSerial=nonnegative(p.attackSerial);
  Object.assign(p,{vx:0,vz:0,hurt:0,gait:0,moveBlend:0,runBlend:0,running:!!p.running,input:{x:0,z:0,aim:null,seq:0},inputAt:0,ack:0,connected:true,disconnectAt:0});
  return p;
}
export function persistentHero(p){
  const fields=['schemaVersion','id','name','classId','level','xp','gold','kills','items','pendingItems','equipment','allocatedStats','statRevision','x','z','yaw','weapon','hp','mana','potions','potionCooldown','specialCooldown','dead','combatUntil','attack','attackSerial','running','questKills','boss','questClaimed'];
  return structuredClone(Object.fromEntries(fields.map(k=>[k,p[k]])));
}
export class World{
  constructor({random=Math.random}={}){
    this.random=random;
    this.t=Date.now();this.age=0;this.players=new Map();this.events=[];this.projectiles=[];
    this.mobs=SPAWNS.map((s,id)=>({...s,id,homeX:s.x,homeZ:s.z,hp:MOB_TYPES[s.type].hp,state:'idle',timer:1,yaw:Math.PI,targetYaw:Math.PI,age:0,gait:0,speed:0,flash:0,target:null,contributors:new Map()}));
  }
  add(p){this.players.set(p.id,p);p.connected=true;p.disconnectAt=0;}
  emit(type,data={},owner){this.events.push({type,...data,...(owner?{owner}:{})});}
  remove(id){this.players.delete(id);}
  notice(p,text){this.emit('notice',{text},p.id);}
  clampResources(p){const s=stats(p);p.hp=Math.min(p.hp,s.maxHp);p.mana=Math.min(p.mana,s.maxMana);}
  updateStats(p,msg){
    const reply=(ok,message)=>this.emit('statResult',{ok,revision:p.statRevision,...(message?{message}:{})},p.id);
    if(!safe(p)||p.dead||p.attack||p.combatUntil>this.t){reply(false,'Характеристики меняются у костра, вне боя');return;}
    if(!Number.isSafeInteger(msg.revision)||msg.revision!==p.statRevision||p.statRevision>=Number.MAX_SAFE_INTEGER){reply(false,'Характеристики изменились. Проверьте распределение ещё раз');return;}
    if(msg.type==='resetStats'){
      if(!STAT_KEYS.some(key=>p.allocatedStats[key]>0)){reply(false,'Пока нет распределённых очков');return;}
      p.allocatedStats=normalizedAllocations(null,p.level);
    }else{
      const points=msg.points;
      if(!points||Array.isArray(points)||typeof points!=='object'||Object.keys(points).some(key=>!STAT_KEYS.includes(key))){reply(false,'Некорректное распределение характеристик');return;}
      let total=0;
      for(const amount of Object.values(points)){
        if(!Number.isSafeInteger(amount)||amount<0){reply(false,'Укажите целое положительное число очков');return;}
        total+=amount;
      }
      if(!Number.isSafeInteger(total)||total<=0||total>stats(p).unspentPoints){reply(false,'Недостаточно свободных очков');return;}
      for(const key of STAT_KEYS)p.allocatedStats[key]+=points[key]??0;
    }
    p.statRevision++;this.clampResources(p);reply(true);
  }
  patrol(m,dt){
    const cfg=MOB_TYPES[m.type],route=m.patrol??={goal:null,pause:.8+m.id*.17,leg:0,speed:0,age:0};
    if(route.pause>0){route.pause=Math.max(0,route.pause-dt);return;}
    const rest=()=>{route.goal=null;route.speed=0;route.pause=1.1+(m.id+route.leg)%4*.3;};
    if(!route.goal){
      // Pick a reachable, fixed destination. Following a continuously moving point
      // made the old patrol alternate Walk/Idle almost every server tick.
      for(let attempt=0;attempt<12;attempt++){
        const angle=(++route.leg)*2.399963+m.id*1.7,radius=1.15+(route.leg%4)*.24;
        const goal={x:m.homeX+Math.sin(angle)*radius,z:m.homeZ+Math.cos(angle)*radius},d=distance(m,goal);
        if(d<.8)continue;
        const steps=Math.ceil(d/.16);let reachable=true;
        for(let i=1;i<=steps;i++){
          const point={x:m.x+(goal.x-m.x)*i/steps,z:m.z+(goal.z-m.z)*i/steps};
          if(!stand(point.x,point.z,cfg.radius)||safe(point)){reachable=false;break;}
        }
        if(reachable){route.goal=goal;route.age=0;break;}
      }
      if(!route.goal){rest();return;}
    }
    const d=distance(m,route.goal);route.age+=dt;
    if(d<.035||route.age>12){rest();return;}
    const angle=Math.atan2(route.goal.x-m.x,route.goal.z-m.z);
    m.yaw=m.type==='wolf'?m.yaw+Math.max(-1.5*dt,Math.min(1.5*dt,angleDelta(m.yaw,angle))):turnTowards(m.yaw,angle,dt,4);
    const alignment=Math.max(0,Math.cos(angleDelta(m.yaw,angle)));
    const walkSpeed=m.type==='boar'?.50:m.type==='alpha'?.82:.62;
    const desired=Math.min(walkSpeed,Math.sqrt(2*.9*d))*alignment**3;
    route.speed+=Math.max(-1.4*dt,Math.min(.9*dt,desired-route.speed));
    const step=Math.min(d,route.speed*dt);
    const moved=translate(m,Math.sin(m.yaw)*step,Math.cos(m.yaw)*step,cfg.radius,true);
    m.speed=dt>0?moved/dt:0;
    if(step>.001&&moved<step*.25)rest();
  }
  command(p,msg){
    if(!msg||typeof msg!=='object')return;
    if(msg.type==='class'){this.notice(p,'Класс выбирается при создании героя и не меняется');return;}
    if(msg.type==='allocateStats'||msg.type==='resetStats'){this.updateStats(p,msg);return;}
    if(msg.type==='input'){
      if(![msg.x,msg.z].every(Number.isFinite)||Math.abs(msg.x)>1||Math.abs(msg.z)>1||(!Number.isFinite(msg.aim)&&msg.aim!==null)||!Number.isSafeInteger(msg.seq)||msg.seq<=p.input.seq)return;
      p.input={x:msg.x,z:msg.z,aim:msg.aim,seq:msg.seq};p.inputAt=this.t;return;
    }
    if(msg.type==='attack'){if(Number.isFinite(msg.yaw))this.attack(p,msg.yaw,!!msg.special);return;}
    if(msg.type==='potion'){this.potion(p);return;}
    if(msg.type==='run'&&typeof msg.running==='boolean'&&!p.dead){p.running=msg.running;return;}
    if(msg.type==='weapon'&&Object.hasOwn(WEAPONS,msg.weapon)&&!p.attack&&!p.dead){p.weapon=msg.weapon;return;}
    if(msg.type==='camp'){
      if(p.dead||p.combatUntil>this.t||this.mobs.some(m=>m.target===p.id&&['chase','windup','recover'].includes(m.state))){this.notice(p,'Сначала оторвитесь от врагов');return;}
      this.camp(p,false);return;
    }
    if(['equip','sell','claim'].includes(msg.type)){
      if(!safe(p)||p.dead||p.attack||p.combatUntil>this.t){this.notice(p,'Снаряжение меняется у костра, вне боя');return;}
      if(msg.type==='claim'){while(p.pendingItems.length&&p.items.length<BAG_CAPACITY)p.items.push(p.pendingItems.shift());return;}
      const item=p.items.find(i=>i.id===msg.id);if(!item)return;
      if(msg.type==='equip'&&canEquip(p,item)){p.equipment[item.slot]=item.id;this.clampResources(p);}
      if(msg.type==='sell'&&!item.bound&&!Object.values(p.equipment).includes(item.id)){p.gold+=Math.max(1,Math.round(nonnegative(item.power)*3+5));p.items=p.items.filter(i=>i.id!==item.id);}
    }
  }
  attack(p,yaw,special=false){
    if(p.dead||p.attack)return false;
    if(safe(p)){this.emit('safe',{},p.id);return false;}
    if(special&&p.specialCooldown>0)return false;
    if(special&&p.mana<stats(p).specialManaCost){this.notice(p,'Не хватает маны. Обычная атака не расходует ману');return false;}
    p.targetYaw=Math.atan2(Math.sin(yaw),Math.cos(yaw));
    const c=classFor(p.classId),duration=p.classId==='warrior'?WEAPONS[p.weapon].duration:c.duration;
    p.attack={id:++p.attackSerial,age:0,duration:special?duration*1.2:duration,weapon:p.weapon,yaw:null,hit:false,special};
    p.combatUntil=this.t+15000;
    if(special){p.specialCooldown=5;p.mana-=stats(p).specialManaCost;}
    return true;
  }
  potion(p){
    if(p.dead||p.potionCooldown>0||p.potions<=0||p.hp>=stats(p).maxHp)return false;
    const amount=Math.min(45,stats(p).maxHp-p.hp);p.potions--;p.hp+=amount;p.potionCooldown=4;this.emit('heal',{amount,x:p.x,z:p.z},p.id);return true;
  }
  camp(p,respawn){
    Object.assign(p,{x:.5,z:2,yaw:Math.PI*.25,targetYaw:Math.PI*.25,vx:0,vz:0,dead:0,attack:null,moveBlend:0,runBlend:0,gait:0,input:{...p.input,x:0,z:0,aim:null}});
    if(respawn){p.hp=stats(p).maxHp;p.mana=stats(p).maxMana;p.potions=3;}
    this.emit('camp',{},p.id);
  }
  damagePlayer(p,amount){
    if(p.dead||safe(p))return;
    const damage=Math.max(1,Math.round(amount*(1-stats(p).damageReduction)));
    p.hp=Math.max(0,p.hp-damage);p.hurt=.35;p.combatUntil=this.t+15000;this.emit('hurt',{x:p.x,z:p.z,amount:damage},p.id);
    if(!p.hp){p.dead=2.5;p.attack=null;p.vx=p.vz=p.moveBlend=p.runBlend=0;this.emit('death',{},p.id);}
  }
  hurtMob(p,m,amount){
    if(p.dead||safe(p)||m.state==='dead'||m.state==='return'||!clearPath(p,m))return false;
    const dealt=Math.min(m.hp,Math.max(0,Math.round(amount)));if(!dealt)return false;
    m.hp-=dealt;m.flash=.2;p.combatUntil=this.t+15000;m.contributors.set(p.id,{at:this.t,damage:(m.contributors.get(p.id)?.damage||0)+dealt});
    this.emit('hit',{x:m.x,z:m.z,amount:dealt,id:m.id});
    if(!m.hp)this.kill(m);else if(m.state==='idle'){m.state='chase';m.target=p.id;}
    return true;
  }
  strikeMob(p,m,amount){
    if(p.dead||safe(p)||m.state==='dead'||m.state==='return'||!clearPath(p,m))return false;
    if(this.random()>=stats(p).hitChance){
      p.combatUntil=this.t+15000;
      if(m.state==='idle'){m.state='chase';m.target=p.id;}
      this.emit('miss',{x:m.x,z:m.z,id:m.id},p.id);return false;
    }
    return this.hurtMob(p,m,amount);
  }
  kill(m){
    if(m.state==='dead')return;
    m.state='dead';m.timer=m.type==='alpha'?40:24;m.age=0;m.speed=0;
    const cfg=MOB_TYPES[m.type];
    // Recent nearby contributors receive personal rewards. A final hit cannot steal the kill.
    for(const [id,contribution] of m.contributors){
      const p=this.players.get(id);if(!p||p.dead||this.t-contribution.at>20000||distance(p,m)>12||contribution.damage<cfg.hp*.05)continue;
      p.kills++;p.questKills++;p.xp+=cfg.xp;p.gold+=cfg.coins;if(m.type==='alpha')p.boss=true;
      while(p.xp>=stats(p).xpNeeded){p.xp-=stats(p).xpNeeded;p.level++;p.statRevision++;this.emit('level',{level:p.level,points:5},p.id);}
      // Every third personal kill and each boss gives a real persisted item.
      if(p.questKills===1||p.questKills%3===0||m.type==='alpha'){
        const slots=Object.keys(EQUIPMENT_SLOTS),slot=slots[(p.questKills-1)%slots.length];
        const item=makeLoot(p.classId,Math.min(12,p.level+1),m.type==='alpha'?2:1,slot);
        if(p.items.length<BAG_CAPACITY)p.items.push(item);else p.pendingItems.push(item);
        this.emit('item',{name:item.name,pending:p.items.length>=BAG_CAPACITY},p.id);
      }
      this.emit('kill',{id:m.id,name:cfg.name,xp:cfg.xp},p.id);this.emit('loot',{id:m.id,x:m.x,z:m.z,amount:cfg.coins},p.id);
    }
    m.contributors.clear();m.target=null;
  }
  tick(dt,now=this.t+dt*1000){
    dt=Math.max(0,Math.min(.1,dt));this.t=now;this.age+=dt;
    for(const p of this.players.values()){
      p.hurt=Math.max(0,p.hurt-dt);p.potionCooldown=Math.max(0,p.potionCooldown-dt);p.specialCooldown=Math.max(0,p.specialCooldown-dt);
      if(p.dead>0){p.dead=Math.max(0,p.dead-dt);if(!p.dead)this.camp(p,true);continue;}
      const input=p.connected&&this.t-p.inputAt<350?p.input:{x:0,z:0,aim:null};
      const s=stats(p);p.speedScale=s.speedScale;moveHero(p,dt,input);p.ack=p.input.seq;
      if(p.attack){
        const a=p.attack;a.age+=dt;if(a.yaw===null&&a.age>=a.duration*.3)a.yaw=p.yaw;
        if(!a.hit&&a.age>=a.duration*.49){
          a.hit=true;let damage=s.attack*(p.classId==='warrior'&&a.weapon==='axe'?1.45:1)*(a.special?1.7:1);
          if(p.classId==='warrior'){
            for(const m of this.mobs)if(inStrike(p,m,a.yaw??p.yaw,a.special?2.7:WEAPONS[a.weapon].range,a.special?Math.PI:.9))this.strikeMob(p,m,damage);
          }else{
            this.projectiles.push({id:randomUUID(),owner:p.id,x:p.x,z:p.z,yaw:a.yaw??p.yaw,remaining:s.range,speed:p.classId==='archer'?13:9,kind:p.classId,damage,aoe:p.classId==='mage'&&a.special?1.7:0});
          }
        }
        if(a.age>=a.duration)p.attack=null;
      }
      const atCamp=safe(p);
      if(p.combatUntil<=this.t)p.hp=Math.min(s.maxHp,p.hp+(s.hpRegen+(atCamp?18:0))*dt);
      p.mana=Math.min(s.maxMana,p.mana+(s.manaRegen+(atCamp?12:0))*dt);
      if(atCamp){
        p.potions=3;
        if(p.questKills>=5&&p.boss&&!p.questClaimed){p.questClaimed=true;p.gold+=50;this.emit('quest',{},p.id);}
      }
    }
    for(const m of this.mobs){
      const cfg=MOB_TYPES[m.type],home={x:m.homeX,z:m.homeZ};m.age+=dt;m.flash=Math.max(0,m.flash-dt);m.speed=0;
      if(m.state==='dead'){m.patrol=null;m.timer-=dt;if(m.timer<=0){Object.assign(m,{x:home.x,z:home.z,hp:cfg.hp,state:'idle',timer:1,age:0,target:null});m.contributors.clear();}continue;}
      let p=this.players.get(m.target);
      if(m.state==='idle'){
        p=[...this.players.values()].filter(p=>!p.dead&&!safe(p)&&distance(p,m)<cfg.aggro&&clearPath(p,m)).sort((a,b)=>distance(a,m)-distance(b,m))[0];
        if(p){m.target=p.id;m.state='chase';m.age=0;}
      }
      if(['chase','windup','recover'].includes(m.state)&&(!p||p.dead||safe(p)||distance(p,m)>10.5)){
        const replacement=[...this.players.values()].filter(other=>!other.dead&&!safe(other)&&distance(other,m)<cfg.aggro&&clearPath(other,m)).sort((a,b)=>distance(a,m)-distance(b,m))[0];
        if(replacement){p=replacement;m.target=p.id;}
      }
      if(['chase','windup','recover'].includes(m.state)&&(!p||p.dead||safe(p)||distance(m,home)>7.4||distance(p,m)>10.5)){
        m.state='return';m.target=null;m.timer=0;m.contributors.clear();
      }
      if(m.state!=='idle'&&m.patrol){m.patrol.goal=null;m.patrol.speed=0;m.patrol.pause=1.1;}
      if(m.state==='return'){
        const d=distance(m,home);if(d<.25){m.state='idle';m.hp=cfg.hp;m.timer=1;}
        else{const a=Math.atan2(home.x-m.x,home.z-m.z);m.yaw=turnTowards(m.yaw,a,dt,9);m.speed=translate(m,Math.sin(a)*cfg.speed*dt,Math.cos(a)*cfg.speed*dt,cfg.radius,true)/dt;}
      }else if(m.state==='windup'){
        m.timer-=dt;if(m.timer<=0){for(const target of this.players.values())if(clearPath(m,target)&&inStrike(m,target,m.targetYaw,cfg.range+.2,.72))this.damagePlayer(target,cfg.damage);m.state='recover';m.timer=cfg.cooldown;m.age=0;}
      }else if(m.state==='recover'){m.timer-=dt;if(m.timer<=0)m.state='chase';}
      else if(m.state==='chase'&&p){
        const a=Math.atan2(p.x-m.x,p.z-m.z);m.yaw=turnTowards(m.yaw,a,dt,10);
        if(distance(p,m)<cfg.range&&Math.abs(angleDelta(m.yaw,a))<.25){m.state='windup';m.timer=cfg.windup;m.targetYaw=a;m.age=0;}
        else m.speed=translate(m,Math.sin(a)*cfg.speed*dt,Math.cos(a)*cfg.speed*dt,cfg.radius,true)/dt;
      }else if(m.state==='idle'){
        this.patrol(m,dt);
      }
      m.gait+=m.speed*dt*5.8;
    }
    for(let i=this.projectiles.length-1;i>=0;i--){
      const b=this.projectiles[i],owner=this.players.get(b.owner);let hit=false;
      const steps=Math.max(1,Math.ceil(b.speed*dt/.15));
      for(let k=0;k<steps&&!hit;k++){
        b.x+=Math.sin(b.yaw)*b.speed*dt/steps;b.z+=Math.cos(b.yaw)*b.speed*dt/steps;b.remaining-=b.speed*dt/steps;
        if(!owner||b.remaining<=0||!stand(b.x,b.z,0)||safe(b)){hit=true;break;}
        const m=this.mobs.find(m=>m.state!=='dead'&&m.state!=='return'&&distance(m,b)<MOB_TYPES[m.type].radius+.2);
        if(m){this.strikeMob(owner,m,b.damage);if(b.aoe)for(const other of this.mobs)if(other!==m&&distance(other,m)<b.aoe)this.strikeMob(owner,other,b.damage*.65);hit=true;}
      }
      if(hit)this.projectiles.splice(i,1);
    }
  }
  snapshot(forId){
    const p=this.players.get(forId);
    return {t:this.t,players:[...this.players.values()].map(p=>({id:p.id,name:p.name,classId:p.classId,x:p.x,z:p.z,yaw:p.yaw,weapon:p.weapon,hp:p.hp,maxHp:stats(p).maxHp,level:p.level,dead:p.dead,hurt:p.hurt,attack:p.attack,moveBlend:p.moveBlend,runBlend:p.runBlend,gait:p.gait,vx:p.vx,vz:p.vz,connected:p.connected})),mobs:this.mobs.map(({contributors,patrol,...m})=>m),projectiles:this.projectiles.map(({damage,aoe,...b})=>b),self:p?{...stats(p),...persistentHero(p),attackPower:stats(p).attack,targetYaw:p.targetYaw,vx:p.vx,vz:p.vz,hurt:p.hurt,gait:p.gait,moveBlend:p.moveBlend,runBlend:p.runBlend,ack:p.ack}:null,events:this.events.filter(e=>!e.owner||e.owner===forId)};
  }
}
