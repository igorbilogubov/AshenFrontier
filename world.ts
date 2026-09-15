import {CAMP_SPAWN} from './public/game/camp-layout.js';
import {CLASS_ITEMS,rollEquipment,validateEquipment,equipmentAppearance} from './public/game/equipment-items.js';
import type {ClassId, EquipmentSlot, Item, Hero, PersistentHero, HeroAttack, Mob, Projectile, WorldEvent, EventPayloads, WorldSnapshot, SkillId, SkillCooldowns, GroundDrop, Point, ConsumableStack, QuickSlots} from './shared/types.js';
import {isRecord, isClassId, isEquipmentSlot, isWeaponId} from './shared/types.js';
import {randomUUID} from 'node:crypto';
import {CLASSES,EQUIPMENT_SLOTS,BAG_CAPACITY,backpackItems,classFor,canEquip,STAT_KEYS,CLASS_PROGRESSION,characterStats,normalizedAllocations} from './public/rules.js';
import {BOUNDS,CAMP,SPAWNS,MOB_TYPES,WEAPONS,AFK_SPOTS,afkSpotAt,withinSpot,safe,stand,clearPath,distance,translate,moveHero} from './public/game/location.js';
import {angleDelta,turnTowards,inStrike} from './public/game/motion.js';
import {SKILLS,skillsForClass,legacySkillId} from './public/game/skills.js';
import {LOOT_TTL_MS,MAX_GROUND_DROPS_PER_HERO,PICKUP_RANGE,gearDrops} from './public/game/loot-rules.js';
import {portalById} from './public/game/stadium.js';
import {locationAt,sameLocation} from './public/game/world-layout.js';
import {SHOP,shopPrice,sellPrice} from './public/game/shop.js';
import {defaultAfkPreferences,parseAfkPreferences,afkCombatRadius} from './public/game/afk-preferences.js';
import {PERSONAL_CHEST,CHEST_APPROACH,CHEST_DOOR_OUTSIDE,CHEST_DOOR_INSIDE,inChestRoom} from './public/game/personal-stash.js';
import {consumable,CONSUMABLE_LIMIT,consumableDefinition,consumableKindQuantity,consumableQuantity,assignedConsumable,isQuickSlot,backpackUsage,validateConsumables,type ConsumableKind} from './public/game/consumables.js';
export {CLASSES,EQUIPMENT_SLOTS,CAMP,BOUNDS};
export const SAVE_VERSION=3;
const finite=(value: unknown,fallback=0)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const nonnegative=(value: unknown,fallback=0)=>Math.max(0,finite(value,fallback));
const CHASE_HOME_LIMIT=28,CHASE_TARGET_LIMIT=30,HOME_REST_SECONDS=3;

