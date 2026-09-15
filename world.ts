import {CLASS_ITEMS,rollEquipment,validateEquipment,equipmentAppearance} from './public/game/equipment-items.js';
import type {ClassId, EquipmentSlot, Item, Hero, PersistentHero, HeroAttack, Mob, Projectile, WorldEvent, EventPayloads, WorldSnapshot, SkillId, SkillCooldowns, GroundDrop} from './shared/types.js';
import {isRecord, isClassId, isEquipmentSlot, isWeaponId} from './shared/types.js';
import {randomUUID} from 'node:crypto';
import {CLASSES,EQUIPMENT_SLOTS,BAG_CAPACITY,backpackItems,classFor,canEquip,STAT_KEYS,CLASS_PROGRESSION,characterStats,normalizedAllocations} from './public/rules.js';
import {BOUNDS,CAMP,SPAWNS,MOB_TYPES,WEAPONS,AFK_SPOTS,afkSpotAt,withinSpot,safe,stand,clearPath,distance,translate,moveHero} from './public/game/location.js';
import {angleDelta,turnTowards,inStrike} from './public/game/motion.js';
import {SKILLS,skillsForClass,legacySkillId} from './public/game/skills.js';
import {LOOT_TTL_MS,MAX_GROUND_DROPS_PER_HERO,PICKUP_RANGE,gearDrops} from './public/game/loot-rules.js';
import {SHOP,shopPrice,sellPrice} from './public/game/shop.js';
export {CLASSES,EQUIPMENT_SLOTS,CAMP,BOUNDS};
export const SAVE_VERSION=3;
const finite=(value: unknown,fallback=0)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const nonnegative=(value: unknown,fallback=0)=>Math.max(0,finite(value,fallback));
const slotNames={armor:['Кожаный доспех','Доспех дозорного','Пепельный панцирь'],helmet:['Кожаный шлем','Шлем дозорного','Шлем рубежа'],boots:['Походные сапоги','Сапоги следопыта','Сапоги рубежа'],ring:['Медное кольцо','Кольцо охотника','Кольцо рассвета'],amulet:['Оберег путника','Оберег леса','Оберег огня']};
export function makeLoot(classId: ClassId,level=1,rarity=0,slot: EquipmentSlot='weapon'): Item{
  return {id:randomUUID(),name:(slot==='weapon'?classFor(classId).weaponNames:slotNames[slot])[rarity],slot,rarity,power:Math.max(1,Math.round(level+rarity*3+(slot==='amulet'?5:0))),...(slot==='weapon'?{classId}:{} )};
}
export const stats=characterStats;
export function newHero(name='Странник',classId: ClassId='warrior'): Hero{
  if(!Object.hasOwn(CLASSES,classId))classId='warrior';
  const weapon={...makeLoot(classId,1,0,'weapon'),bound:true},armor={...makeLoot(classId,1,0,'armor'),bound:true};
  return safeHero({schemaVersion:SAVE_VERSION,id:randomUUID(),name,classId,level:1,xp:0,gold:0,kills:0,items:[weapon,armor],equipment:{weapon:weapon.id,armor:armor.id},x:.5,z:2,hp:classFor(classId).hp,mana:CLASS_PROGRESSION[classId].mana,potions:3});
}
// Disk saves may be legacy or damaged. Normalize primitive fields and check the
// structured payloads before handing them to the strongly typed simulation.
function savedItems(value: unknown): Item[]{
  if(!Array.isArray(value))return [];
  return value.map((item: unknown)=>{
    if(!isRecord(item)||typeof item.id!=='string'||typeof item.name!=='string'||!isEquipmentSlot(item.slot)||typeof item.power!=='number'||typeof item.rarity!=='number')throw new Error('Invalid saved item');
    if(item.classId!==undefined&&!isClassId(item.classId))throw new Error('Invalid saved item class');
    validateEquipment(item as unknown as Item);
    const copy={...item, ...(item.slot==='weapon'&&!item.classId?{classId:'warrior' as const}:{})};
    return copy as unknown as Item;
  });
}
function savedAttack(value: unknown,classId: ClassId): HeroAttack | null{
  if(!value)return null;
  if(!isRecord(value)||!['id','age','duration'].every(key=>typeof value[key]==='number'&&Number.isFinite(value[key]))||(value.yaw!==null&&(typeof value.yaw!=='number'||!Number.isFinite(value.yaw)))||typeof value.hit!=='boolean'||typeof value.special!=='boolean'||(value.weapon!==undefined&&!isWeaponId(value.weapon))||(value.automatic!==undefined&&typeof value.automatic!=='boolean')||(value.skillId!==undefined&&(!Object.hasOwn(SKILLS,String(value.skillId))||SKILLS[value.skillId as SkillId].classId!==classId)))throw new Error('Invalid saved attack');
  // The legacy V2 format may omit the weapon; preserve it exactly on migration.
  return structuredClone(value) as unknown as HeroAttack;
}
export function safeHero(saved: unknown): Hero{
  if(!isRecord(saved))throw new Error('Invalid saved hero');
  const raw=structuredClone(saved),legacy=typeof raw.schemaVersion!=='number'||!Number.isInteger(raw.schemaVersion)||raw.schemaVersion<2,migrateStats=raw.schemaVersion!==SAVE_VERSION;
  const classId=isClassId(raw.classId)?raw.classId:'warrior',level=Math.max(1,Math.floor(nonnegative(raw.level,1)));
  const items=savedItems(raw.items),pendingItems=savedItems(raw.pendingItems),rawEquipment=isRecord(raw.equipment)?raw.equipment:{};
  const equipment: Hero['equipment']={};
  for(const slot of Object.keys(EQUIPMENT_SLOTS) as EquipmentSlot[]){
    const id=rawEquipment[slot];equipment[slot]=typeof id==='string'&&items.some(i=>i.id===id&&i.slot===slot&&canEquip({classId,level},i))?id:null;
  }
  const x=finite(raw.x,.5),z=finite(raw.z,2),position=legacy||typeof raw.x!=='number'||typeof raw.z!=='number'||!Number.isFinite(raw.x)||!Number.isFinite(raw.z)||!stand(x,z)?{x:.5,z:2}:{x,z};
  const yaw=finite(raw.yaw,Math.PI*.25),legacyId=legacySkillId(classId),specialCooldown=legacy?0:nonnegative(raw.specialCooldown);
  const skillCooldowns: SkillCooldowns={};
  if(isRecord(raw.skillCooldowns))for(const skill of Object.values(SKILLS))if(skill.classId===classId&&Object.hasOwn(raw.skillCooldowns,skill.id))skillCooldowns[skill.id]=nonnegative(raw.skillCooldowns[skill.id]);
  skillCooldowns[legacyId]=Math.max(specialCooldown,skillCooldowns[legacyId]??0);
  const restoredAttack=legacy?null:savedAttack(raw.attack,classId);
  const p: Hero={
    schemaVersion:SAVE_VERSION,id:typeof raw.id==='string'?raw.id:randomUUID(),name:String(raw.name||'Странник').replace(/[\p{C}<>]/gu,'').slice(0,18),
    classId,level,xp:nonnegative(raw.xp),gold:nonnegative(raw.gold??raw.coins),kills:Math.floor(nonnegative(raw.kills)),items,pendingItems,equipment,
    allocatedStats:normalizedAllocations(migrateStats?null:raw.allocatedStats,level),statRevision:!migrateStats&&typeof raw.statRevision==='number'&&Number.isSafeInteger(raw.statRevision)&&raw.statRevision>=0?raw.statRevision:0,
    ...position,yaw,targetYaw:yaw,weapon:raw.weapon==='axe'?'axe':'sword',
    questKills:legacy?0:nonnegative(raw.questKills),boss:legacy?false:!!raw.boss,questClaimed:legacy?false:!!raw.questClaimed,
    potions:Math.min(3,Math.floor(nonnegative(raw.potions,3))),potionCooldown:legacy?0:nonnegative(raw.potionCooldown),specialCooldown:skillCooldowns[legacyId]??0,skillCooldowns,dead:legacy?0:nonnegative(raw.dead),combatUntil:legacy?0:nonnegative(raw.combatUntil),
    hp:0,mana:0,attack:restoredAttack?.automatic?null:restoredAttack,attackSerial:nonnegative(raw.attackSerial),
    vx:0,vz:0,hurt:0,gait:0,moveBlend:0,runBlend:0,running:!!raw.running,input:{x:0,z:0,aim:null,seq:0},inputAt:0,ack:0,connected:true,disconnectAt:0,afk:null,interactionTarget:null,shopActive:false
  };
  p.hp=Math.min(stats(p).maxHp,nonnegative(raw.hp,stats(p).maxHp));if(!p.hp&&!p.dead)p.dead=2.5;
  // V2 had no mana. Grant its initial pool once; reconnecting V3 never refills it.
  p.mana=migrateStats?stats(p).maxMana:Math.min(stats(p).maxMana,nonnegative(raw.mana));
  return p;
}
export function persistentHero(p: Hero): PersistentHero{
  const fields=['schemaVersion','id','name','classId','level','xp','gold','kills','items','pendingItems','equipment','allocatedStats','statRevision','x','z','yaw','weapon','hp','mana','potions','potionCooldown','specialCooldown','skillCooldowns','dead','combatUntil','attack','attackSerial','running','questKills','boss','questClaimed'] as const;
  return structuredClone(Object.fromEntries(fields.map(k=>[k,p[k]]))) as unknown as PersistentHero;
}
export class World{
  random: ()=>number;
  t: number;
  age: number;
  players: Map<string,Hero>;
  events: WorldEvent[];
  projectiles: Projectile[];
  pendingAreas: {skillId:'archer-rain'|'mage-meteor';caster:string;attackId:number;yaw:number;x:number;z:number;at:number;damage:number;automatic:boolean}[];
  mobs: Mob[];
  groundLoot: (GroundDrop & {owner:string})[];
  purchaseReceipts:Map<string,string[]>;
  constructor({random=Math.random}={}){
    this.random=random;
    this.t=Date.now();this.age=0;this.players=new Map();this.events=[];this.projectiles=[];this.pendingAreas=[];this.groundLoot=[];this.purchaseReceipts=new Map();
    this.mobs=SPAWNS.map((s,id)=>({...s,id,homeX:s.x,homeZ:s.z,hp:MOB_TYPES[s.type].hp,state:'idle',timer:1,yaw:Math.PI,targetYaw:Math.PI,age:0,gait:0,speed:0,flash:0,target:null,contributors:new Map()}));
  }
  add(p: Hero){this.stopAfk(p);this.stopInteraction(p);this.players.set(p.id,p);p.connected=true;p.disconnectAt=0;p.afk=null;p.shopActive=false;}
  emit<K extends keyof EventPayloads>(type: K,data: EventPayloads[K],owner?: string){this.events.push({type,...data,...(owner?{owner}:{})} as WorldEvent);}
  remove(id: string){const p=this.players.get(id);if(p){this.stopAfk(p);this.stopInteraction(p);p.shopActive=false;}this.players.delete(id);this.purchaseReceipts.delete(id);}
  notice(p: Hero,text: string){this.emit('notice',{text},p.id);}
  stopInteraction(p:Hero){
    if(!p.interactionTarget)return false;
    p.interactionTarget=null;p.input={...p.input,x:0,z:0,aim:null};p.vx=p.vz=0;return true;
  }
  addGroundDrop(owner:string,drop:GroundDrop){
    this.groundLoot=this.groundLoot.filter(candidate=>candidate.expiresAt>this.t);
    while(this.groundLoot.filter(candidate=>candidate.owner===owner).length>=MAX_GROUND_DROPS_PER_HERO){
      const oldest=this.groundLoot.findIndex(candidate=>candidate.owner===owner);
      if(oldest<0)break;this.groundLoot.splice(oldest,1);
    }
    this.groundLoot.push({...drop,owner});
  }
  groundDrop(p:Hero,id:unknown){return typeof id==='string'?this.groundLoot.find(drop=>drop.id===id&&drop.owner===p.id&&drop.expiresAt>this.t):undefined;}
  pickUp(p:Hero,id:unknown){
    const drop=this.groundDrop(p,id);
    if(!drop||!p.connected||p.dead||p.attack){this.stopInteraction(p);return false;}
    if(distance(p,drop)>PICKUP_RANGE||!clearPath(p,drop))return false;
    if(drop.kind==='item'){
      if(!drop.item)return false;
      if(backpackItems(p).length>=BAG_CAPACITY){this.notice(p,'Рюкзак полон. Вещь остаётся на земле');this.stopInteraction(p);return false;}
      // Remove first; a repeated command cannot award the same instance twice.
      this.groundLoot.splice(this.groundLoot.indexOf(drop),1);
      p.items.push(drop.item);this.emit('item',{name:drop.item.name,pending:false},p.id);
    }else{
      const amount=drop.amount;
      if(typeof amount!=='number'||!Number.isSafeInteger(amount)||amount<=0)return false;
      this.groundLoot.splice(this.groundLoot.indexOf(drop),1);
      p.gold+=amount;this.emit('loot',{id:-1,x:drop.x,z:drop.z,amount},p.id);
    }
    this.stopInteraction(p);return true;
  }
  startPickup(p:Hero,id:unknown){
    this.stopAfk(p);
    const drop=this.groundDrop(p,id);
    if(!drop||!p.connected||p.dead||p.attack)return false;
    if(!clearPath(p,drop)){this.notice(p,'К добыче нет прямого прохода');return false;}
    if(distance(p,drop)<=PICKUP_RANGE)return this.pickUp(p,id);
    this.stopInteraction(p);p.interactionTarget={kind:'loot',id:drop.id};p.input={...p.input,x:0,z:0,aim:null};return true;
  }
  vendorAvailable(p:Hero){return p.connected&&!p.dead&&!p.attack&&p.combatUntil<=this.t&&safe(p)&&distance(p,SHOP)<=SHOP.range&&clearPath(p,SHOP);}
  openShop(p:Hero){
    if(!this.vendorAvailable(p))return false;
    this.stopInteraction(p);p.shopActive=true;this.emit('shopOpen',{npcId:SHOP.id},p.id);return true;
  }
  startVendor(p:Hero,npcId:unknown){
    this.stopAfk(p);
    if(npcId!==SHOP.id||!p.connected||p.dead)return false;
    if(p.attack||p.combatUntil>this.t){this.notice(p,'Торговец доступен вне боя');return false;}
    if(!clearPath(p,SHOP)){this.notice(p,'К торговцу нет прямого прохода');return false;}
    if(distance(p,SHOP)<=SHOP.range)return this.openShop(p);
    this.stopInteraction(p);p.interactionTarget={kind:'vendor',id:SHOP.id};p.input={...p.input,x:0,z:0,aim:null};return true;
  }
  buy(p:Hero,definitionId:unknown,requestId:unknown){
    if(!p.shopActive||!this.vendorAvailable(p))return false;
    const price=shopPrice(definitionId);
    if(price===undefined)return false;
    if(typeof requestId==='string'){
      if(requestId.length>80||requestId.length===0)return false;
      if(this.purchaseReceipts.get(p.id)?.includes(requestId))return false;
    }else if(requestId!==undefined)return false;
    if(backpackItems(p).length>=BAG_CAPACITY){this.notice(p,'Рюкзак полон');return false;}
    if(p.gold<price){this.notice(p,'Не хватает золота');return false;}
    const item=rollEquipment(String(definitionId),randomUUID(),()=>0);
    p.gold-=price;p.items.push(item);
    if(typeof requestId==='string'){
      const receipts=this.purchaseReceipts.get(p.id)??[];receipts.push(requestId);
      if(receipts.length>64)receipts.shift();this.purchaseReceipts.set(p.id,receipts);
    }
    this.notice(p,`Куплено: ${item.name}`);return true;
  }
  interactionInput(p:Hero){
    const target=p.interactionTarget;if(!target)return {x:0,z:0,aim:null};
    const point=target.kind==='vendor'?SHOP:this.groundDrop(p,target.id);
    if(!point||!p.connected||p.dead||p.attack||!clearPath(p,point)){this.stopInteraction(p);return {x:0,z:0,aim:null};}
    const limit=target.kind==='vendor'?SHOP.range:PICKUP_RANGE,d=distance(p,point);
    if(d<=limit){if(target.kind==='vendor')this.openShop(p);else this.pickUp(p,target.id);return {x:0,z:0,aim:null};}
    const yaw=Math.atan2(point.x-p.x,point.z-p.z);
    return {x:Math.sin(yaw),z:Math.cos(yaw),aim:yaw};
  }
  stopAfk(p: Hero,reason?: string){
    if(!p.afk)return false;
    p.afk=null;p.input={...p.input,x:0,z:0,aim:null};p.vx=p.vz=0;
    if(p.attack?.automatic)p.attack=null;
    for(const b of this.projectiles)if(b.owner===p.id&&b.automatic)b.remaining=0;
    if(reason&&p.connected)this.notice(p,reason);
    return true;
  }
  startAfk(p: Hero){
    if(!p.connected||p.dead){this.notice(p,'Автоохота доступна только живому подключённому герою');return false;}
    const spot=afkSpotAt(p);
    if(!spot||!withinSpot(p,spot,-.46)){this.notice(p,'Войдите в отмеченный лесной спот для автоохоты');return false;}
    if(backpackItems(p).length>=BAG_CAPACITY&&p.pendingItems.length>=BAG_CAPACITY){this.notice(p,'Рюкзак и очередь добычи заполнены');return false;}
    p.afk={spotId:spot.id,targetId:null};p.input={...p.input,x:0,z:0,aim:null};p.vx=p.vz=0;
    return true;
  }
  clampResources(p: Hero){const s=stats(p);p.hp=Math.min(p.hp,s.maxHp);p.mana=Math.min(p.mana,s.maxMana);}
  updateStats(p: Hero,msg: Record<string,unknown>){
    const reply=(ok: boolean,message?: string)=>this.emit('statResult',{ok,revision:p.statRevision,...(message?{message}:{})},p.id);
    if(!safe(p)||p.dead||p.attack||p.combatUntil>this.t){reply(false,'Характеристики меняются у костра, вне боя');return;}
    if(!Number.isSafeInteger(msg.revision)||msg.revision!==p.statRevision||p.statRevision>=Number.MAX_SAFE_INTEGER){reply(false,'Характеристики изменились. Проверьте распределение ещё раз');return;}
    if(msg.type==='resetStats'){
      if(!STAT_KEYS.some(key=>p.allocatedStats[key]>0)){reply(false,'Пока нет распределённых очков');return;}
      p.allocatedStats=normalizedAllocations(null,p.level);
    }else{
      const points=msg.points;
      if(!isRecord(points)||Object.keys(points).some(key=>!STAT_KEYS.some(stat=>stat===key))){reply(false,'Некорректное распределение характеристик');return;}
      let total=0;
      for(const amount of Object.values(points)){
        if(typeof amount!=='number'||!Number.isSafeInteger(amount)||amount<0){reply(false,'Укажите целое положительное число очков');return;}
        total+=amount;
      }
      if(!Number.isSafeInteger(total)||total<=0||total>stats(p).unspentPoints){reply(false,'Недостаточно свободных очков');return;}
      for(const key of STAT_KEYS)p.allocatedStats[key]+=typeof points[key]==='number'?points[key]:0;
    }
    p.statRevision++;this.clampResources(p);reply(true);
  }
  patrol(m: Mob,dt: number,speedScale=1){
    const cfg=MOB_TYPES[m.type],spot=m.spotId?AFK_SPOTS.find(candidate=>candidate.id===m.spotId):null,route=m.patrol??={goal:null,pause:.8+m.id*.17,leg:0,speed:0,age:0};
    if(route.pause>0){route.pause=Math.max(0,route.pause-dt);return;}
    const rest=()=>{route.goal=null;route.speed=0;route.pause=1.1+(m.id+route.leg)%4*.3;};
    if(!route.goal){
      // Pick a reachable, fixed destination. Following a continuously moving point
      // made the old patrol alternate Walk/Idle almost every server tick.
      for(let attempt=0;attempt<12;attempt++){
        const angle=(++route.leg)*2.399963+m.id*1.7,radius=1.15+(route.leg%4)*.24;
        const goal={x:m.homeX+Math.sin(angle)*radius,z:m.homeZ+Math.cos(angle)*radius},d=distance(m,goal);
        if(d<.8||(spot&&!withinSpot(goal,spot,-cfg.radius)))continue;
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
    const desired=Math.min(walkSpeed*speedScale,Math.sqrt(2*.9*d))*alignment**3;
    route.speed+=Math.max(-1.4*dt,Math.min(.9*dt,desired-route.speed));
    const step=Math.min(d,route.speed*dt);
    const start={x:m.x,z:m.z},moved=translate(m,Math.sin(m.yaw)*step,Math.cos(m.yaw)*step,cfg.radius,true);
    if(spot&&!withinSpot(m,spot,-cfg.radius)){m.x=start.x;m.z=start.z;rest();m.speed=0;return;}
    m.speed=dt>0?moved/dt:0;
    if(step>.001&&moved<step*.25)rest();
  }
  command(p: Hero,msg: unknown){
    if(!isRecord(msg))return;
    if(msg.type==='class'){this.notice(p,'Класс выбирается при создании героя и не меняется');return;}
    if(msg.type==='allocateStats'||msg.type==='resetStats'){this.updateStats(p,msg);return;}
    if(msg.type==='afk'){
      if(typeof msg.enabled!=='boolean')return;
      if(msg.enabled)this.startAfk(p);else this.stopAfk(p);
      return;
    }
    if(msg.type==='input'){
      if(typeof msg.x!=='number'||typeof msg.z!=='number'||!Number.isFinite(msg.x)||!Number.isFinite(msg.z)||Math.abs(msg.x)>1||Math.abs(msg.z)>1||(msg.aim!==null&&(typeof msg.aim!=='number'||!Number.isFinite(msg.aim)))||typeof msg.seq!=='number'||!Number.isSafeInteger(msg.seq)||msg.seq<=p.input.seq)return;
      if(Math.hypot(msg.x,msg.z)>.01){this.stopAfk(p);this.stopInteraction(p);}
      p.input={x:msg.x,z:msg.z,aim:msg.aim,seq:msg.seq};p.inputAt=this.t;return;
    }
    if(msg.type==='attack'){this.stopAfk(p);this.stopInteraction(p);if(typeof msg.yaw==='number'&&Number.isFinite(msg.yaw))this.attack(p,msg.yaw,msg.special===true);return;}
    if(msg.type==='skill'){this.stopAfk(p);this.stopInteraction(p);if(typeof msg.yaw==='number'&&Number.isFinite(msg.yaw)&&typeof msg.skillId==='string'&&Object.hasOwn(SKILLS,msg.skillId))this.castSkill(p,msg.skillId as SkillId,msg.yaw);return;}
    if(msg.type==='potion'){this.stopInteraction(p);this.potion(p);return;}
    if(msg.type==='pickup'){this.startPickup(p,msg.id);return;}
    if(msg.type==='interact'){this.startVendor(p,msg.npcId);return;}
    if(msg.type==='cancelInteraction'){this.stopInteraction(p);return;}
    if(msg.type==='buy'){this.buy(p,msg.definitionId,msg.requestId);return;}
    if(msg.type==='run'&&typeof msg.running==='boolean'&&!p.dead){p.running=msg.running;return;}
    if(msg.type==='weapon'&&isWeaponId(msg.weapon)&&!p.attack&&!p.dead){const weapon=p.items.find(item=>item.id===p.equipment.weapon);if(weapon?.definitionId){this.notice(p,'Вид оружия определяется надетым предметом');return;}p.weapon=msg.weapon;return;}
    if(msg.type==='camp'){
      this.stopAfk(p);this.stopInteraction(p);p.shopActive=false;
      if(p.dead||p.combatUntil>this.t||this.mobs.some(m=>m.target===p.id&&['chase','windup','recover'].includes(m.state))){this.notice(p,'Сначала оторвитесь от врагов');return;}
      this.camp(p,false);return;
    }
    if(typeof msg.type==='string'&&['equip','unequip','sell','claim'].includes(msg.type)){
      if(!safe(p)||p.dead||p.attack||p.combatUntil>this.t){this.notice(p,'Снаряжение меняется у костра, вне боя');return;}
      if(msg.type==='claim'){while(p.pendingItems.length&&backpackItems(p).length<BAG_CAPACITY)p.items.push(p.pendingItems.shift()!);return;}
      const item=p.items.find(i=>i.id===msg.id);if(!item)return;
      if(msg.type==='equip'&&canEquip(p,item)){p.equipment[item.slot]=item.id;if(item.definitionId&&item.slot==='weapon')p.weapon='sword';this.clampResources(p);}
      if(msg.type==='unequip'&&p.equipment[item.slot]===item.id){if(backpackItems(p).length>=BAG_CAPACITY){this.notice(p,'Рюкзак полон. Освободите ячейку, чтобы снять вещь.');return;}p.equipment[item.slot]=null;this.clampResources(p);}
      if(msg.type==='sell'&&p.shopActive&&this.vendorAvailable(p)&&!item.bound&&!Object.values(p.equipment).includes(item.id)){p.gold+=sellPrice(item);p.items=p.items.filter(i=>i.id!==item.id);}
    }
  }
  attack(p: Hero,yaw: number,special=false){
    if(special)return this.castSkill(p,legacySkillId(p.classId),yaw);
    if(!Number.isFinite(yaw))return false;
    if(p.dead||p.attack)return false;
    if(safe(p)){this.emit('safe',{},p.id);return false;}
    p.targetYaw=Math.atan2(Math.sin(yaw),Math.cos(yaw));
    const c=classFor(p.classId),duration=(p.classId==='warrior'?WEAPONS[p.weapon].duration:c.duration)/(1+stats(p).attackSpeed);
    p.attack={id:++p.attackSerial,age:0,duration,weapon:p.weapon,yaw:null,hit:false,special:false,...(p.afk?{automatic:true}:{})};
    p.combatUntil=this.t+15000;
    return true;
  }
  /** Also used by server-driven AFK actions; every cast follows the same checks. */
  castSkill(p: Hero,skillId: SkillId,yaw: number){
    const skill=SKILLS[skillId];
    if(!skill||skill.classId!==p.classId||!Number.isFinite(yaw)||p.dead||p.attack)return false;
    if(safe(p)){this.emit('safe',{},p.id);return false;}
    const cd=Math.max(p.skillCooldowns?.[skillId]??0,skillId===legacySkillId(p.classId)?p.specialCooldown:0);
    if(cd>0)return false;
    if(p.mana<skill.manaCost){this.notice(p,'Не хватает маны. Обычная атака не расходует ману');return false;}
    p.targetYaw=Math.atan2(Math.sin(yaw),Math.cos(yaw));
    const c=classFor(p.classId),base=(p.classId==='warrior'?WEAPONS[p.weapon].duration:c.duration)/(1+stats(p).attackSpeed);
    p.attack={id:++p.attackSerial,age:0,duration:base*skill.durationScale,weapon:p.weapon,yaw:null,hit:false,special:true,skillId,...(p.afk?{automatic:true}:{})};
    p.combatUntil=this.t+15000;p.mana-=skill.manaCost;
    (p.skillCooldowns??={})[skillId]=skill.cooldown;
    if(skillId===legacySkillId(p.classId))p.specialCooldown=skill.cooldown;
    return true;
  }
  potion(p: Hero){
    if(p.dead||p.potionCooldown>0||p.potions<=0||p.hp>=stats(p).maxHp)return false;
    const amount=Math.min(45,stats(p).maxHp-p.hp);p.potions--;p.hp+=amount;p.potionCooldown=4;this.emit('heal',{amount,x:p.x,z:p.z},p.id);return true;
  }
  camp(p: Hero,respawn: boolean){
    this.stopAfk(p);
    Object.assign(p,{x:.5,z:2,yaw:Math.PI*.25,targetYaw:Math.PI*.25,vx:0,vz:0,dead:0,attack:null,moveBlend:0,runBlend:0,gait:0,input:{...p.input,x:0,z:0,aim:null}});
    if(respawn){p.hp=stats(p).maxHp;p.mana=stats(p).maxMana;p.potions=3;}
    this.emit('camp',{},p.id);
  }
  damagePlayer(p: Hero,amount: number){
    if(p.dead||safe(p))return;
    const damage=Math.max(1,Math.round(amount*(1-stats(p).damageReduction)));
    p.hp=Math.max(0,p.hp-damage);p.hurt=.35;p.combatUntil=this.t+15000;this.emit('hurt',{x:p.x,z:p.z,amount:damage},p.id);
    if(!p.hp){this.stopAfk(p);this.stopInteraction(p);p.shopActive=false;p.dead=2.5;p.attack=null;p.vx=p.vz=p.moveBlend=p.runBlend=0;this.emit('death',{},p.id);}
  }
  hurtMob(p: Hero,m: Mob,amount: number,automatic=false){
    if(p.dead||safe(p)||m.state==='dead'||m.state==='return'||!clearPath(p,m))return false;
    const dealt=Math.min(m.hp,Math.max(0,Math.round(amount)));if(!dealt)return false;
    const earlier=m.contributors.get(p.id);
    m.hp-=dealt;m.flash=.2;p.combatUntil=this.t+15000;m.contributors.set(p.id,{at:this.t,damage:(earlier?.damage||0)+dealt,automatic:(earlier?.automatic??automatic)&&automatic});
    this.emit('hit',{x:m.x,z:m.z,amount:dealt,id:m.id});
    if(!m.hp)this.kill(m);else if(m.state==='idle'){m.state='chase';m.target=p.id;}
    return true;
  }
  strikeMob(p: Hero,m: Mob,amount: number,automatic=false){
    if(p.dead||safe(p)||m.state==='dead'||m.state==='return'||!clearPath(p,m))return false;
    if(this.random()>=stats(p).hitChance){
      p.combatUntil=this.t+15000;
      if(m.state==='idle'){m.state='chase';m.target=p.id;}
      this.emit('miss',{x:m.x,z:m.z,id:m.id},p.id);return false;
    }
    return this.hurtMob(p,m,amount,automatic);
  }
  kill(m: Mob){
    if(m.state==='dead')return;
    m.state='dead';m.timer=m.spotId?16:m.type==='alpha'?40:24;m.age=0;m.speed=0;m.slowUntil=0;
    const cfg=MOB_TYPES[m.type];
    // Recent nearby contributors receive personal rewards. A final hit cannot steal the kill.
    for(const [id,contribution] of m.contributors){
      const p=this.players.get(id);if(!p||p.dead||this.t-contribution.at>20000||distance(p,m)>12||contribution.damage<cfg.hp*.05)continue;
      const automatic=contribution.automatic===true;
      p.kills++;if(!automatic)p.questKills++;p.xp+=cfg.xp;if(m.type==='alpha')p.boss=true;
      while(p.xp>=stats(p).xpNeeded){p.xp-=stats(p).xpNeeded;p.level++;p.statRevision++;this.emit('level',{level:p.level,points:5},p.id);}
      this.addGroundDrop(p.id,{id:randomUUID(),kind:'gold',x:m.x,z:m.z,amount:cfg.coins,expiresAt:this.t+LOOT_TTL_MS});
      if(gearDrops(m.type,this.random)){
        const choices=CLASS_ITEMS[p.classId],definition=choices[Math.floor(this.random()*choices.length)];
        const item=rollEquipment(definition.id,randomUUID(),this.random);
        const shifted=stand(m.x+.22,m.z+.12),x=shifted?m.x+.22:m.x,z=shifted?m.z+.12:m.z;
        this.addGroundDrop(p.id,{id:randomUUID(),kind:'item',x,z,item,expiresAt:this.t+LOOT_TTL_MS});
      }
      this.emit('kill',{id:m.id,name:cfg.name,xp:cfg.xp},p.id);
    }
    m.contributors.clear();m.target=null;
  }
  resolveAttack(p: Hero,a: HeroAttack,attackPower: number){
    const skillId=a.skillId??(a.special?legacySkillId(p.classId):undefined),skill=skillId?SKILLS[skillId]:undefined;
    const yaw=a.yaw??p.yaw,baseDamage=attackPower*(p.classId==='warrior'&&a.weapon==='axe'?1.45:1);
    if(p.classId==='warrior'){
      const range=skill?.range??WEAPONS[a.weapon??p.weapon].range,halfAngle=skill?.halfAngle??.9;
      const targets=this.mobs.filter(m=>m.state!=='dead'&&m.state!=='return'&&inStrike(p,m,yaw,range,halfAngle))
        .sort((left,right)=>distance(p,left)-distance(p,right)||left.id-right.id).slice(0,skill?.maxTargets??1);
      for(const m of targets){
        if(a.automatic&&!p.afk)break;
        this.strikeMob(p,m,baseDamage*(skill?.damageScale??1),a.automatic===true);
      }
      if(skillId)this.emit('skillImpact',{x:p.x,z:p.z,skillId,caster:p.id,attackId:a.id,yaw});
    }else if(skillId==='mage-frost'){
      const targets=this.mobs.filter(m=>m.state!=='dead'&&m.state!=='return'&&inStrike(p,m,yaw,skill!.range,Math.PI))
        .sort((left,right)=>distance(p,left)-distance(p,right)||left.id-right.id).slice(0,skill!.maxTargets);
      for(const m of targets){
        if(a.automatic&&!p.afk)break;
        if(this.strikeMob(p,m,attackPower*skill!.damageScale,a.automatic===true)&&m.state!=='dead')m.slowUntil=Math.max(m.slowUntil??0,this.t+2000);
      }
      this.emit('skillImpact',{x:p.x,z:p.z,skillId,caster:p.id,attackId:a.id,yaw});
    }else if(skillId==='mage-lightning'){
      const hitIds=new Set<number>();let source: {x:number;z:number}=p;
      for(let index=0;index<skill!.maxTargets;index++){
        const reach=index===0?skill!.range:skill!.radius!;
        const next=this.mobs.filter(m=>m.state!=='dead'&&m.state!=='return'&&!hitIds.has(m.id)&&distance(source,m)<=reach&&clearPath(p,m)&&(index>0||inStrike(p,m,yaw,reach,.8)))
          .sort((left,right)=>distance(source,left)-distance(source,right)||left.id-right.id)[0];
        if(!next)break;
        if(a.automatic&&!p.afk)break;
        hitIds.add(next.id);this.strikeMob(p,next,attackPower*skill!.damageScale*.72**index,a.automatic===true);
        this.emit('skillImpact',{x:next.x,z:next.z,skillId,caster:p.id,attackId:a.id,yaw,from:{x:source.x,z:source.z}});source=next;
      }
    }else if(skillId==='archer-rain'||skillId==='mage-meteor'){
      const distanceAhead=skill!.range*.75,center={x:p.x+Math.sin(yaw)*distanceAhead,z:p.z+Math.cos(yaw)*distanceAhead};
      if(!stand(center.x,center.z,0)||safe(center)||!clearPath(p,center)){
        this.emit('skillImpact',{x:p.x,z:p.z,skillId,caster:p.id,attackId:a.id,yaw});return;
      }
      const delay=skillId==='archer-rain'?.45:.7;
      this.pendingAreas.push({skillId,caster:p.id,attackId:a.id,yaw,...center,at:this.t+delay*1000,damage:attackPower*skill!.damageScale,automatic:a.automatic===true});
      this.emit('skillImpact',{...center,skillId,caster:p.id,attackId:a.id,yaw,phase:'warning',delay,radius:skill!.radius});
    }else{
      const sharedHits: number[]=[],angles=skillId==='archer-volley'?[-.27,0,.27]:[0];
      for(const offset of angles)this.projectiles.push({
        id:randomUUID(),owner:p.id,x:p.x,z:p.z,yaw:yaw+offset,remaining:skill?.range??stats(p).range,
        speed:skill?.projectileSpeed??(p.classId==='archer'?13:9),kind:p.classId,
        damage:attackPower*(skill?.damageScale??1),aoe:skillId==='mage-fireball'?skill!.radius??0:0,
        ...(skillId?{skillId,attackId:a.id,maxTargets:skill!.maxTargets,hitIds:skillId==='archer-volley'?sharedHits:[],pierce:skillId==='archer-piercing',damageScaleOnPierce:.82,...(skillId==='archer-frost-shot'?{slowMs:2500}:{})}:{}),
        ...(a.automatic?{automatic:true}:{})
      });
    }
  }
  afkTargets(p: Hero){
    const spot=AFK_SPOTS.find(candidate=>candidate.id===p.afk?.spotId);
    if(!spot)return [];
    return this.mobs.filter(m=>spot.spawnIds.includes(m.id)&&m.spotId===spot.id&&m.state!=='dead'&&m.state!=='return'&&withinSpot(m,spot,-MOB_TYPES[m.type].radius)&&clearPath(p,m))
      .sort((left,right)=>distance(p,left)-distance(p,right)||left.id-right.id);
  }
  driveAfk(p: Hero){
    if(!p.afk)return {x:0,z:0,aim:null};
    if(!p.connected||p.dead){this.stopAfk(p);return {x:0,z:0,aim:null};}
    const spot=AFK_SPOTS.find(candidate=>candidate.id===p.afk?.spotId);
    if(!spot||!withinSpot(p,spot,-.46)){this.stopAfk(p,'Автоохота остановлена: герой вышел из спота');return {x:0,z:0,aim:null};}
    if(backpackItems(p).length>=BAG_CAPACITY&&p.pendingItems.length>=BAG_CAPACITY){this.stopAfk(p,'Автоохота остановлена: рюкзак и очередь добычи заполнены');return {x:0,z:0,aim:null};}
    const target=this.afkTargets(p)[0];p.afk.targetId=target?.id??null;
    if(p.attack)return {x:0,z:0,aim:target?Math.atan2(target.x-p.x,target.z-p.z):null};
    if(!target){
      if(distance(p,spot)<.6||!clearPath(p,spot))return {x:0,z:0,aim:null};
      const d=distance(p,spot);return {x:(spot.x-p.x)/d,z:(spot.z-p.z)/d,aim:null};
    }
    const yaw=Math.atan2(target.x-p.x,target.z-p.z),d=distance(p,target),limit=Math.max(1.5,stats(p).range-.35);
    return d>limit?{x:Math.sin(yaw),z:Math.cos(yaw),aim:yaw}:{x:0,z:0,aim:yaw};
  }
  autoAttack(p: Hero){
    if(!p.afk||p.attack||p.dead)return false;
    const targets=this.afkTargets(p),target=targets.find(m=>m.id===p.afk?.targetId)??targets[0];
    if(!target)return false;
    p.afk.targetId=target.id;
    const yaw=Math.atan2(target.x-p.x,target.z-p.z),d=distance(p,target);
    const [q,e]=skillsForClass(p.classId);
    const ready=(skill: typeof q)=>p.mana>=skill.manaCost&&Math.max(p.skillCooldowns?.[skill.id]??0,skill.id===legacySkillId(p.classId)?p.specialCooldown:0)<=0;
    let clustered=false;
    if(p.classId==='warrior'||p.classId==='mage')clustered=targets.filter(m=>distance(p,m)<=e.range).length>=2;
    else clustered=targets.filter(m=>distance(p,m)<=e.range&&Math.abs(angleDelta(yaw,Math.atan2(m.x-p.x,m.z-p.z)))<=.42).length>=2;
    if(p.classId==='mage'&&p.hp/stats(p).maxHp<.5&&d<=e.range)clustered=true;
    if(clustered&&d<=e.range&&ready(e)&&this.castSkill(p,e.id,yaw))return true;
    if(d<=q.range&&ready(q)&&this.castSkill(p,q.id,yaw))return true;
    if(d<=stats(p).range&&this.attack(p,yaw))return true;
    return false;
  }
  tick(dt: number,now=this.t+dt*1000){
    dt=Math.max(0,Math.min(.1,dt));this.t=now;this.age+=dt;
    this.groundLoot=this.groundLoot.filter(drop=>drop.expiresAt>this.t);
    for(const p of this.players.values()){
      if(p.shopActive&&!this.vendorAvailable(p))p.shopActive=false;
      p.hurt=Math.max(0,p.hurt-dt);p.potionCooldown=Math.max(0,p.potionCooldown-dt);
      for(const id of Object.keys(p.skillCooldowns??{}) as SkillId[])p.skillCooldowns![id]=Math.max(0,(p.skillCooldowns![id]??0)-dt);
      const legacyId=legacySkillId(p.classId);
      p.specialCooldown=Math.max(0,p.specialCooldown-dt,p.skillCooldowns?.[legacyId]??0);
      (p.skillCooldowns??={})[legacyId]=p.specialCooldown;
      if(p.dead>0){p.dead=Math.max(0,p.dead-dt);if(!p.dead)this.camp(p,true);continue;}
      if(p.afk&&p.hp/stats(p).maxHp<.4)this.potion(p);
      const input=p.afk?this.driveAfk(p):p.interactionTarget?this.interactionInput(p):p.connected&&this.t-p.inputAt<350?p.input:{x:0,z:0,aim:null};
      const s=stats(p),before={x:p.x,z:p.z,gait:p.gait};p.speedScale=s.speedScale;moveHero(p,dt,input);p.ack=p.input.seq;
      if(p.interactionTarget)this.interactionInput(p);
      if(p.afk){
        const spot=AFK_SPOTS.find(candidate=>candidate.id===p.afk?.spotId);
        if(!spot||!withinSpot(p,spot,-.46)){p.x=before.x;p.z=before.z;p.vx=p.vz=0;p.gait=before.gait;p.moveBlend=p.runBlend=0;}
        this.autoAttack(p);
      }
      if(p.attack){
        const a=p.attack;a.age+=dt;if(a.yaw===null&&a.age>=a.duration*.3)a.yaw=p.yaw;
        const attackSkill=a.skillId??(a.special?legacySkillId(p.classId):undefined);
        if(!a.hit&&a.age>=a.duration*(attackSkill?SKILLS[attackSkill].hitFraction:.49)){
          a.hit=true;this.resolveAttack(p,a,s.attack);
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
      if(m.state==='dead'){m.patrol=null;m.timer-=dt;if(m.timer<=0){Object.assign(m,{x:home.x,z:home.z,hp:cfg.hp,state:'idle',timer:1,age:0,target:null,slowUntil:0});m.contributors.clear();}continue;}
      const spot=m.spotId?AFK_SPOTS.find(candidate=>candidate.id===m.spotId):null;
      let p=m.target===null?undefined:this.players.get(m.target);
      if(m.state==='idle'){
        p=[...this.players.values()].filter(p=>!p.dead&&!safe(p)&&distance(p,m)<cfg.aggro&&clearPath(p,m)).sort((a,b)=>distance(a,m)-distance(b,m))[0];
        if(p){m.target=p.id;m.state='chase';m.age=0;}
      }
      if(['chase','windup','recover'].includes(m.state)&&(!p||p.dead||safe(p)||distance(p,m)>10.5)){
        const replacement=[...this.players.values()].filter(other=>!other.dead&&!safe(other)&&distance(other,m)<cfg.aggro&&clearPath(other,m)).sort((a,b)=>distance(a,m)-distance(b,m))[0];
        if(replacement){p=replacement;m.target=p.id;}
      }
      if(['chase','windup','recover'].includes(m.state)&&(!p||p.dead||safe(p)||distance(m,home)>7.4||distance(p,m)>10.5||(spot&&!withinSpot(m,spot,-cfg.radius)))){
        m.state='return';m.target=null;m.timer=0;m.contributors.clear();
      }
      if(m.state!=='idle'&&m.patrol){m.patrol.goal=null;m.patrol.speed=0;m.patrol.pause=1.1;}
      const slowScale=(m.slowUntil??0)>this.t?.7:1;
      if(m.state==='return'){
        const d=distance(m,home);if(d<.25){m.state='idle';m.hp=cfg.hp;m.timer=1;}
        else{const a=Math.atan2(home.x-m.x,home.z-m.z);m.yaw=turnTowards(m.yaw,a,dt,9);m.speed=translate(m,Math.sin(a)*cfg.speed*slowScale*dt,Math.cos(a)*cfg.speed*slowScale*dt,cfg.radius,true)/dt;}
      }else if(m.state==='windup'){
        m.timer-=dt;if(m.timer<=0){for(const target of this.players.values())if(clearPath(m,target)&&inStrike(m,target,m.targetYaw,cfg.range+.2,.72))this.damagePlayer(target,cfg.damage);m.state='recover';m.timer=cfg.cooldown;m.age=0;}
      }else if(m.state==='recover'){m.timer-=dt;if(m.timer<=0)m.state='chase';}
      else if(m.state==='chase'&&p){
        const a=Math.atan2(p.x-m.x,p.z-m.z);m.yaw=turnTowards(m.yaw,a,dt,10);
        if(distance(p,m)<cfg.range&&Math.abs(angleDelta(m.yaw,a))<.25){m.state='windup';m.timer=cfg.windup;m.targetYaw=a;m.age=0;}
        else m.speed=translate(m,Math.sin(a)*cfg.speed*slowScale*dt,Math.cos(a)*cfg.speed*slowScale*dt,cfg.radius,true)/dt;
      }else if(m.state==='idle'){
        this.patrol(m,dt,slowScale);
      }
      m.gait+=m.speed*dt*5.8;
    }
    for(let i=this.projectiles.length-1;i>=0;i--){
      const b=this.projectiles[i],owner=this.players.get(b.owner);let hit=false;
      const steps=Math.max(1,Math.ceil(b.speed*dt/.15));
      for(let k=0;k<steps&&!hit;k++){
        if(b.automatic&&!owner?.afk){hit=true;break;}
        b.x+=Math.sin(b.yaw)*b.speed*dt/steps;b.z+=Math.cos(b.yaw)*b.speed*dt/steps;b.remaining-=b.speed*dt/steps;
        if(!owner||b.remaining<=0||!stand(b.x,b.z,0)||safe(b)){
          if(b.skillId&&b.attackId!==undefined)this.emit('skillImpact',{x:b.x,z:b.z,skillId:b.skillId,caster:b.owner,attackId:b.attackId,yaw:b.yaw});
          hit=true;break;
        }
        const m=this.mobs.find(m=>m.state!=='dead'&&m.state!=='return'&&!b.hitIds?.includes(m.id)&&distance(m,b)<MOB_TYPES[m.type].radius+.2);
        if(!m)continue;
        if(b.skillId&&b.attackId!==undefined)this.emit('skillImpact',{x:m.x,z:m.z,skillId:b.skillId,caster:b.owner,attackId:b.attackId,yaw:b.yaw});
        if(b.aoe){
          const targets=this.mobs.filter(other=>other.state!=='dead'&&other.state!=='return'&&(other===m||distance(other,m)<=b.aoe))
            .sort((left,right)=>(left===m?-1:right===m?1:distance(left,m)-distance(right,m))||left.id-right.id).slice(0,b.maxTargets??this.mobs.length);
          for(const target of targets){
            if(b.automatic&&!owner.afk)break;
            b.hitIds?.push(target.id);this.strikeMob(owner,target,b.damage*(target===m?1:.65),b.automatic===true);
          }
          hit=true;
        }else{
          const ordinal=b.hitIds?.length??0;
          b.hitIds?.push(m.id);
          const struck=this.strikeMob(owner,m,b.damage*(b.pierce?(b.damageScaleOnPierce??1)**ordinal:1),b.automatic===true);
          if(struck&&b.slowMs&&m.state!=='dead')m.slowUntil=Math.max(m.slowUntil??0,this.t+b.slowMs);
          hit=!b.pierce||(b.hitIds?.length??0)>=(b.maxTargets??1);
        }
      }
      if(hit)this.projectiles.splice(i,1);
    }
    for(let i=this.pendingAreas.length-1;i>=0;i--){
      const area=this.pendingAreas[i];if(this.t<area.at)continue;this.pendingAreas.splice(i,1);
      const owner=this.players.get(area.caster),skill=SKILLS[area.skillId];
      if(!owner||owner.dead||area.automatic&&!owner.afk)continue;
      const targets=this.mobs.filter(m=>m.state!=='dead'&&m.state!=='return'&&distance(area,m)<=skill.radius!&&clearPath(owner,m))
        .sort((left,right)=>distance(area,left)-distance(area,right)||left.id-right.id).slice(0,skill.maxTargets);
      for(const m of targets){
        const falloff=area.skillId==='mage-meteor'?Math.max(.68,1-.32*distance(area,m)/skill.radius!):1;
        this.strikeMob(owner,m,area.damage*falloff,area.automatic);
      }
      this.emit('skillImpact',{x:area.x,z:area.z,skillId:area.skillId,caster:area.caster,attackId:area.attackId,yaw:area.yaw,phase:'impact',radius:skill.radius});
    }
  }
  snapshot(forId: string): WorldSnapshot{
    const p=this.players.get(forId);
    return {t:this.t,players:[...this.players.values()].map(p=>({id:p.id,name:p.name,classId:p.classId,x:p.x,z:p.z,yaw:p.yaw,weapon:p.weapon,hp:p.hp,maxHp:stats(p).maxHp,level:p.level,dead:p.dead,hurt:p.hurt,attack:p.attack,moveBlend:p.moveBlend,runBlend:p.runBlend,gait:p.gait,vx:p.vx,vz:p.vz,connected:p.connected,appearance:equipmentAppearance(p)})),mobs:this.mobs.map(({contributors,patrol,slowUntil,slow,...m})=>({...m,slow:Math.max(0,((slowUntil??0)-this.t)/1000)})),projectiles:this.projectiles.map(({damage,aoe,maxTargets,hitIds,pierce,damageScaleOnPierce,slowMs,automatic,...b})=>b),groundLoot:this.groundLoot.filter(drop=>drop.owner===forId).map(({owner,...drop})=>drop),self:p?{...stats(p),...persistentHero(p),appearance:equipmentAppearance(p),attackPower:stats(p).attack,targetYaw:p.targetYaw,vx:p.vx,vz:p.vz,hurt:p.hurt,gait:p.gait,moveBlend:p.moveBlend,runBlend:p.runBlend,ack:p.ack,afk:p.afk,interactionTarget:p.interactionTarget,shopActive:p.shopActive}:null,events:this.events.filter(e=>!e.owner||e.owner===forId)};
  }
}