const liveMob=(m:Mob)=>m.state!=='dead';
const validPoint=(value:unknown):value is Point=>isRecord(value)&&typeof value.x==='number'&&Number.isFinite(value.x)&&typeof value.z==='number'&&Number.isFinite(value.z);
const bodyStrike=(origin:Point,m:Mob,yaw:number,range:number,halfAngle:number)=>{
  const d=distance(origin,m),radius=MOB_TYPES[m.type].radius;
  return inStrike(origin,m,yaw,range+radius,halfAngle+Math.min(.16,Math.asin(Math.min(1,radius/Math.max(d,.1)))))&&!safe(m);
};
const slotNames={armor:['Кожаный доспех','Доспех дозорного','Пепельный панцирь'],helmet:['Кожаный шлем','Шлем дозорного','Шлем рубежа'],boots:['Походные сапоги','Сапоги следопыта','Сапоги рубежа'],ring:['Медное кольцо','Кольцо охотника','Кольцо рассвета'],amulet:['Оберег путника','Оберег леса','Оберег огня']};
export function makeLoot(classId: ClassId,level=1,rarity=0,slot: EquipmentSlot='weapon'): Item{
  return {id:randomUUID(),name:(slot==='weapon'?classFor(classId).weaponNames:slotNames[slot])[rarity],slot,rarity,power:Math.max(1,Math.round(level+rarity*3+(slot==='amulet'?5:0))),...(slot==='weapon'?{classId}:{} )};
}
export const stats=characterStats;
export function newHero(name='Странник',classId: ClassId='warrior'): Hero{
  if(!Object.hasOwn(CLASSES,classId))classId='warrior';
  const weapon={...makeLoot(classId,1,0,'weapon'),bound:true},armor={...makeLoot(classId,1,0,'armor'),bound:true};
  return safeHero({schemaVersion:SAVE_VERSION,id:randomUUID(),name,classId,level:1,xp:0,gold:0,kills:0,items:[weapon,armor],stash:[],equipment:{weapon:weapon.id,armor:armor.id},...CAMP_SPAWN,hp:classFor(classId).hp,mana:CLASS_PROGRESSION[classId].mana,potions:3,manaPotions:3});
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
  if(!isRecord(value)||!['id','age','duration'].every(key=>typeof value[key]==='number'&&Number.isFinite(value[key]))||(value.yaw!==null&&(typeof value.yaw!=='number'||!Number.isFinite(value.yaw)))||typeof value.hit!=='boolean'||typeof value.special!=='boolean'||(value.weapon!==undefined&&!isWeaponId(value.weapon))||(value.automatic!==undefined&&typeof value.automatic!=='boolean')||(value.skillId!==undefined&&(!Object.hasOwn(SKILLS,String(value.skillId))||SKILLS[value.skillId as SkillId].classId!==classId))||(value.targetId!==undefined&&!Number.isSafeInteger(value.targetId))||(value.target!==undefined&&!validPoint(value.target)))throw new Error('Invalid saved attack');
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
  const stash=raw.stash===undefined?[]:raw.stash;
  if(!Array.isArray(stash)||stash.length>32||new Set(stash).size!==stash.length||stash.some(id=>typeof id!=='string'||!items.some(item=>item.id===id)||Object.values(equipment).includes(id)))throw new Error('Invalid saved stash');
  const x=finite(raw.x,CAMP_SPAWN.x),z=finite(raw.z,CAMP_SPAWN.z),position=legacy||typeof raw.x!=='number'||typeof raw.z!=='number'||!Number.isFinite(raw.x)||!Number.isFinite(raw.z)||!stand(x,z)?CAMP_SPAWN:{x,z};
  const yaw=finite(raw.yaw,Math.PI*.25),legacyId=legacySkillId(classId),specialCooldown=legacy?0:nonnegative(raw.specialCooldown);
  const skillCooldowns: SkillCooldowns={};
  if(isRecord(raw.skillCooldowns))for(const skill of Object.values(SKILLS))if(skill.classId===classId&&Object.hasOwn(raw.skillCooldowns,skill.id))skillCooldowns[skill.id]=nonnegative(raw.skillCooldowns[skill.id]);
  skillCooldowns[legacyId]=Math.max(specialCooldown,skillCooldowns[legacyId]??0);
  const restoredAttack=legacy?null:savedAttack(raw.attack,classId);
  const oldConsumables=raw.consumableInventory===undefined;
  const consumableInventory:ConsumableStack[]=oldConsumables?(['hp','mana'] as const).flatMap(kind=>{
    const quantity=Math.min(CONSUMABLE_LIMIT,Math.floor(nonnegative(kind==='hp'?raw.potions:raw.manaPotions,3)));
    return quantity?[{id:randomUUID(),definitionId:consumable(kind)!.id,quantity}]:[];
  }):raw.consumableInventory as ConsumableStack[];
  const quickSlots:QuickSlots=oldConsumables?{q:'hp-basic',w:'mana-basic'}:raw.quickSlots as QuickSlots;
  validateConsumables(consumableInventory,quickSlots);
  const usage=backpackUsage({items,equipment,stash,consumableInventory});
  const consumableOverflow=oldConsumables?Math.max(0,usage-BAG_CAPACITY):Math.min(nonnegative(raw.consumableOverflow),Math.max(0,usage-BAG_CAPACITY));
  if(!Number.isSafeInteger(consumableOverflow)||consumableOverflow>2)throw new Error('Invalid consumable overflow');
  const p: Hero={
    schemaVersion:SAVE_VERSION,id:typeof raw.id==='string'?raw.id:randomUUID(),name:String(raw.name||'Странник').replace(/[\p{C}<>]/gu,'').slice(0,18),
    classId,level,xp:nonnegative(raw.xp),gold:nonnegative(raw.gold??raw.coins),kills:Math.floor(nonnegative(raw.kills)),items,pendingItems,stash,equipment,consumableInventory,quickSlots,consumableOverflow,
    allocatedStats:normalizedAllocations(migrateStats?null:raw.allocatedStats,level),statRevision:!migrateStats&&typeof raw.statRevision==='number'&&Number.isSafeInteger(raw.statRevision)&&raw.statRevision>=0?raw.statRevision:0,
    ...position,yaw,targetYaw:yaw,weapon:raw.weapon==='axe'?'axe':'sword',
    questKills:legacy?0:nonnegative(raw.questKills),boss:legacy?false:!!raw.boss,questClaimed:legacy?false:!!raw.questClaimed,
    potions:consumableKindQuantity({consumableInventory},'hp'),potionCooldown:legacy?0:nonnegative(raw.potionCooldown),manaPotions:consumableKindQuantity({consumableInventory},'mana'),manaPotionCooldown:nonnegative(raw.manaPotionCooldown),specialCooldown:skillCooldowns[legacyId]??0,skillCooldowns,dead:legacy?0:nonnegative(raw.dead),combatUntil:legacy?0:nonnegative(raw.combatUntil),
    hp:0,mana:0,attack:restoredAttack?.automatic?null:restoredAttack,attackSerial:nonnegative(raw.attackSerial),
    vx:0,vz:0,hurt:0,gait:0,moveBlend:0,runBlend:0,running:!!raw.running,input:{x:0,z:0,aim:null,seq:0},inputAt:0,ack:0,connected:true,disconnectAt:0,afk:null,interactionTarget:null,shopActive:false,stashActive:false,
    afkPreferences:parseAfkPreferences(raw.afkPreferences,classId)??defaultAfkPreferences(classId)
  };
  p.hp=Math.min(stats(p).maxHp,nonnegative(raw.hp,stats(p).maxHp));if(!p.hp&&!p.dead)p.dead=2.5;
  // V2 had no mana. Grant its initial pool once; reconnecting V3 never refills it.
  p.mana=migrateStats?stats(p).maxMana:Math.min(stats(p).maxMana,nonnegative(raw.mana));
  return p;
}
export function persistentHero(p: Hero): PersistentHero{
  // Compatibility counters are a projection, never an independent inventory.
  p.potions=consumableKindQuantity(p,'hp');p.manaPotions=consumableKindQuantity(p,'mana');
  p.consumableOverflow=Math.min(p.consumableOverflow,Math.max(0,backpackUsage(p)-BAG_CAPACITY));
  const fields=['schemaVersion','id','name','classId','level','xp','gold','kills','items','pendingItems','stash','equipment','consumableInventory','quickSlots','consumableOverflow','allocatedStats','statRevision','x','z','yaw','weapon','hp','mana','potions','potionCooldown','manaPotions','manaPotionCooldown','specialCooldown','skillCooldowns','dead','combatUntil','attack','attackSerial','running','questKills','boss','questClaimed','afkPreferences'] as const;
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
  add(p: Hero){this.stopAfk(p);this.stopInteraction(p);this.players.set(p.id,p);p.connected=true;p.disconnectAt=0;p.afk=null;p.shopActive=false;p.stashActive=false;}
  emit<K extends keyof EventPayloads>(type: K,data: EventPayloads[K],owner?: string){this.events.push({type,...data,...(owner?{owner}:{})} as WorldEvent);}
  remove(id: string){const p=this.players.get(id);if(p){this.stopAfk(p);this.stopInteraction(p);p.shopActive=false;p.stashActive=false;}this.players.delete(id);this.purchaseReceipts.delete(id);}
  notice(p: Hero,text: string){this.emit('notice',{text},p.id);}
  /** Crossing the authored safe boundary ends the local fight before interactions. */
  settleSafe(p:Hero){
    if(!safe(p))return false;
    if(p.attack||p.combatUntil>this.t||this.projectiles.some(b=>b.owner===p.id)||this.pendingAreas.some(a=>a.caster===p.id)){
      p.attack=null;p.combatUntil=this.t;
      this.projectiles=this.projectiles.filter(b=>b.owner!==p.id);
      this.pendingAreas=this.pendingAreas.filter(a=>a.caster!==p.id);
    }
    for(const m of this.mobs)if(m.target===p.id&&m.state!=='dead'){
      m.target=null;m.state='return';m.timer=0;m.age=0;
    }
    return true;
  }
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
      if(backpackUsage(p)>=BAG_CAPACITY){this.notice(p,'Рюкзак полон. Вещь остаётся на земле');this.stopInteraction(p);return false;}
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
  vendorAvailable(p:Hero){this.settleSafe(p);return p.connected&&!p.dead&&!p.attack&&p.combatUntil<=this.t&&safe(p)&&distance(p,SHOP)<=SHOP.range&&clearPath(p,SHOP);}
  openShop(p:Hero){
    if(!this.vendorAvailable(p))return false;
    this.stopInteraction(p);p.shopActive=true;this.emit('shopOpen',{npcId:SHOP.id},p.id);return true;
  }
  startVendor(p:Hero,npcId:unknown){
    this.stopAfk(p);
    if(npcId!==SHOP.id||!p.connected||p.dead)return false;
    this.settleSafe(p);
    if(p.attack||p.combatUntil>this.t){this.notice(p,'Торговец доступен вне боя');return false;}
    if(!clearPath(p,SHOP)){this.notice(p,'К торговцу нет прямого прохода');return false;}
    if(distance(p,SHOP)<=SHOP.range)return this.openShop(p);
    this.stopInteraction(p);p.interactionTarget={kind:'vendor',id:SHOP.id};p.input={...p.input,x:0,z:0,aim:null};return true;
  }
  chestAvailable(p:Hero){return p.connected&&!p.dead&&!p.attack&&p.combatUntil<=this.t&&locationAt(p)==='forest'&&inChestRoom(p)&&distance(p,PERSONAL_CHEST)<=PERSONAL_CHEST.range;}
  openStash(p:Hero){
    if(!this.chestAvailable(p))return false;
    this.stopAfk(p);this.stopInteraction(p);p.shopActive=false;p.stashActive=true;
    this.emit('stashOpened',{npcId:PERSONAL_CHEST.id},p.id);return true;
  }
  startChest(p:Hero,id:unknown){
    if(id!==PERSONAL_CHEST.id||!p.connected||p.dead)return false;
    if(p.attack||p.combatUntil>this.t){this.notice(p,'Сундук доступен вне боя');return false;}
    this.stopAfk(p);p.shopActive=false;
    if(this.chestAvailable(p))return this.openStash(p);
    this.stopInteraction(p);p.interactionTarget={kind:'chest',id:PERSONAL_CHEST.id};p.input={...p.input,x:0,z:0,aim:null};return true;
  }
  transferStash(p:Hero,id:unknown,withdraw:boolean){
    if(!p.stashActive||!this.chestAvailable(p)||typeof id!=='string')return false;
    if(withdraw){
      const index=p.stash.indexOf(id);
      if(index<0)return false;
      if(backpackUsage(p)>=BAG_CAPACITY){this.notice(p,'Рюкзак полон');return false;}
      p.stash.splice(index,1);return true;
    }
    if(p.stash.includes(id)||p.stash.length>=32)return false;
    const item=backpackItems(p).find(item=>item.id===id);
    if(!item)return false;
    p.stash.push(item.id);return true;
  }
  portalAvailable(p:Hero){
    this.settleSafe(p);
    return p.connected&&!p.dead&&!p.attack&&p.combatUntil<=this.t&&!this.mobs.some(m=>m.target===p.id&&['chase','windup','recover'].includes(m.state));
  }
  usePortal(p:Hero,id:unknown){
    const portal=portalById(id);
    if(!portal||!sameLocation(p,portal)||!this.portalAvailable(p)||distance(p,portal)>portal.range||!clearPath(p,portal))return false;
    if(!stand(portal.destination.x,portal.destination.z))return false;
    this.stopAfk(p);this.stopInteraction(p);p.shopActive=false;
    this.projectiles=this.projectiles.filter(projectile=>projectile.owner!==p.id);
    this.pendingAreas=this.pendingAreas.filter(area=>area.caster!==p.id);
    Object.assign(p,{...portal.destination,yaw:Math.PI,targetYaw:Math.PI,vx:0,vz:0,attack:null,moveBlend:0,runBlend:0,gait:0,inputAt:0,input:{...p.input,x:0,z:0,aim:null}});
    this.emit('portal',{portalId:portal.id,location:locationAt(p)},p.id);return true;
  }
  startPortal(p:Hero,id:unknown){
    const portal=portalById(id);
    if(!portal||!sameLocation(p,portal)||!p.connected||p.dead)return false;
    if(!this.portalAvailable(p)){this.notice(p,'Портал доступен вне боя. Сначала оторвитесь от врагов');return false;}
    if(!clearPath(p,portal)){this.notice(p,'К порталу нет прямого прохода');return false;}
    this.stopAfk(p);this.stopInteraction(p);p.shopActive=false;
    if(distance(p,portal)<=portal.range)return this.usePortal(p,portal.id);
    p.interactionTarget={kind:'portal',id:portal.id};p.input={...p.input,x:0,z:0,aim:null};return true;
  }
  buy(p:Hero,definitionId:unknown,requestId:unknown){
    if(!p.shopActive||!this.vendorAvailable(p))return false;
    const price=shopPrice(definitionId);
    if(price===undefined)return false;
    if(typeof requestId==='string'){
      if(requestId.length>80||requestId.length===0)return false;
      if(this.purchaseReceipts.get(p.id)?.includes(requestId))return false;
    }else if(requestId!==undefined)return false;
    if(backpackUsage(p)>=BAG_CAPACITY){this.notice(p,'Рюкзак полон');return false;}
    if(p.gold<price){this.notice(p,'Не хватает золота');return false;}
    const item=rollEquipment(String(definitionId),randomUUID(),()=>0);
    p.gold-=price;p.items.push(item);
    if(typeof requestId==='string'){
      const receipts=this.purchaseReceipts.get(p.id)??[];receipts.push(requestId);
      if(receipts.length>64)receipts.shift();this.purchaseReceipts.set(p.id,receipts);
    }
    this.notice(p,`Куплено: ${item.name}`);return true;
  }
  buyConsumable(p:Hero,kind:unknown,requestId:unknown){
    if(!p.shopActive||!this.vendorAvailable(p))return false;
    const listing=consumable(kind);if(!listing)return false;
    if(typeof requestId==='string'){
      if(!requestId.length||requestId.length>80||this.purchaseReceipts.get(p.id)?.includes(requestId))return false;
    }else if(requestId!==undefined)return false;
    const count=consumableKindQuantity(p,listing.kind),stack=p.consumableInventory.find(stack=>stack.definitionId===listing.id);
    if(count>=CONSUMABLE_LIMIT){this.notice(p,'Запас зелий полон');return false;}
    if(p.gold<listing.price){this.notice(p,'Не хватает золота');return false;}
    if(!stack&&backpackUsage(p)>=BAG_CAPACITY){this.notice(p,'Рюкзак полон');return false;}
    p.gold-=listing.price;
    if(stack)stack.quantity++;else p.consumableInventory.push({id:randomUUID(),definitionId:listing.id,quantity:1});
    p.potions=consumableKindQuantity(p,'hp');p.manaPotions=consumableKindQuantity(p,'mana');
    if(typeof requestId==='string'){
      const receipts=this.purchaseReceipts.get(p.id)??[];receipts.push(requestId);
      if(receipts.length>64)receipts.shift();this.purchaseReceipts.set(p.id,receipts);
    }
    this.notice(p,`Куплено: ${listing.name}`);return true;
  }
  interactionInput(p:Hero){
    const target=p.interactionTarget;if(!target)return {x:0,z:0,aim:null};
    const chestGoal=!inChestRoom(p)?distance(p,CHEST_DOOR_OUTSIDE)>.55?CHEST_DOOR_OUTSIDE:CHEST_DOOR_INSIDE:CHEST_APPROACH;
    const point=target.kind==='vendor'?SHOP:target.kind==='portal'?portalById(target.id):target.kind==='chest'?chestGoal:this.groundDrop(p,target.id);
    if(!point||!p.connected||p.dead||p.attack||(target.kind!=='chest'&&!clearPath(p,point))){this.stopInteraction(p);return {x:0,z:0,aim:null};}
    if(target.kind==='portal'&&(!sameLocation(p,point)||!this.portalAvailable(p))){this.stopInteraction(p);return {x:0,z:0,aim:null};}
    const limit=target.kind==='vendor'?SHOP.range:target.kind==='portal'?portalById(target.id)!.range:target.kind==='chest'?.12:PICKUP_RANGE,d=distance(p,point);
    if(target.kind==='chest'&&this.chestAvailable(p)){this.openStash(p);return {x:0,z:0,aim:null};}
    if(d<=limit){if(target.kind==='vendor')this.openShop(p);else if(target.kind==='portal')this.usePortal(p,target.id);else if(target.kind!=='chest')this.pickUp(p,target.id);return {x:0,z:0,aim:null};}
    const yaw=Math.atan2(point.x-p.x,point.z-p.z);
    return {x:Math.sin(yaw),z:Math.cos(yaw),aim:yaw};
  }
  stopAfk(p: Hero,reason?: string){
    if(!p.afk)return false;
    p.afk=null;p.input={...p.input,x:0,z:0,aim:null};p.vx=p.vz=0;
    if(p.attack?.automatic)p.attack=null;
    for(const b of this.projectiles)if(b.owner===p.id&&b.automatic)b.remaining=0;
    this.pendingAreas=this.pendingAreas.filter(area=>area.caster!==p.id||!area.automatic);
    if(reason&&p.connected)this.notice(p,reason);
    return true;
  }
  startAfk(p: Hero){
    if(!p.connected||p.dead){this.notice(p,'Автоохота доступна только живому подключённому герою');return false;}
    if(!stand(p.x,p.z)){this.notice(p,'Автоохота недоступна в этой точке');return false;}
    if(p.afk)return true;
    this.stopInteraction(p);
    const spot=afkSpotAt(p);
    p.afk={anchor:{x:p.x,z:p.z},...(spot?{spotId:spot.id}:{}),targetId:null,skillCursor:0};
    p.input={...p.input,x:0,z:0,aim:null};p.vx=p.vz=p.moveBlend=p.runBlend=0;
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
    if(msg.type==='afkPreferences'){
      const preferences=parseAfkPreferences(msg.preferences,p.classId);
      if(!preferences){this.emit('preferencesSaved',{ok:false,message:'Некорректные настройки автоохоты'},p.id);return;}
      p.afkPreferences=preferences;
      if(p.afk&&p.afk.skillCursor>=preferences.skillOrder.length)p.afk.skillCursor=0;
      this.emit('preferencesSaved',{ok:true},p.id);return;
    }
    if(msg.type==='input'){
      if(typeof msg.x!=='number'||typeof msg.z!=='number'||!Number.isFinite(msg.x)||!Number.isFinite(msg.z)||Math.abs(msg.x)>1||Math.abs(msg.z)>1||(msg.aim!==null&&(typeof msg.aim!=='number'||!Number.isFinite(msg.aim)))||typeof msg.seq!=='number'||!Number.isSafeInteger(msg.seq)||msg.seq<=p.input.seq)return;
      if(Math.hypot(msg.x,msg.z)>.01){this.stopAfk(p);this.stopInteraction(p);p.stashActive=false;}
      p.input={x:msg.x,z:msg.z,aim:msg.aim,seq:msg.seq};p.inputAt=this.t;return;
    }
    if(msg.type==='attack'){this.stopAfk(p);this.stopInteraction(p);p.stashActive=false;if(typeof msg.yaw==='number'&&Number.isFinite(msg.yaw))this.attack(p,msg.yaw,msg.special===true,msg.targetId);return;}
    if(msg.type==='skill'){this.stopAfk(p);this.stopInteraction(p);p.stashActive=false;if(typeof msg.yaw==='number'&&Number.isFinite(msg.yaw)&&typeof msg.skillId==='string'&&Object.hasOwn(SKILLS,msg.skillId))this.castSkill(p,msg.skillId as SkillId,msg.yaw,msg.targetId,msg.target);return;}
    if(msg.type==='assignConsumable'){this.assignConsumable(p,msg.slot,msg.definitionId);return;}
    if(msg.type==='useConsumable'){if(isQuickSlot(msg.slot)){this.stopInteraction(p);this.useConsumable(p,msg.slot);}return;}
    if(msg.type==='potion'){this.stopInteraction(p);if(msg.kind===undefined||msg.kind==='hp'||msg.kind==='mana')this.potion(p,msg.kind??'hp');return;}
    if(msg.type==='pickup'){this.startPickup(p,msg.id);return;}
    if(msg.type==='interact'){if(msg.npcId===PERSONAL_CHEST.id)this.startChest(p,msg.npcId);else this.startVendor(p,msg.npcId);return;}
    if(msg.type==='stashOpen'){this.openStash(p);return;}
    if(msg.type==='stashClose'){p.stashActive=false;this.stopInteraction(p);return;}
    if(msg.type==='stashDeposit'||msg.type==='stashWithdraw'){this.transferStash(p,msg.id,msg.type==='stashWithdraw');return;}
    if(msg.type==='cancelInteraction'){this.stopInteraction(p);return;}
    if(msg.type==='portal'){this.startPortal(p,msg.portalId);return;}
    if(msg.type==='buy'){this.buy(p,msg.definitionId,msg.requestId);return;}
    if(msg.type==='buyConsumable'){this.buyConsumable(p,msg.kind,msg.requestId);return;}
    if(msg.type==='run'&&typeof msg.running==='boolean'&&!p.dead){p.running=msg.running;return;}
    if(msg.type==='weapon'&&isWeaponId(msg.weapon)&&!p.attack&&!p.dead){const weapon=p.items.find(item=>item.id===p.equipment.weapon);if(weapon?.definitionId){this.notice(p,'Вид оружия определяется надетым предметом');return;}p.weapon=msg.weapon;return;}
    if(msg.type==='camp'){
      this.stopAfk(p);this.stopInteraction(p);p.shopActive=false;p.stashActive=false;
      this.settleSafe(p);
      if(p.dead||p.combatUntil>this.t||this.mobs.some(m=>m.target===p.id&&['chase','windup','recover'].includes(m.state))){this.notice(p,'Сначала оторвитесь от врагов');return;}
      this.camp(p,false);return;
    }
    if(typeof msg.type==='string'&&['equip','unequip','sell','claim'].includes(msg.type)){
      if(!safe(p)||p.dead||p.attack||p.combatUntil>this.t){this.notice(p,'Снаряжение меняется у костра, вне боя');return;}
      if(msg.type==='claim'){while(p.pendingItems.length&&backpackUsage(p)<BAG_CAPACITY)p.items.push(p.pendingItems.shift()!);return;}
      const item=backpackItems(p).find(i=>i.id===msg.id)??(msg.type==='unequip'?p.items.find(i=>i.id===msg.id&&p.equipment[i.slot]===i.id):undefined);if(!item)return;
      if(msg.type==='equip'&&canEquip(p,item)){p.equipment[item.slot]=item.id;if(item.definitionId&&item.slot==='weapon')p.weapon='sword';this.clampResources(p);}
      if(msg.type==='unequip'&&p.equipment[item.slot]===item.id){if(backpackUsage(p)>=BAG_CAPACITY){this.notice(p,'Рюкзак полон. Освободите ячейку, чтобы снять вещь.');return;}p.equipment[item.slot]=null;this.clampResources(p);}
      if(msg.type==='sell'&&p.shopActive&&this.vendorAvailable(p)&&!Object.values(p.equipment).includes(item.id)){p.gold+=sellPrice(item);p.items=p.items.filter(i=>i.id!==item.id);}

    }
  }
  aimedMob(p:Hero,id:unknown,range:number){
    if(id===undefined)return undefined;
    const m=Number.isSafeInteger(id)?this.mobs.find(m=>m.id===id):undefined;
    if(!m||!liveMob(m)||!sameLocation(p,m)||safe(m)){this.notice(p,'Цель недоступна');return null;}
    if(distance(p,m)>range+MOB_TYPES[m.type].radius){this.notice(p,'Цель вне дальности навыка');return null;}
    if(!clearPath(p,m)){this.notice(p,'Цель закрыта препятствием');return null;}
    return m;
  }
  attack(p: Hero,yaw: number,special=false,targetId?:unknown){
    if(special)return this.castSkill(p,legacySkillId(p.classId),yaw,targetId);
    if(!Number.isFinite(yaw))return false;
    if(p.dead||p.attack)return false;
    if(safe(p)){this.emit('safe',{},p.id);return false;}
    const aimed=this.aimedMob(p,targetId,p.classId==='warrior'?WEAPONS[p.weapon].range:stats(p).range);
    if(aimed===null)return false;
    if(aimed)yaw=Math.atan2(aimed.x-p.x,aimed.z-p.z);
    p.targetYaw=Math.atan2(Math.sin(yaw),Math.cos(yaw));
    const c=classFor(p.classId),duration=(p.classId==='warrior'?WEAPONS[p.weapon].duration:c.duration)/(1+stats(p).attackSpeed);
    p.attack={id:++p.attackSerial,age:0,duration,weapon:p.weapon,yaw:null,hit:false,special:false,...(aimed?{targetId:aimed.id}:{}),...(p.afk?{automatic:true}:{})};
    p.combatUntil=this.t+15000;
    return true;
  }
  /** Also used by server-driven AFK actions; every cast follows the same checks. */
  castSkill(p: Hero,skillId: SkillId,yaw: number,targetId?:unknown,target?:unknown){
    const skill=SKILLS[skillId];
    if(!skill||skill.classId!==p.classId||!Number.isFinite(yaw)||p.dead||p.attack)return false;
    if(safe(p)){this.emit('safe',{},p.id);return false;}
    const aimed=this.aimedMob(p,targetId,skill.range);
    if(aimed===null)return false;
    if(aimed)yaw=Math.atan2(aimed.x-p.x,aimed.z-p.z);
    const areaSkill=skillId==='archer-rain'||skillId==='mage-meteor';
    let center:Point|undefined;
    if(target!==undefined){
      if(!areaSkill||!validPoint(target)||!sameLocation(p,target)){this.notice(p,'Неверная точка навыка');return false;}
      const d=distance(p,target),scale=d>skill.range?skill.range/d:1;
      center={x:p.x+(target.x-p.x)*scale,z:p.z+(target.z-p.z)*scale};
      if(!stand(center.x,center.z,0)||safe(center)||!clearPath(p,center)){this.notice(p,'Точка навыка недоступна');return false;}
      yaw=Math.atan2(center.x-p.x,center.z-p.z);
    }
    const cd=Math.max(p.skillCooldowns?.[skillId]??0,skillId===legacySkillId(p.classId)?p.specialCooldown:0);
    if(cd>0)return false;
    if(p.mana<skill.manaCost){this.notice(p,'Не хватает маны. Обычная атака не расходует ману');return false;}
    p.targetYaw=Math.atan2(Math.sin(yaw),Math.cos(yaw));
    const c=classFor(p.classId),base=(p.classId==='warrior'?WEAPONS[p.weapon].duration:c.duration)/(1+stats(p).attackSpeed);
    p.attack={id:++p.attackSerial,age:0,duration:base*skill.durationScale,weapon:p.weapon,yaw:null,hit:false,special:true,skillId,...(aimed?{targetId:aimed.id}:{}),...(center?{target:center}:{}),...(p.afk?{automatic:true}:{})};
    p.combatUntil=this.t+15000;p.mana-=skill.manaCost;
    (p.skillCooldowns??={})[skillId]=skill.cooldown;
    if(skillId===legacySkillId(p.classId))p.specialCooldown=skill.cooldown;
    return true;
  }
  assignConsumable(p:Hero,slot:unknown,definitionId:unknown){
    if(!p.connected||p.dead||!isQuickSlot(slot))return false;
    if(definitionId!==null&&(!consumableDefinition(definitionId)||typeof definitionId!=='string'||consumableQuantity(p,definitionId)<=0))return false;
    p.quickSlots[slot]=definitionId as string|null;return true;
  }
  useConsumable(p:Hero,slot:unknown){
    if(!p.connected||p.dead||!isQuickSlot(slot))return false;
    const listing=assignedConsumable(p,slot);if(!listing)return false;
    const stack=p.consumableInventory.find(stack=>stack.definitionId===listing.id&&stack.quantity>0);
    if(!stack)return false;
    const s=stats(p),mana=listing.kind==='mana';
    if(mana?(p.manaPotionCooldown>0||p.mana>=s.maxMana):(p.potionCooldown>0||p.hp>=s.maxHp))return false;
    const amount=Math.min(listing.restore,(mana?s.maxMana-p.mana:s.maxHp-p.hp));
    stack.quantity--;
    if(!stack.quantity)p.consumableInventory.splice(p.consumableInventory.indexOf(stack),1);
    if(mana){p.mana+=amount;p.manaPotionCooldown=listing.cooldown;}
    else {p.hp+=amount;p.potionCooldown=listing.cooldown;this.emit('heal',{amount,x:p.x,z:p.z},p.id);}
    p.potions=consumableKindQuantity(p,'hp');p.manaPotions=consumableKindQuantity(p,'mana');
    p.consumableOverflow=Math.min(p.consumableOverflow,Math.max(0,backpackUsage(p)-BAG_CAPACITY));
    return true;
  }
  /** AFK may only use an assigned bottle of the requested resource kind. */
  potion(p:Hero,kind:ConsumableKind='hp'){
    for(const slot of ['q','w'] as const)if(assignedConsumable(p,slot)?.kind===kind&&this.useConsumable(p,slot))return true;
    return false;
  }
  camp(p: Hero,respawn: boolean){
    this.stopAfk(p);
    Object.assign(p,{...CAMP_SPAWN,yaw:Math.PI*.25,targetYaw:Math.PI*.25,vx:0,vz:0,dead:0,attack:null,moveBlend:0,runBlend:0,gait:0,input:{...p.input,x:0,z:0,aim:null}});
    if(respawn){p.hp=stats(p).maxHp;p.mana=stats(p).maxMana;}
    this.emit('camp',{},p.id);
  }
  damagePlayer(p: Hero,amount: number){
    if(p.dead||safe(p))return;
    const damage=Math.max(1,Math.round(amount*(1-stats(p).damageReduction)));
    p.hp=Math.max(0,p.hp-damage);p.hurt=.35;p.combatUntil=this.t+15000;this.emit('hurt',{x:p.x,z:p.z,amount:damage},p.id);
    if(!p.hp){this.stopAfk(p);this.stopInteraction(p);p.shopActive=false;p.stashActive=false;p.dead=2.5;p.attack=null;p.vx=p.vz=p.moveBlend=p.runBlend=0;this.emit('death',{},p.id);}
  }
  hurtMob(p: Hero,m: Mob,amount: number,automatic=false){
    if(p.dead||safe(p)||m.state==='dead'||safe(m)||!sameLocation(p,m)||!clearPath(p,m))return false;
    const dealt=Math.min(m.hp,Math.max(0,Math.round(amount)));if(!dealt)return false;
    const earlier=m.contributors.get(p.id);
    m.hp-=dealt;m.flash=.2;p.combatUntil=this.t+15000;m.contributors.set(p.id,{at:this.t,damage:(earlier?.damage||0)+dealt,automatic:(earlier?.automatic??automatic)&&automatic});
    this.emit('hit',{x:m.x,z:m.z,amount:dealt,id:m.id});
    if(!m.hp)this.kill(m);else if(m.state==='idle'||m.state==='return'){m.state='chase';m.target=p.id;m.timer=0;m.age=0;}
    return true;
  }
  strikeMob(p: Hero,m: Mob,amount: number,automatic=false){
    if(p.dead||safe(p)||m.state==='dead'||safe(m)||!sameLocation(p,m)||!clearPath(p,m))return false;
    if(this.random()>=stats(p).hitChance){
      p.combatUntil=this.t+15000;
      if(m.state==='idle'||m.state==='return'){m.state='chase';m.target=p.id;m.timer=0;m.age=0;}
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
      p.kills++;if(!automatic&&locationAt(m)==='forest')p.questKills++;p.xp+=cfg.xp;if(!automatic&&m.id===6&&locationAt(m)==='forest')p.boss=true;
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
    if(p.dead||safe(p))return;
    const skillId=a.skillId??(a.special?legacySkillId(p.classId):undefined),skill=skillId?SKILLS[skillId]:undefined;
    const yaw=a.yaw??p.yaw,baseDamage=attackPower*(p.classId==='warrior'&&a.weapon==='axe'?1.45:1);
    if(p.classId==='warrior'){
      const range=skill?.range??WEAPONS[a.weapon??p.weapon].range,halfAngle=skill?.halfAngle??.9;
      const targets=this.mobs.filter(m=>liveMob(m)&&sameLocation(p,m)&&bodyStrike(p,m,yaw,range,halfAngle))
        .sort((left,right)=>distance(p,left)-distance(p,right)||left.id-right.id).slice(0,skill?.maxTargets??1);
      for(const m of targets){
        if(a.automatic&&!p.afk)break;
        this.strikeMob(p,m,baseDamage*(skill?.damageScale??1),a.automatic===true);
      }
      if(a.targetId!==undefined&&!targets.some(m=>m.id===a.targetId))this.notice(p,'Навык не коснулся выбранной цели');
      if(skillId)this.emit('skillImpact',{x:p.x,z:p.z,skillId,caster:p.id,attackId:a.id,yaw});
    }else if(skillId==='mage-frost'){
      const targets=this.mobs.filter(m=>liveMob(m)&&sameLocation(p,m)&&bodyStrike(p,m,yaw,skill!.range,Math.PI))
        .sort((left,right)=>distance(p,left)-distance(p,right)||left.id-right.id).slice(0,skill!.maxTargets);
      for(const m of targets){
        if(a.automatic&&!p.afk)break;
        if(this.strikeMob(p,m,attackPower*skill!.damageScale,a.automatic===true)&&m.state!=='dead')m.slowUntil=Math.max(m.slowUntil??0,this.t+2000);
      }
      if(a.targetId!==undefined&&!targets.some(m=>m.id===a.targetId))this.notice(p,'Навык не коснулся выбранной цели');
      this.emit('skillImpact',{x:p.x,z:p.z,skillId,caster:p.id,attackId:a.id,yaw});
    }else if(skillId==='mage-lightning'){
      const hitIds=new Set<number>();let source: {x:number;z:number}=p;
      for(let index=0;index<skill!.maxTargets;index++){
        const reach=index===0?skill!.range:skill!.radius!;
        const next=this.mobs.filter(m=>liveMob(m)&&sameLocation(p,m)&&!safe(m)&&!hitIds.has(m.id)&&distance(source,m)<=reach+MOB_TYPES[m.type].radius&&clearPath(p,m)&&clearPath(source,m)&&(index>0||bodyStrike(p,m,yaw,reach,.8)))
          .sort((left,right)=>distance(source,left)-distance(source,right)||left.id-right.id)[0];
        if(!next)break;
        if(a.automatic&&!p.afk)break;
        hitIds.add(next.id);
        const struck=this.strikeMob(p,next,attackPower*skill!.damageScale*.72**index,a.automatic===true);
        // The cosmetic arc can reach a missed target, but current cannot jump from it.
        this.emit('skillImpact',{x:next.x,z:next.z,skillId,caster:p.id,attackId:a.id,yaw,from:{x:source.x,z:source.z}});
        if(!struck)break;
        source=next;
      }
      if(a.targetId!==undefined&&!hitIds.has(a.targetId))this.notice(p,'Молния не коснулась выбранной цели');
    }else if(skillId==='archer-rain'||skillId==='mage-meteor'){
      const distanceAhead=skill!.range*.75,center=a.target??{x:p.x+Math.sin(yaw)*distanceAhead,z:p.z+Math.cos(yaw)*distanceAhead};
      if(!stand(center.x,center.z,0)||safe(center)||!clearPath(p,center)){
        this.emit('skillImpact',{x:p.x,z:p.z,skillId,caster:p.id,attackId:a.id,yaw});return;
      }
      const delay=skillId==='archer-rain'?.45:.7;
      this.pendingAreas.push({skillId,caster:p.id,attackId:a.id,yaw,...center,at:this.t+delay*1000,damage:attackPower*skill!.damageScale,automatic:a.automatic===true});
      this.emit('skillImpact',{...center,skillId,caster:p.id,attackId:a.id,yaw,phase:'warning',delay,radius:skill!.radius});
    }else{
      const sharedHits: number[]=[],angles=skillId==='archer-volley'?[-.27,0,.27]:[0];
      for(const offset of angles)this.projectiles.push({
        id:randomUUID(),owner:p.id,x:p.x,z:p.z,yaw:yaw+offset,remaining:skill?.range??stats(p).range,hitIds:[],
        speed:skill?.projectileSpeed??(p.classId==='archer'?13:9),kind:p.classId,
        damage:attackPower*(skill?.damageScale??1),aoe:skillId==='mage-fireball'?skill!.radius??0:0,
        ...(a.targetId!==undefined?{targetId:a.targetId}:{}),...(skillId?{skillId,attackId:a.id,maxTargets:skill!.maxTargets,hitIds:skillId==='archer-volley'?sharedHits:[],pierce:skillId==='archer-piercing',damageScaleOnPierce:.82,...(skillId==='archer-frost-shot'?{slowMs:2500}:{})}:{}),
        ...(a.automatic?{automatic:true}:{})
      });
    }
  }
  afkRadius(p:Hero){return afkCombatRadius(p.afkPreferences,p.classId==='warrior'?WEAPONS[p.weapon].range:stats(p).range);}
  afkTargets(p: Hero){
    if(!p.afk||!p.connected||p.dead||safe(p))return [];
    const reach=this.afkRadius(p);
    if(reach<=0)return [];
    return this.mobs.filter(m=>liveMob(m)&&sameLocation(p,m)&&!safe(m)&&
      distance(p.afk!.anchor,m)<=reach+MOB_TYPES[m.type].radius&&clearPath(p,m))
      .sort((left,right)=>distance(p,left)-distance(p,right)||left.id-right.id);
  }
  /** Only personal filtered drops within ordinary pickup reach; AFK never approaches. */
  afkDrop(p:Hero){
    if(!p.afk||!p.connected||p.dead)return undefined;
    const room=backpackUsage(p)<BAG_CAPACITY,prefs=p.afkPreferences;

    return this.groundLoot.filter(drop=>drop.owner===p.id&&drop.expiresAt>this.t&&
      (drop.kind==='gold'?prefs.pickupGold:room&&!!drop.item&&prefs.pickupRarities.includes(drop.item.rarity))&&sameLocation(p,drop)&&
      distance(p,drop)<=PICKUP_RANGE&&stand(drop.x,drop.z,0)&&clearPath(p,drop))
      .sort((left,right)=>(left.kind==='gold'?0:1)-(right.kind==='gold'?0:1)||distance(p,left)-distance(p,right)||left.id.localeCompare(right.id))[0];
  }
  afkPickup(p:Hero){
    if(!p.afk||p.attack)return false;
    const drop=this.afkDrop(p);
    return !!drop&&this.pickUp(p,drop.id);
  }
  driveAfk(p: Hero){
    if(!p.afk)return {x:0,z:0,aim:null};
    if(!p.connected||p.dead){this.stopAfk(p);return {x:0,z:0,aim:null};}
    const target=this.afkTargets(p)[0];p.afk.targetId=target?.id??null;
    return {x:0,z:0,aim:target?Math.atan2(target.x-p.x,target.z-p.z):null};
  }
  autoAttack(p: Hero){
    if(!p.afk||p.attack||p.dead)return false;
    const targets=this.afkTargets(p),target=targets.find(m=>m.id===p.afk?.targetId)??targets[0];
    p.afk.targetId=target?.id??null;
    if(!target)return false;
    const yaw=Math.atan2(target.x-p.x,target.z-p.z),d=distance(p,target),body=MOB_TYPES[target.type].radius,order=p.afkPreferences.skillOrder;
    for(let offset=0;offset<order.length;offset++){
      const index=(p.afk.skillCursor+offset)%order.length,skill=SKILLS[order[index]];
      if(!skill||skill.classId!==p.classId||d>skill.range+body||p.mana<skill.manaCost||
        Math.max(p.skillCooldowns?.[skill.id]??0,skill.id===legacySkillId(p.classId)?p.specialCooldown:0)>0)continue;
      const area=skill.id==='archer-rain'||skill.id==='mage-meteor';
      if(this.castSkill(p,skill.id,yaw,target.id,area?{x:target.x,z:target.z}:undefined)){
        p.afk.skillCursor=(index+1)%order.length;return true;
      }
    }
    const basicRange=p.classId==='warrior'?WEAPONS[p.weapon].range:stats(p).range;
    if(p.afkPreferences.basicAttackFallback&&d<=basicRange+body&&this.attack(p,yaw,false,target.id))return true;
    return false;
  }
  tick(dt: number,now=this.t+dt*1000){
    dt=Math.max(0,Math.min(.1,dt));this.t=now;this.age+=dt;
    this.groundLoot=this.groundLoot.filter(drop=>drop.expiresAt>this.t);
    for(const p of this.players.values()){
      if(p.shopActive&&!this.vendorAvailable(p))p.shopActive=false;
      if(p.stashActive&&!this.chestAvailable(p))p.stashActive=false;
      p.hurt=Math.max(0,p.hurt-dt);p.potionCooldown=Math.max(0,p.potionCooldown-dt);p.manaPotionCooldown=Math.max(0,p.manaPotionCooldown-dt);
      for(const id of Object.keys(p.skillCooldowns??{}) as SkillId[])p.skillCooldowns![id]=Math.max(0,(p.skillCooldowns![id]??0)-dt);
      const legacyId=legacySkillId(p.classId);
      p.specialCooldown=Math.max(0,p.specialCooldown-dt,p.skillCooldowns?.[legacyId]??0);
      (p.skillCooldowns??={})[legacyId]=p.specialCooldown;
      if(p.dead>0){p.dead=Math.max(0,p.dead-dt);if(!p.dead)this.camp(p,true);continue;}
      if(p.afk){
        const prefs=p.afkPreferences,s=stats(p);
        if(prefs.hpPotion.enabled&&p.hp/s.maxHp*100<prefs.hpPotion.belowPercent)this.potion(p,'hp');
        if(prefs.manaPotion.enabled&&p.mana/s.maxMana*100<prefs.manaPotion.belowPercent)this.potion(p,'mana');
      }
      const input=p.afk?this.driveAfk(p):p.interactionTarget?this.interactionInput(p):p.connected&&this.t-p.inputAt<350?p.input:{x:0,z:0,aim:null};
      const s=stats(p),before={gait:p.gait};p.speedScale=s.speedScale;moveHero(p,dt,input);p.ack=p.input.seq;
      this.settleSafe(p);
      if(p.interactionTarget)this.interactionInput(p);
      if(p.afk){
        // The activation point is invariant, including residual velocity and skill animation ticks.
        p.x=p.afk.anchor.x;p.z=p.afk.anchor.z;p.vx=p.vz=0;p.gait=before.gait;p.moveBlend=p.runBlend=0;
        this.afkPickup(p);
        this.autoAttack(p);
      }
      if(p.attack){
        const a=p.attack;a.age+=dt;
        if(a.yaw===null&&a.age>=a.duration*.3){
          const intended=a.targetId===undefined?undefined:this.mobs.find(m=>m.id===a.targetId);
          const reach=a.skillId?SKILLS[a.skillId].range:p.classId==='warrior'?WEAPONS[a.weapon??p.weapon].range:s.range;
          if(intended&&liveMob(intended)&&sameLocation(p,intended)&&!safe(intended)&&distance(p,intended)<=reach+MOB_TYPES[intended.type].radius&&clearPath(p,intended)){
            const revised=Math.atan2(intended.x-p.x,intended.z-p.z),change=angleDelta(p.yaw,revised);
            a.yaw=p.yaw+Math.max(-.5,Math.min(.5,change));
          }else a.yaw=p.yaw;
        }
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
        if(p.questKills>=5&&p.boss&&!p.questClaimed){p.questClaimed=true;p.gold+=50;this.emit('quest',{},p.id);}
      }
    }
    for(const m of this.mobs){
      const cfg=MOB_TYPES[m.type],home={x:m.homeX,z:m.homeZ};m.age+=dt;m.flash=Math.max(0,m.flash-dt);m.speed=0;
      if(m.state==='dead'){m.patrol=null;m.timer-=dt;if(m.timer<=0){Object.assign(m,{x:home.x,z:home.z,hp:cfg.hp,state:'idle',timer:1,age:0,target:null,slowUntil:0});m.contributors.clear();}continue;}
      const spot=m.spotId?AFK_SPOTS.find(candidate=>candidate.id===m.spotId):null;
      let p=m.target===null?undefined:this.players.get(m.target);
      if(m.state==='idle'){
        p=[...this.players.values()].filter(p=>!p.dead&&!safe(p)&&sameLocation(p,m)&&distance(p,m)<cfg.aggro&&clearPath(p,m)).sort((a,b)=>distance(a,m)-distance(b,m))[0];
        if(p){m.target=p.id;m.state='chase';m.age=0;}
      }
      if(['chase','windup','recover'].includes(m.state)&&(!p||p.dead||safe(p)||!sameLocation(p,m)||distance(p,m)>CHASE_TARGET_LIMIT)){
        const replacement=[...this.players.values()].filter(other=>!other.dead&&!safe(other)&&sameLocation(other,m)&&distance(other,m)<cfg.aggro&&clearPath(other,m)).sort((a,b)=>distance(a,m)-distance(b,m))[0];
        if(replacement){p=replacement;m.target=p.id;}
      }
      if(['chase','windup','recover'].includes(m.state)&&(!p||p.dead||safe(p)||!sameLocation(p,m)||distance(m,home)>CHASE_HOME_LIMIT||distance(p,m)>CHASE_TARGET_LIMIT)){
        m.state='return';m.target=null;m.timer=0;m.age=0;
      }
      if(m.state!=='idle'&&m.patrol){m.patrol.goal=null;m.patrol.speed=0;m.patrol.pause=1.1;}
      const slowScale=(m.slowUntil??0)>this.t?.7:1;
      if(m.state==='return'){
        const replacement=distance(m,home)<CHASE_HOME_LIMIT?[...this.players.values()].filter(other=>!other.dead&&!safe(other)&&sameLocation(other,m)&&distance(other,m)<cfg.aggro&&clearPath(other,m)).sort((a,b)=>distance(a,m)-distance(b,m))[0]:undefined;
        if(replacement){m.state='chase';m.target=replacement.id;m.timer=0;m.age=0;}
        else{
          const d=distance(m,home);
          if(d<.25){
            if(!m.timer)m.timer=HOME_REST_SECONDS;
            m.timer=Math.max(0,m.timer-dt);
            if(!m.timer){m.state='idle';m.hp=cfg.hp;m.timer=1;m.contributors.clear();}
          }else{m.timer=0;const a=Math.atan2(home.x-m.x,home.z-m.z);m.yaw=turnTowards(m.yaw,a,dt,9);m.speed=translate(m,Math.sin(a)*cfg.speed*slowScale*dt,Math.cos(a)*cfg.speed*slowScale*dt,cfg.radius,true)/dt;}
        }
      }else if(m.state==='windup'){
        m.timer-=dt;if(m.timer<=0){for(const target of this.players.values())if(!target.dead&&!safe(target)&&sameLocation(target,m)&&clearPath(m,target)&&inStrike(m,target,m.targetYaw,cfg.range+.2,.72))this.damagePlayer(target,cfg.damage);m.state='recover';m.timer=cfg.cooldown;m.age=0;}
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
        if(!owner||owner.dead||safe(owner)||b.remaining<-.55||!stand(b.x,b.z,0)||safe(b)||!sameLocation(owner,b)){
          if(b.skillId&&b.attackId!==undefined)this.emit('skillImpact',{x:b.x,z:b.z,skillId:b.skillId,caster:b.owner,attackId:b.attackId,yaw:b.yaw});
          hit=true;break;
        }
        const m=this.mobs.find(m=>liveMob(m)&&sameLocation(owner,m)&&!safe(m)&&!b.hitIds?.includes(m.id)&&distance(m,b)<MOB_TYPES[m.type].radius+.34&&clearPath(owner,m));
        if(!m)continue;
        if(b.skillId&&b.attackId!==undefined)this.emit('skillImpact',{x:m.x,z:m.z,skillId:b.skillId,caster:b.owner,attackId:b.attackId,yaw:b.yaw});
        if(b.aoe){
          const targets=this.mobs.filter(other=>liveMob(other)&&sameLocation(owner,other)&&!safe(other)&&clearPath(m,other)&&(other===m||distance(other,m)<=b.aoe+MOB_TYPES[other.type].radius))
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
      if(hit){
        if(owner&&!safe(owner)&&b.targetId!==undefined&&!b.hitIds?.includes(b.targetId)&&b.remaining>=-.55)this.notice(owner,'Снаряд не коснулся выбранной цели');
        this.projectiles.splice(i,1);
      }
    }
    for(let i=this.pendingAreas.length-1;i>=0;i--){
      const area=this.pendingAreas[i];if(this.t<area.at)continue;this.pendingAreas.splice(i,1);
      const owner=this.players.get(area.caster),skill=SKILLS[area.skillId];
      if(!owner||owner.dead||safe(owner)||safe(area)||!sameLocation(owner,area)||area.automatic&&!owner.afk)continue;
      const targets=this.mobs.filter(m=>liveMob(m)&&sameLocation(owner,m)&&!safe(m)&&distance(area,m)<=skill.radius!+MOB_TYPES[m.type].radius&&clearPath(area,m)&&clearPath(owner,m))
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
    return {t:this.t,players:[...this.players.values()].filter(other=>!p||sameLocation(p,other)).map(p=>({id:p.id,name:p.name,classId:p.classId,x:p.x,z:p.z,yaw:p.yaw,weapon:p.weapon,hp:p.hp,maxHp:stats(p).maxHp,level:p.level,dead:p.dead,hurt:p.hurt,attack:p.attack,moveBlend:p.moveBlend,runBlend:p.runBlend,gait:p.gait,vx:p.vx,vz:p.vz,connected:p.connected,appearance:equipmentAppearance(p)})),mobs:this.mobs.filter(m=>!p||sameLocation(p,m)).map(({contributors,patrol,slowUntil,slow,...m})=>({...m,slow:Math.max(0,((slowUntil??0)-this.t)/1000)})),projectiles:this.projectiles.filter(b=>!p||sameLocation(p,b)).map(({damage,aoe,maxTargets,hitIds,pierce,damageScaleOnPierce,slowMs,automatic,...b})=>b),groundLoot:this.groundLoot.filter(drop=>drop.owner===forId&&(!p||sameLocation(p,drop))).map(({owner,...drop})=>drop),self:p?{...stats(p),...persistentHero(p),appearance:equipmentAppearance(p),attackPower:stats(p).attack,targetYaw:p.targetYaw,vx:p.vx,vz:p.vz,hurt:p.hurt,gait:p.gait,moveBlend:p.moveBlend,runBlend:p.runBlend,ack:p.ack,afk:p.afk,afkRadius:this.afkRadius(p),interactionTarget:p.interactionTarget,shopActive:p.shopActive,stashActive:p.stashActive}:null,events:this.events.filter(e=>(!e.owner||e.owner===forId)&&(!p||!('x' in e&&'z' in e)||sameLocation(p,e)))};
  }
}
