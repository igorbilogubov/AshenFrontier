import {travelPortalById,travelCost} from './public/game/travel.js';
import {findWalkPath,walkSegment} from './public/game/navigation.js';
import {MAX_LEVEL,mobExperience} from './public/game/progression-curve.js';
import {DUNGEONS,dungeonAt,dungeonById,dungeonSafe,DUNGEON_RESET_SECONDS,DUNGEON_ABANDON_SECONDS,inBossTelegraph} from './public/game/dungeons.js';
import {lateRegionAt} from './public/game/late-world.js';
import {WASTELAND_PASSAGES,inWasteland,WASTELAND_MIN_LEVEL} from './public/game/wasteland.js';
import {SNOW_PASSAGES,inSnow,SNOW_MIN_LEVEL} from './public/game/snow.js';
import {CAMP_SPAWN} from './public/game/camp-layout.js';
import {regionalEquipment,rollEquipment,validateEquipment,equipmentAppearance} from './public/game/equipment-items.js';
import type {ClassId, EquipmentSlot, Item, Hero, PersistentHero, HeroAttack, Mob, Projectile, WorldEvent, EventPayloads, WorldSnapshot, SkillId, SkillCooldowns, GroundDrop, Point, ConsumableStack, QuickSlots, SkillBuild, SkillZone, StatSource} from './shared/types.js';
import {isRecord, isClassId, isEquipmentSlot, isWeaponId} from './shared/types.js';
import {randomUUID} from 'node:crypto';
import {CLASSES,EQUIPMENT_SLOTS,BAG_CAPACITY,backpackItems,classFor,canEquip,STAT_KEYS,CLASS_PROGRESSION,characterStats,normalizedAllocations} from './public/rules.js';
import {BOUNDS,CAMP,SPAWNS,mobConfig,WEAPONS,AFK_SPOTS,afkSpotAt,withinSpot,safe as pointIsSafe,stand,clearPath,distance,translate,moveHero} from './public/game/location.js';
import {angleDelta,turnTowards,inStrike} from './public/game/motion.js';
import {SKILLS,skillsForClass,legacySkillId} from './public/game/skills.js';
import {LOOT_TTL_MS,MAX_GROUND_DROPS_PER_HERO,PICKUP_RANGE,AFK_PICKUP_RANGE,gearRarity} from './public/game/loot-rules.js';
import {portalById,ALL_PASSAGES} from './public/game/stadium.js';
import {locationAt as pointLocation,fieldRegionAt} from './public/game/world-layout.js';
import {SHOP,shopPrice,sellPrice} from './public/game/shop.js';
import {defaultAfkPreferences,parseAfkPreferences,afkCombatRadius} from './public/game/afk-preferences.js';
import {PERSONAL_CHEST,CHEST_APPROACH,CHEST_DOOR_OUTSIDE,CHEST_DOOR_INSIDE,inChestRoom} from './public/game/personal-stash.js';
import {consumable,CONSUMABLE_LIMIT,consumableDefinition,consumableKindQuantity,consumableQuantity,assignedConsumable,isQuickSlot,backpackUsage,validateConsumables,type ConsumableKind} from './public/game/consumables.js';
import {defaultSkillBuild,parseSkillBuild,equippedSkills,effectiveSkill,talentBonuses} from './public/game/skill-builds.js';
export {CLASSES,EQUIPMENT_SLOTS,CAMP,BOUNDS};
export const SAVE_VERSION=3;
const finite=(value: unknown,fallback=0)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const nonnegative=(value: unknown,fallback=0)=>Math.max(0,finite(value,fallback));
const CHASE_HOME_LIMIT=28,CHASE_TARGET_LIMIT=30,HOME_REST_SECONDS=3;

/** Map geometry is immutable. Reuse each entity's positional queries until it
 * moves; checking both coordinates also covers portals, respawns and changes
 * between ticks. Weak keys do not retain departed heroes, drops or projectiles.
 * Combat stats and other mutable gameplay state are deliberately not cached. */
function positionalQuery<T>(query:(point:Point)=>T){
  const cache=new WeakMap<Point,{x:number;z:number;value:T}>();
  return (point:Point):T=>{
    const entry=cache.get(point);
    if(entry&&entry.x===point.x&&entry.z===point.z)return entry.value;
    const value=query(point);
    if(entry){entry.x=point.x;entry.z=point.z;entry.value=value;}
    else cache.set(point,{x:point.x,z:point.z,value});
    return value;
  };
}
const locationAt=positionalQuery(pointLocation),safe=positionalQuery(pointIsSafe);
const sameLocation=(a:Point,b:Point)=>locationAt(a)===locationAt(b);

const liveMob=(m:Mob)=>m.state!=='dead'&&!m.bossLocked;
const validPoint=(value:unknown):value is Point=>isRecord(value)&&typeof value.x==='number'&&Number.isFinite(value.x)&&typeof value.z==='number'&&Number.isFinite(value.z);
const bodyStrike=(origin:Point,m:Mob,yaw:number,range:number,halfAngle:number)=>{
  const d=distance(origin,m),radius=mobConfig(m).radius;
  return inStrike(origin,m,yaw,range+radius,halfAngle+Math.min(.16,Math.asin(Math.min(1,radius/Math.max(d,.1)))))&&!safe(m);
};
const slotNames={armor:['Кожаный доспех','Доспех дозорного','Пепельный панцирь'],helmet:['Кожаный шлем','Шлем дозорного','Шлем рубежа'],boots:['Походные сапоги','Сапоги следопыта','Сапоги рубежа'],ring:['Медное кольцо','Кольцо охотника','Кольцо рассвета'],amulet:['Оберег путника','Оберег леса','Оберег огня']};
export function makeLoot(classId: ClassId,level=1,rarity=0,slot: EquipmentSlot='weapon'): Item{
  return {id:randomUUID(),name:(slot==='weapon'?classFor(classId).weaponNames:slotNames[slot])[rarity],slot,rarity,power:Math.max(1,Math.round(level+rarity*3+(slot==='amulet'?5:0))),...(slot==='weapon'?{classId}:{} )};
}
export function stats(p:StatSource&{effects?:Hero['effects'];skillBuild?:SkillBuild}){
  const s=characterStats(p),b=talentBonuses({classId:p.classId??'warrior',level:p.level??1,skillBuild:p.skillBuild});
  const has=(id:SkillId)=>p.effects?.some(e=>e.skillId===id&&e.remaining>0);
  s.hpRegen*=1+(b.hpRegen??0);s.manaRegen*=1+(b.manaRegen??0);s.speedScale*=1+(b.movement??0)+(has('archer-wind')?.2:0);
  if(b.reduction||b.guardian)s.damageReduction=1-(1-s.damageReduction)*(1-(b.reduction??0)-(b.guardian?.1:0));
  if(has('warrior-berserk'))s.attackSpeed+=.22;
  const outgoing=(has('warrior-guard')?.85:1)*(has('warrior-shout')?1.08:1)*(b.guardian?.9:1);
  s.attack*=outgoing;s.attackPower=s.attack;
  if(has('warrior-shout'))s.maxMana=Math.floor(s.maxMana*.8);
  return s;
}
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
  const x=finite(raw.x,CAMP_SPAWN.x),z=finite(raw.z,CAMP_SPAWN.z),position=legacy||typeof raw.x!=='number'||typeof raw.z!=='number'||!Number.isFinite(raw.x)||!Number.isFinite(raw.z)||!stand(x,z)||level<(dungeonAt({x,z})?.minLevel??lateRegionAt({x,z})?.minLevel??1)||(inSnow({x,z})&&level<SNOW_MIN_LEVEL)||(inWasteland({x,z})&&level<WASTELAND_MIN_LEVEL)?CAMP_SPAWN:{x,z};
  const yaw=finite(raw.yaw,Math.PI*.25),legacyId=legacySkillId(classId),specialCooldown=legacy?0:nonnegative(raw.specialCooldown);
  const skillCooldowns: SkillCooldowns={};
  if(isRecord(raw.skillCooldowns))for(const skill of Object.values(SKILLS))if(skill.classId===classId&&Object.hasOwn(raw.skillCooldowns,skill.id))skillCooldowns[skill.id]=nonnegative(raw.skillCooldowns[skill.id]);
  skillCooldowns[legacyId]=Math.max(specialCooldown,skillCooldowns[legacyId]??0);
  const restoredAttack=legacy?null:savedAttack(raw.attack,classId);
  const oldConsumables=raw.consumableInventory===undefined;
  const consumableInventory:ConsumableStack[]=oldConsumables?(['hp','mana'] as const).flatMap(kind=>{
    const quantity=Math.min(consumable(kind)!.stackLimit,Math.floor(nonnegative(kind==='hp'?raw.potions:raw.manaPotions,3)));
    return quantity?[{id:randomUUID(),definitionId:consumable(kind)!.id,quantity}]:[];
  }):raw.consumableInventory as ConsumableStack[];
  const quickSlots:QuickSlots=oldConsumables?{q:'hp-basic',w:'mana-basic'}:raw.quickSlots as QuickSlots;
  validateConsumables(consumableInventory,quickSlots);
  const usage=backpackUsage({items,equipment,stash,consumableInventory});
  const consumableOverflow=oldConsumables?Math.max(0,usage-BAG_CAPACITY):Math.min(nonnegative(raw.consumableOverflow),Math.max(0,usage-BAG_CAPACITY));
  if(!Number.isSafeInteger(consumableOverflow)||consumableOverflow>2)throw new Error('Invalid consumable overflow');
  const p: Hero={
    skillBuild:parseSkillBuild(raw.skillBuild,classId,level)??defaultSkillBuild(classId,level),buildRevision:Math.floor(nonnegative(raw.buildRevision)),skillPresets:[0,1,2].map(index=>Array.isArray(raw.skillPresets)?parseSkillBuild(raw.skillPresets[index],classId,level):null) as Hero['skillPresets'],effects:[],
    schemaVersion:SAVE_VERSION,id:typeof raw.id==='string'?raw.id:randomUUID(),name:String(raw.name||'Странник').replace(/[\p{C}<>]/gu,'').slice(0,18),
    classId,level,xp:level>=MAX_LEVEL?0:nonnegative(raw.xp),gold:nonnegative(raw.gold??raw.coins),kills:Math.floor(nonnegative(raw.kills)),items,pendingItems,stash,equipment,consumableInventory,quickSlots,consumableOverflow,
    allocatedStats:normalizedAllocations(migrateStats?null:raw.allocatedStats,level),statRevision:!migrateStats&&typeof raw.statRevision==='number'&&Number.isSafeInteger(raw.statRevision)&&raw.statRevision>=0?raw.statRevision:0,
    ...position,yaw,targetYaw:yaw,weapon:raw.weapon==='axe'?'axe':'sword',
    questKills:legacy?0:nonnegative(raw.questKills),boss:legacy?false:!!raw.boss,questClaimed:legacy?false:!!raw.questClaimed,
    potions:consumableKindQuantity({consumableInventory},'hp'),potionCooldown:legacy?0:nonnegative(raw.potionCooldown),manaPotions:consumableKindQuantity({consumableInventory},'mana'),manaPotionCooldown:nonnegative(raw.manaPotionCooldown),specialCooldown:skillCooldowns[legacyId]??0,skillCooldowns,dead:legacy?0:nonnegative(raw.dead),combatUntil:legacy?0:nonnegative(raw.combatUntil),
    hp:0,mana:0,attack:restoredAttack?.automatic?null:restoredAttack,attackSerial:nonnegative(raw.attackSerial),
    vx:0,vz:0,hurt:0,gait:0,moveBlend:0,runBlend:0,running:!!raw.running,input:{x:0,z:0,aim:null,seq:0},inputAt:0,ack:0,connected:true,disconnectAt:0,afk:null,interactionTarget:null,shopActive:false,stashActive:false,
    afkPreferences:parseAfkPreferences(raw.afkPreferences,classId)??defaultAfkPreferences(classId)
  };
  p.afkPreferences.skillOrder=p.afkPreferences.skillOrder.filter(id=>p.skillBuild.slots.includes(id)&&SKILLS[id].kind!=='mobility');
  if(p.attack?.skillId&&!p.skillBuild.slots.includes(p.attack.skillId))p.attack=null;
  p.hp=Math.min(stats(p).maxHp,nonnegative(raw.hp,stats(p).maxHp));if(!p.hp&&!p.dead)p.dead=2.5;
  // V2 had no mana. Grant its initial pool once; reconnecting V3 never refills it.
  p.mana=migrateStats?stats(p).maxMana:Math.min(stats(p).maxMana,nonnegative(raw.mana));
  return p;
}
export function persistentHero(p: Hero): PersistentHero{
  // Compatibility counters are a projection, never an independent inventory.
  p.potions=consumableKindQuantity(p,'hp');p.manaPotions=consumableKindQuantity(p,'mana');
  p.consumableOverflow=Math.min(p.consumableOverflow,Math.max(0,backpackUsage(p)-BAG_CAPACITY));
  const fields=['schemaVersion','id','name','classId','level','xp','gold','kills','items','pendingItems','stash','equipment','consumableInventory','quickSlots','consumableOverflow','allocatedStats','statRevision','x','z','yaw','weapon','hp','mana','potions','potionCooldown','manaPotions','manaPotionCooldown','specialCooldown','skillCooldowns','dead','combatUntil','attack','attackSerial','running','questKills','boss','questClaimed','afkPreferences','skillBuild','buildRevision','skillPresets'] as const;
  return structuredClone(Object.fromEntries(fields.map(k=>[k,p[k]]))) as unknown as PersistentHero;
}
export class World{
  random: ()=>number;
  t: number;
  age: number;
  players: Map<string,Hero>;
  events: WorldEvent[];
  projectiles: Projectile[];
  pendingAreas: {skillId:'archer-rain'|'archer-arrow-storm'|'mage-meteor';caster:string;attackId:number;yaw:number;x:number;z:number;at:number;damage:number;automatic:boolean}[];
  mobs: Mob[];
  dungeonRuns=new Map<string,{resetAt:number;lastOccupied:number}>();
  bossTurns=new Map<number,number>();
  skillZones:(SkillZone&{budget?:number;attackId:number;yaw:number;damage?:number;automatic?:boolean})[]=[];
  groundLoot: (GroundDrop & {owner:string})[];
  purchaseReceipts:Map<string,string[]>;
  constructor({random=Math.random}={}){
    this.random=random;
    this.t=Date.now();this.age=0;this.players=new Map();this.events=[];this.projectiles=[];this.pendingAreas=[];this.groundLoot=[];this.purchaseReceipts=new Map();
    for(const d of DUNGEONS)this.dungeonRuns.set(d.id,{resetAt:0,lastOccupied:this.t});
    this.mobs=SPAWNS.map((s,id)=>({...s,id,homeX:s.x,homeZ:s.z,hp:mobConfig(s).hp,state:'idle',timer:1,yaw:Math.PI,targetYaw:Math.PI,age:0,gait:0,speed:0,flash:0,target:null,contributors:new Map()}));
  }
  add(p: Hero){this.stopCampReturn(p);this.stopAfk(p);this.stopInteraction(p);this.players.set(p.id,p);p.connected=true;p.disconnectAt=0;p.afk=null;p.shopActive=false;p.stashActive=false;}
  emit<K extends keyof EventPayloads>(type: K,data: EventPayloads[K],owner?: string){this.events.push({type,...data,...(owner?{owner}:{})} as WorldEvent);}
  remove(id: string){const p=this.players.get(id);if(p){this.stopCampReturn(p);this.stopAfk(p);this.stopInteraction(p);this.clearSkillRuntime(p);p.shopActive=false;p.stashActive=false;}this.players.delete(id);this.purchaseReceipts.delete(id);}
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
  stopInteraction(p:Hero,keepNavigation=false){
    const active=!!(p.interactionTarget||p.travelPortalId||!keepNavigation&&(p.navigation||p.attackTargetId!==undefined));
    if(!keepNavigation){delete p.navigation;delete p.attackTargetId;delete p.attackRepathAt;}delete p.travelPortalId;
    if(!active)return false;
    p.interactionTarget=null;p.input={...p.input,x:0,z:0,aim:null};p.vx=p.vz=0;return true;
  }
  refreshCombat(p:Hero){
    if(p.combatUntil<=this.t||p.attack||p.channel)return;
    const engaged=this.mobs.some(m=>liveMob(m)&&sameLocation(p,m)&&m.target===p.id&&['chase','windup','recover'].includes(m.state));
    if(!engaged)p.combatUntil=this.t;
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
  private collectDrop(p:Hero,id:unknown,maxRange:number){
    const drop=this.groundDrop(p,id);
    if(!drop||!p.connected||p.dead||p.attack){this.stopInteraction(p);return false;}
    if(distance(p,drop)>maxRange||!clearPath(p,drop))return false;
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
  pickUp(p:Hero,id:unknown){return this.collectDrop(p,id,PICKUP_RANGE);}
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
  pickupNearest(p:Hero){
    this.stopAfk(p);this.stopInteraction(p);
    const drop=this.groundLoot.filter(d=>d.owner===p.id&&d.expiresAt>this.t&&sameLocation(p,d)&&distance(p,d)<=6&&clearPath(p,d))
      .sort((a,b)=>distance(p,a)-distance(p,b)||a.id.localeCompare(b.id))[0];
    if(drop)return this.startPickup(p,drop.id);
    this.notice(p,'Рядом нет доступной личной добычи');return false;
  }
  startMove(p:Hero,target:unknown){
    if(!isRecord(target)||typeof target.x!=='number'||typeof target.z!=='number'||!Number.isFinite(target.x)||!Number.isFinite(target.z)||!p.connected||p.dead)return false;
    const goal={x:target.x,z:target.z};if(!sameLocation(p,goal)||distance(p,goal)>250)return false;
    if(this.t<(p.navigationPlanAt??0))return false;p.navigationPlanAt=this.t+150;
    this.stopAfk(p);this.stopInteraction(p);this.stopChannel(p);this.removeEffect(p,'archer-focus');p.shopActive=false;p.stashActive=false;p.input={...p.input,x:0,z:0,aim:null};
    const path=findWalkPath(p,goal);if(!path){this.notice(p,'К этой точке нет прохода');return false;}
    p.navigation={target:goal,path,startedAt:this.t};return true;
  }
  startAttackApproach(p:Hero,targetId:unknown){
    if(!Number.isSafeInteger(targetId)||p.dead||!p.connected)return false;
    const target=this.mobs.find(m=>m.id===targetId);
    if(!target||!liveMob(target)||!sameLocation(p,target)||safe(target)||distance(p,target)>40)return false;
    if(p.attackTargetId===target.id)return true;
    this.stopAfk(p);this.stopInteraction(p);this.stopChannel(p);p.shopActive=false;p.stashActive=false;p.input={...p.input,x:0,z:0,aim:null};
    p.attackTargetId=target.id;p.attackRepathAt=0;return true;
  }
  navigationInput(p:Hero){
    const idle={x:0,z:0,aim:null};
    if(!p.connected||p.dead){this.stopInteraction(p);return idle;}
    if(p.attackTargetId!==undefined){
      const target=this.mobs.find(m=>m.id===p.attackTargetId);
      if(!target||!liveMob(target)||safe(target)||!sameLocation(p,target)||distance(p,target)>40){this.stopInteraction(p);return idle;}
      const range=(p.classId==='warrior'?WEAPONS[p.weapon].range:stats(p).range)+mobConfig(target).radius;
      if(distance(p,target)<=range-.08&&!safe(p)&&clearPath(p,target)){
        delete p.navigation;p.vx=p.vz=0;this.attack(p,Math.atan2(target.x-p.x,target.z-p.z),false,target.id);return idle;
      }
      if(p.attack)return idle;
      if(!p.navigation||this.t>=(p.attackRepathAt??0)&&distance(p.navigation.target,target)>.65){
        if(this.t<(p.navigationPlanAt??0))return idle;p.navigationPlanAt=this.t+150;
        const path=findWalkPath(p,target);p.attackRepathAt=this.t+500;
        if(!path){this.stopInteraction(p);this.notice(p,'К цели нет прохода');return idle;}
        p.navigation={target:{x:target.x,z:target.z},path,startedAt:this.t};
      }
    }
    const route=p.navigation;if(!route)return idle;
    if(this.t-route.startedAt>120000||!sameLocation(p,route.target)){this.stopInteraction(p);return idle;}
    if(p.attack)return idle;
    while(route.path.length&&distance(p,route.path[0])<.12)route.path.shift();
    const next=route.path[0];if(!next){delete p.navigation;p.vx=p.vz=0;return idle;}
    const d=distance(p,next),scale=Math.min(1,d/.45),yaw=Math.atan2(next.x-p.x,next.z-p.z);
    // The full static route was checked once; only validate the next body-width step each tick.
    const reach=Math.min(1,d);if(!walkSegment(p,{x:p.x+Math.sin(yaw)*reach,z:p.z+Math.cos(yaw)*reach})){this.stopInteraction(p);return idle;}
    return {x:Math.sin(yaw)*scale,z:Math.cos(yaw)*scale,aim:yaw};
  }
  travelAvailable(p:Hero,id:unknown){
    const gate=travelPortalById(id);
    return !!gate&&sameLocation(p,gate)&&distance(p,gate)<=gate.range&&clearPath(p,gate)&&this.portalAvailable(p);
  }
  openTravel(p:Hero,id:unknown){
    const gate=travelPortalById(id);if(!gate||!this.travelAvailable(p,id))return false;
    this.stopInteraction(p);p.travelPortalId=gate.id;this.emit('travelOpened',{portalId:gate.id},p.id);return true;
  }
  startTravel(p:Hero,id:unknown){
    const gate=travelPortalById(id);
    if(!gate||!sameLocation(p,gate)||!this.portalAvailable(p))return false;
    this.stopAfk(p);this.stopInteraction(p);p.shopActive=false;p.stashActive=false;
    if(distance(p,gate)<=gate.range)return this.openTravel(p,id);
    if(!clearPath(p,gate)){this.notice(p,'К порталу нет прямого прохода');return false;}
    p.interactionTarget={kind:'travel',id:gate.id};return true;
  }
  travel(p:Hero,sourceId:unknown,destinationId:unknown){
    const source=travelPortalById(sourceId),destination=travelPortalById(destinationId);
    if(!source||!destination||source.id===destination.id||p.travelPortalId!==source.id||!this.travelAvailable(p,source.id))return false;
    if(p.level<destination.minLevel){this.notice(p,`Нужен ${destination.minLevel} уровень`);return false;}
    const fee=travelCost(source,destination);
    if(p.gold<fee){this.notice(p,`Недостаточно золота: нужно ${fee}`);return false;}
    if(!stand(destination.x,destination.z))return false;
    this.stopCampReturn(p);this.stopAfk(p);this.stopInteraction(p);this.clearSkillRuntime(p);p.shopActive=false;p.stashActive=false;
    this.projectiles=this.projectiles.filter(b=>b.owner!==p.id);this.pendingAreas=this.pendingAreas.filter(a=>a.caster!==p.id);
    p.gold-=fee;delete p.navigationPlanAt;
    Object.assign(p,{x:destination.x,z:destination.z,yaw:Math.PI,targetYaw:Math.PI,vx:0,vz:0,attack:null,moveBlend:0,runBlend:0,gait:0,inputAt:0,input:{...p.input,x:0,z:0,aim:null}});
    this.emit('portal',{portalId:destination.id,location:locationAt(p)},p.id);return true;
  }
  portalAvailable(p:Hero){
    this.settleSafe(p);
    this.refreshCombat(p);
    return p.connected&&!p.dead&&!p.attack&&p.combatUntil<=this.t&&!this.mobs.some(m=>m.target===p.id&&['chase','windup','recover'].includes(m.state));
  }
  usePortal(p:Hero,id:unknown){
    const portal=portalById(id);
    if(!portal||!sameLocation(p,portal)||!this.portalAvailable(p)||distance(p,portal)>portal.range||!clearPath(p,portal))return false;
    if(p.level<(portal.minLevel??1)){this.notice(p,`${portal.destinationName} открывается с ${portal.minLevel} уровня`);return false;}
    if(!stand(portal.destination.x,portal.destination.z))return false;
    this.stopAfk(p);this.stopInteraction(p);this.clearSkillRuntime(p);p.shopActive=false;
    this.projectiles=this.projectiles.filter(projectile=>projectile.owner!==p.id);
    this.pendingAreas=this.pendingAreas.filter(area=>area.caster!==p.id);
    delete p.navigationPlanAt;Object.assign(p,{...portal.destination,yaw:Math.PI,targetYaw:Math.PI,vx:0,vz:0,attack:null,moveBlend:0,runBlend:0,gait:0,inputAt:0,input:{...p.input,x:0,z:0,aim:null}});
    this.emit('portal',{portalId:portal.id,location:locationAt(p)},p.id);return true;
  }
  startPortal(p:Hero,id:unknown){
    const portal=portalById(id);
    if(!portal||!sameLocation(p,portal)||!p.connected||p.dead)return false;
    if(p.level<(portal.minLevel??1)){this.notice(p,`${portal.destinationName} открывается с ${portal.minLevel} уровня`);return false;}
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
  buyConsumable(p:Hero,kindOrDefinitionId:unknown,requestId?:unknown,quantity:unknown=1){
    if(!p.shopActive||!this.vendorAvailable(p))return false;
    const listing=consumable(kindOrDefinitionId)??consumableDefinition(kindOrDefinitionId);if(!listing)return false;
    if(quantity!==1&&quantity!==50)return false;
    if(typeof requestId==='string'){
      if(!requestId.length||requestId.length>80||this.purchaseReceipts.get(p.id)?.includes(requestId))return false;
    }else if(requestId!==undefined)return false;
    const count=consumableKindQuantity(p,listing.kind),stack=p.consumableInventory.find(stack=>stack.definitionId===listing.id);
    if(count+quantity>CONSUMABLE_LIMIT||stack&&stack.quantity+quantity>listing.stackLimit){this.notice(p,'Запас зелий полон');return false;}
    const price=listing.price*quantity;
    if(p.gold<price){this.notice(p,'Не хватает золота');return false;}
    if(!stack&&backpackUsage(p)>=BAG_CAPACITY){this.notice(p,'Рюкзак полон');return false;}
    p.gold-=price;
    if(stack)stack.quantity+=quantity;else p.consumableInventory.push({id:randomUUID(),definitionId:listing.id,quantity});
    p.potions=consumableKindQuantity(p,'hp');p.manaPotions=consumableKindQuantity(p,'mana');
    if(typeof requestId==='string'){
      const receipts=this.purchaseReceipts.get(p.id)??[];receipts.push(requestId);
      if(receipts.length>64)receipts.shift();this.purchaseReceipts.set(p.id,receipts);
    }
    this.notice(p,`Куплено: ${listing.name}${quantity===1?'':` × ${quantity}`}`);return true;
  }
  interactionInput(p:Hero){
    const target=p.interactionTarget;if(!target)return {x:0,z:0,aim:null};
    const chestGoal=!inChestRoom(p)?distance(p,CHEST_DOOR_OUTSIDE)>.55?CHEST_DOOR_OUTSIDE:CHEST_DOOR_INSIDE:CHEST_APPROACH;
    const point=target.kind==='vendor'?SHOP:target.kind==='portal'?portalById(target.id):target.kind==='travel'?travelPortalById(target.id):target.kind==='chest'?chestGoal:this.groundDrop(p,target.id);
    if(!point||!p.connected||p.dead||p.attack||(target.kind!=='chest'&&!clearPath(p,point))){this.stopInteraction(p);return {x:0,z:0,aim:null};}
    if((target.kind==='portal'||target.kind==='travel')&&(!sameLocation(p,point)||!this.portalAvailable(p))){this.stopInteraction(p);return {x:0,z:0,aim:null};}
    const limit=target.kind==='vendor'?SHOP.range:target.kind==='portal'?portalById(target.id)!.range:target.kind==='travel'?travelPortalById(target.id)!.range:target.kind==='chest'?.12:PICKUP_RANGE,d=distance(p,point);
    if(target.kind==='chest'&&this.chestAvailable(p)){this.openStash(p);return {x:0,z:0,aim:null};}
    if(d<=limit){if(target.kind==='vendor')this.openShop(p);else if(target.kind==='portal')this.usePortal(p,target.id);else if(target.kind==='travel')this.openTravel(p,target.id);else if(target.kind!=='chest')this.pickUp(p,target.id);return {x:0,z:0,aim:null};}
    const yaw=Math.atan2(point.x-p.x,point.z-p.z);
    return {x:Math.sin(yaw),z:Math.cos(yaw),aim:yaw};
  }
  stopAfk(p: Hero,reason?: string){
    if(!p.afk)return false;
    p.afk=null;p.input={...p.input,x:0,z:0,aim:null};p.vx=p.vz=0;
    if(p.attack?.automatic){this.stopChannel(p);p.attack=null;}
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
    if(!p.connected||p.dead){reply(false,'Характеристики меняются только у живого героя');return;}
    if(msg.type==='resetStats'&&(!safe(p)||p.attack||p.channel||p.combatUntil>this.t)){reply(false,'Сброс характеристик доступен у костра, вне боя');return;}
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
  updateBuild(p:Hero,msg:Record<string,unknown>){
    const reply=(ok:boolean,message?:string)=>this.emit('buildResult',{ok,revision:p.buildRevision,...(message?{message}:{})},p.id);
    if(!p.connected||p.dead){reply(false,'Сборка недоступна после смерти или отключения');return;}
    if(msg.type==='buildSavePreset'){
      if(!Number.isInteger(msg.index)||Number(msg.index)<0||Number(msg.index)>2){reply(false,'Неверный пресет');return;}
      p.skillPresets[Number(msg.index)]=structuredClone(p.skillBuild);reply(true,'Сборка сохранена');return;
    }
    if(msg.revision!==p.buildRevision||p.buildRevision>=Number.MAX_SAFE_INTEGER){reply(false,'Сборка уже изменилась. Обновите окно');return;}
    const raw=msg.type==='buildLoadPreset'&&Number.isInteger(msg.index)&&Number(msg.index)>=0&&Number(msg.index)<=2?p.skillPresets[Number(msg.index)]:msg.type==='buildApply'?msg.build:undefined;
    const build=parseSkillBuild(raw,p.classId,p.level);
    if(!build){reply(false,'Проверьте уровень, слоты и доступные очки талантов');return;}
    if(p.attack)p.actionRecoveryUntil=Math.max(p.actionRecoveryUntil??0,this.t+Math.max(0,p.attack.duration-p.attack.age)*1000);
    this.stopAfk(p);this.stopInteraction(p);this.clearSkillRuntime(p);p.attack=null;p.input={...p.input,x:0,z:0,aim:null};p.vx=p.vz=0;
    this.projectiles=this.projectiles.filter(b=>b.owner!==p.id);this.pendingAreas=this.pendingAreas.filter(a=>a.caster!==p.id);
    p.skillBuild=build;p.buildRevision++;
    p.afkPreferences.skillOrder=p.afkPreferences.skillOrder.filter(id=>build.slots.includes(id)&&SKILLS[id].kind!=='mobility');
    this.clampResources(p);reply(true);
  }
  hasEffect(p:Hero,id:SkillId){return p.effects.some(e=>e.skillId===id&&e.remaining>0);}
  removeEffect(p:Hero,id:SkillId){p.effects=p.effects.filter(e=>e.skillId!==id);}
  stopChannel(p:Hero){if(!p.channel)return;const id=p.channel.skillId;p.channel=undefined;if(p.attack?.skillId===id)p.attack=null;this.emit('skillImpact',{x:p.x,z:p.z,skillId:id,caster:p.id,attackId:p.attackSerial,yaw:p.yaw,phase:'end'});}
  clearSkillRuntime(p:Hero){
    this.stopChannel(p);p.mobility=undefined;p.effects=[];p.shieldBudget=0;
    this.skillZones=this.skillZones.filter(z=>z.owner!==p.id);
    for(const m of this.mobs)if(m.dots)m.dots=m.dots.filter(dot=>dot.owner!==p.id);
  }
  inSkillZone(point:Point,id:SkillId,ownerId?:string){return this.skillZones.some(z=>z.skillId===id&&z.remaining>0&&(!ownerId||z.owner===ownerId)&&sameLocation(point,z)&&distance(point,z)<=z.radius&&clearPath(z,point));}
  utilityNeeded(p:Hero,id:SkillId){
    if(this.hasEffect(p,id)||this.skillZones.some(z=>z.owner===p.id&&z.skillId===id))return false;
    if(['warrior-guard','mage-mana-shield','mage-ward','archer-smoke','warrior-banner'].includes(id))return p.hp<stats(p).maxHp*.7;
    if(id==='mage-mana-source')return p.mana<stats(p).maxMana*.65;
    if(id==='warrior-berserk')return p.hp>stats(p).maxHp*.7;
    if(id==='archer-wind')return false; // Stationary auto-hunt never spends mana on travel.
    return true;
  }
  mobilityDestination(p:Hero,id:SkillId,yaw:number,point?:Point):Point{
    const s=effectiveSkill(p,id),angle=id==='archer-retreat'?yaw+Math.PI:yaw,d=point&&id!=='archer-retreat'?Math.min(s.range,distance(p,point)):s.range;
    let last:Point={x:p.x,z:p.z};
    for(let step=.1;step<=d+.099;step+=.1){const length=Math.min(step,d),candidate={x:p.x+Math.sin(angle)*length,z:p.z+Math.cos(angle)*length};
      if(!sameLocation(p,candidate)||!stand(candidate.x,candidate.z,.3)||!clearPath(last,candidate)||safe(candidate))break;
      last=candidate;
    }
    return last;
  }
  slowMob(p:Hero,m:Mob,seconds:number,id?:SkillId){
    const b=talentBonuses(p),ice=id?.includes('frost')||id?.includes('ice-');
    const duration=seconds*(1+(b.controlDuration??0)+(ice&&b.frostlord?.25:0))*(m.eliteId?.5:1);
    m.slowUntil=Math.max(m.slowUntil??0,this.t+duration*1000);
  }
  rootMob(p:Hero,m:Mob,seconds:number){
    if((m.rootImmunityUntil??0)>this.t)return;
    const duration=seconds*(1+(talentBonuses(p).controlDuration??0))*(m.eliteId?.35:1);
    m.rootUntil=this.t+duration*1000;m.rootImmunityUntil=m.rootUntil+2500;
    if(m.state==='windup'){m.state='recover';m.timer=.35;m.age=0;}
  }
  addDot(p:Hero,m:Mob,id:SkillId,damage:number,seconds:number,automatic:boolean){
    if(m.state==='dead')return;
    const amount=damage*(1+(talentBonuses(p).dotDamage??0)),dots=m.dots??=[],existing=dots.find(dot=>dot.owner===p.id&&dot.skillId===id);
    // Keep nextTick unchanged: fast repeated casts never postpone a tick.
    if(existing){existing.remaining=seconds;existing.damage=amount;existing.automatic=automatic;}
    else dots.push({owner:p.id,skillId:id,remaining:seconds,nextTick:1,damage:amount,automatic});
    m.dots=dots;
  }
  tickDots(m:Mob,dt:number){
    if(!m.dots?.length)return;
    if(m.state==='dead'){m.dots=[];return;}
    for(const dot of [...m.dots]){
      const owner=this.players.get(dot.owner);
      if(!owner||!owner.connected||owner.dead||safe(owner)||!sameLocation(owner,m)||dot.automatic&&!owner.afk){dot.remaining=0;continue;}
      dot.remaining-=dt;dot.nextTick-=dt;
      if(dot.nextTick<=0){dot.nextTick+=1;this.hurtMob(owner,m,dot.damage,dot.automatic);}
    }
    m.dots=m.dots.filter(d=>d.remaining>0);
  }
  resolveUtility(p:Hero,a:HeroAttack,id:SkillId){
    const s=effectiveSkill(p,id),yaw=a.yaw??p.yaw;
    if(s.kind==='mobility'||s.kind==='channel')return true;
    if(!['defense','support'].includes(s.kind)&&id!=='archer-trap')return false;
    if(id==='warrior-shout'||id==='archer-focus'){
      if(this.hasEffect(p,id)){this.removeEffect(p,id);this.emit('skillImpact',{x:p.x,z:p.z,skillId:id,caster:p.id,attackId:a.id,yaw,phase:'end'});return true;}
    }
    if(['warrior-banner','archer-smoke','mage-mana-source','archer-trap'].includes(id)){
      const point=id==='archer-trap'?(a.target??{x:p.x+Math.sin(yaw)*2,z:p.z+Math.cos(yaw)*2}):p;
      if(!stand(point.x,point.z,0)||safe(point)||!clearPath(p,point))return true;
      this.skillZones=this.skillZones.filter(z=>z.owner!==p.id||z.skillId!==id);
      this.skillZones.push({id:randomUUID(),owner:p.id,skillId:id,x:point.x,z:point.z,radius:s.radius??1,remaining:s.effectDuration??8,attackId:a.id,yaw,damage:stats(p).attack*s.damageScale,budget:id==='mage-mana-source'?24:undefined,automatic:a.automatic});
    }else{
      this.removeEffect(p,id);p.effects.push({skillId:id,remaining:s.effectDuration??8});
      if(id==='mage-mana-shield')p.shieldBudget=Math.min(80,stats(p).maxHp*.4);
      this.clampResources(p);
    }
    this.emit('skillImpact',{x:p.x,z:p.z,skillId:id,caster:p.id,attackId:a.id,yaw,phase:'start',radius:s.radius,delay:s.effectDuration});return true;
  }
  tickSkillRuntime(p:Hero,dt:number){
    if(!p.connected||p.dead){this.clearSkillRuntime(p);return;}
    p.effects=p.effects.map(e=>({...e,remaining:e.remaining-dt})).filter(e=>e.remaining>0&&p.skillBuild.slots.includes(e.skillId));
    if(Math.hypot(p.input.x,p.input.z)>.01&&this.t-p.inputAt<350){this.removeEffect(p,'archer-focus');this.stopChannel(p);}
    if(p.mobility){
      const move=p.mobility;move.age=Math.min(move.duration,move.age+dt);const progress=move.age/move.duration;
      const t=move.skillId==='mage-teleport'?(progress>=.5?1:0):progress;
      const next={x:move.from.x+(move.to.x-move.from.x)*t,z:move.from.z+(move.to.z-move.from.z)*t};
      if(stand(next.x,next.z,.3)&&sameLocation(p,next)&&clearPath(p,next)){p.vx=(next.x-p.x)/dt;p.vz=(next.z-p.z)/dt;p.x=next.x;p.z=next.z;p.moveBlend=0;}
      if(move.age>=move.duration){
        if(move.skillId==='warrior-leap'){const skill=effectiveSkill(p,move.skillId),targets=this.mobs.filter(m=>liveMob(m)&&sameLocation(p,m)&&!safe(m)&&distance(p,m)<=(skill.radius??1.7)+mobConfig(m).radius&&clearPath(p,m)).sort((a,b)=>distance(p,a)-distance(p,b)||a.id-b.id).slice(0,skill.maxTargets);for(const m of targets)if(this.strikeMob(p,m,stats(p).attack*skill.damageScale,false,move.skillId))this.slowMob(p,m,skill.effectDuration??2,move.skillId);}
        if(move.skillId==='mage-ice-step'){const d=distance(move.from,move.to);for(let i=0;i<=Math.ceil(d);i++){const t=i/Math.max(1,Math.ceil(d));this.skillZones.push({id:randomUUID(),owner:p.id,skillId:move.skillId,x:move.from.x+(move.to.x-move.from.x)*t,z:move.from.z+(move.to.z-move.from.z)*t,radius:.8,remaining:3,attackId:p.attackSerial,yaw:p.yaw});}}
        this.emit('skillImpact',{x:p.x,z:p.z,skillId:move.skillId,caster:p.id,attackId:p.attackSerial,yaw:p.yaw,phase:'impact',radius:move.skillId==='warrior-leap'?effectiveSkill(p,move.skillId).radius:undefined});p.mobility=undefined;p.vx=p.vz=0;
      }
    }
    if(p.channel){
      const c=p.channel,s=effectiveSkill(p,c.skillId),target=c.targetId===undefined?this.mobs.filter(m=>liveMob(m)&&sameLocation(p,m)&&bodyStrike(p,m,c.yaw,s.range,.24)&&clearPath(p,m)).sort((a,b)=>distance(p,a)-distance(p,b))[0]:this.mobs.find(m=>m.id===c.targetId);
      if(p.afk&&target&&liveMob(target))c.heldUntil=this.t+400;
      if(safe(p)||this.t>c.heldUntil||!target||!liveMob(target)||!sameLocation(p,target)||safe(target)||distance(p,target)>s.range+mobConfig(target).radius||!clearPath(p,target)||p.mana<s.manaCost){this.stopChannel(p);return;}
      if(this.t>=c.nextTick){
        const base=classFor(p.classId).duration/(1+stats(p).attackSpeed),interval=base*s.durationScale;
        c.nextTick=this.t+Math.max(.15,interval)*1000;p.mana-=s.manaCost;p.targetYaw=Math.atan2(target.x-p.x,target.z-p.z);
        this.strikeMob(p,target,stats(p).attack*s.damageScale,!!p.afk,c.skillId);
        this.emit('skillImpact',{x:target.x,z:target.z,from:{x:p.x,z:p.z},skillId:c.skillId,caster:p.id,attackId:p.attackSerial,yaw:p.targetYaw,phase:'impact',delay:interval});
      }
    }
  }
  tickSkillZones(dt:number){
    for(const z of this.skillZones){
      const p=this.players.get(z.owner);z.remaining-=dt;
      if(!p||!p.connected||p.dead||safe(p)||!sameLocation(p,z)||!p.skillBuild.slots.includes(z.skillId)){z.remaining=0;continue;}
      if(z.skillId==='archer-trap'){
        const target=this.mobs.find(m=>liveMob(m)&&sameLocation(m,z)&&!safe(m)&&distance(m,z)<=z.radius+mobConfig(m).radius&&clearPath(z,m));
        if(target){this.strikeMob(p,target,z.damage??0,!!z.automatic,z.skillId);this.rootMob(p,target,2);z.remaining=0;this.emit('skillImpact',{x:z.x,z:z.z,skillId:z.skillId,caster:p.id,attackId:z.attackId,yaw:z.yaw,phase:'impact'});}
      }
      if(z.skillId==='mage-ice-step')for(const m of this.mobs)if(liveMob(m)&&sameLocation(m,z)&&distance(m,z)<=z.radius+mobConfig(m).radius&&clearPath(z,m))this.slowMob(p,m,.5,z.skillId);
      if(z.skillId==='mage-mana-source'&&distance(p,z)<=z.radius&&clearPath(z,p)&&(z.budget??0)>0){
        if(!p.manaSourceReceived||p.manaSourceReceived.resetAt<=this.t)p.manaSourceReceived={amount:0,resetAt:this.t+30000};
        const amount=Math.max(0,Math.min(2.4*dt,z.budget!,24-p.manaSourceReceived.amount,stats(p).maxMana-p.mana));
        p.mana+=amount;p.manaSourceReceived.amount+=amount;z.budget!-=amount;
      }
    }
    this.skillZones=this.skillZones.filter(z=>z.remaining>0);
  }
  patrol(m: Mob,dt: number,speedScale=1){
    // Stagger initial steps within a bounded window, independent of population.
    const cfg=mobConfig(m),spot=m.spotId?AFK_SPOTS.find(candidate=>candidate.id===m.spotId):null,route=m.patrol??={goal:null,pause:.8+(m.id%12)*.17,leg:0,speed:0,age:0};
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
    if(!isRecord(msg)||!p.connected)return;
    if(typeof msg.type==='string'&&['moveTo','travelOpen','travel','pickupNearest','attack','skill','afk','portal','pickup','interact','stashOpen','buildApply','buildLoadPreset','resetStats','weapon'].includes(msg.type))this.stopCampReturn(p);
    if(msg.type==='buildApply'||msg.type==='buildSavePreset'||msg.type==='buildLoadPreset'){this.updateBuild(p,msg);return;}
    if(msg.type==='skillStop'){this.stopChannel(p);return;}
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
      if(preferences.skillOrder.some(id=>!equippedSkills(p).some(s=>s.id===id)||SKILLS[id].kind==='mobility')){this.emit('preferencesSaved',{ok:false,message:'Для автоохоты выбираются только установленные неподвижные навыки'},p.id);return;}
      p.afkPreferences=preferences;
      if(p.afk&&p.afk.skillCursor>=preferences.skillOrder.length)p.afk.skillCursor=0;
      this.emit('preferencesSaved',{ok:true},p.id);return;
    }
    if(msg.type==='input'){
      if(typeof msg.x!=='number'||typeof msg.z!=='number'||!Number.isFinite(msg.x)||!Number.isFinite(msg.z)||Math.abs(msg.x)>1||Math.abs(msg.z)>1||(msg.aim!==null&&(typeof msg.aim!=='number'||!Number.isFinite(msg.aim)))||typeof msg.seq!=='number'||!Number.isSafeInteger(msg.seq)||msg.seq<=p.input.seq)return;
      if(Math.hypot(msg.x,msg.z)>.01){this.stopCampReturn(p);this.stopChannel(p);this.removeEffect(p,'archer-focus');this.stopAfk(p);this.stopInteraction(p);p.stashActive=false;}
      p.input={x:msg.x,z:msg.z,aim:msg.aim,seq:msg.seq};p.inputAt=this.t;return;
    }
    if(msg.type==='moveTo'){this.startMove(p,msg.target);return;}
    if(msg.type==='pickupNearest'){this.pickupNearest(p);return;}
    if(msg.type==='travelOpen'){this.startTravel(p,msg.portalId);return;}
    if(msg.type==='travel'){this.travel(p,msg.portalId,msg.destinationId);return;}
    if(msg.type==='attack'&&msg.approach===true&&!msg.special){this.startAttackApproach(p,msg.targetId);return;}
    if(msg.type==='attack'){this.stopAfk(p);this.stopInteraction(p);p.stashActive=false;if(typeof msg.yaw==='number'&&Number.isFinite(msg.yaw))this.attack(p,msg.yaw,msg.special===true,msg.targetId);return;}
    if(msg.type==='skill'){this.stopAfk(p);this.stopInteraction(p);p.stashActive=false;if(typeof msg.yaw==='number'&&Number.isFinite(msg.yaw)&&typeof msg.skillId==='string'&&Object.hasOwn(SKILLS,msg.skillId))this.castSkill(p,msg.skillId as SkillId,msg.yaw,msg.targetId,msg.target);return;}
    if(msg.type==='assignConsumable'){this.assignConsumable(p,msg.slot,msg.definitionId);return;}
    if(msg.type==='useConsumable'){if(isQuickSlot(msg.slot)){this.stopInteraction(p,true);this.useConsumable(p,msg.slot);}return;}
    if(msg.type==='potion'){this.stopInteraction(p,true);if(msg.kind===undefined||msg.kind==='hp'||msg.kind==='mana')this.potion(p,msg.kind??'hp');return;}
    if(msg.type==='pickup'){this.startPickup(p,msg.id);return;}
    if(msg.type==='interact'){if(msg.npcId===PERSONAL_CHEST.id)this.startChest(p,msg.npcId);else this.startVendor(p,msg.npcId);return;}
    if(msg.type==='stashOpen'){this.openStash(p);return;}
    if(msg.type==='stashClose'){p.stashActive=false;this.stopInteraction(p);return;}
    if(msg.type==='stashDeposit'||msg.type==='stashWithdraw'){this.transferStash(p,msg.id,msg.type==='stashWithdraw');return;}
    if(msg.type==='cancelInteraction'){this.stopInteraction(p);return;}
    if(msg.type==='portal'){this.startPortal(p,msg.portalId);return;}
    if(msg.type==='buy'){this.buy(p,msg.definitionId,msg.requestId);return;}
    if(msg.type==='buyConsumable'){
      if('definitionId' in msg){
        if((msg.quantity!==1&&msg.quantity!==50)||!consumableDefinition(msg.definitionId))return;
        this.buyConsumable(p,msg.definitionId,msg.requestId,msg.quantity);
      }else this.buyConsumable(p,msg.kind,msg.requestId);
      return;
    }
    if(msg.type==='run'&&typeof msg.running==='boolean'&&!p.dead){p.running=msg.running;return;}
    if(msg.type==='weapon'&&isWeaponId(msg.weapon)&&!p.attack&&!p.dead){const weapon=p.items.find(item=>item.id===p.equipment.weapon);if(weapon?.definitionId){this.notice(p,'Вид оружия определяется надетым предметом');return;}p.weapon=msg.weapon;return;}
    if(msg.type==='camp'){
      this.startCampReturn(p);return;
    }
    if(typeof msg.type==='string'&&['equip','unequip','sell','claim'].includes(msg.type)){
      if(p.dead)return;
      if((msg.type==='sell'||msg.type==='claim')&&(!safe(p)||p.attack||p.combatUntil>this.t)){this.notice(p,'Это действие доступно у костра, вне боя');return;}
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
    if(distance(p,m)>range+mobConfig(m).radius){this.notice(p,'Цель вне дальности навыка');return null;}
    if(!clearPath(p,m)){this.notice(p,'Цель закрыта препятствием');return null;}
    return m;
  }
  attack(p: Hero,yaw: number,special=false,targetId?:unknown){
    if(special)return this.castSkill(p,legacySkillId(p.classId),yaw,targetId);
    if(!Number.isFinite(yaw))return false;
    if(p.dead||p.attack||(p.actionRecoveryUntil??0)>this.t)return false;
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
    const skill=Object.hasOwn(SKILLS,skillId)?effectiveSkill(p,skillId):undefined;
    if(!skill||skill.classId!==p.classId||!equippedSkills(p).some(s=>s.id===skillId)||!Number.isFinite(yaw)||p.dead||!p.connected)return false;
    if(skill.kind==='channel'&&p.channel?.skillId===skillId){p.channel.heldUntil=this.t+400;p.channel.yaw=yaw;if(Number.isSafeInteger(targetId))p.channel.targetId=Number(targetId);return true;}
    if(p.attack||p.channel||(p.actionRecoveryUntil??0)>this.t)return false;
    const utility=['defense','support'].includes(skill.kind),mobility=skill.kind==='mobility';
    if(p.afk&&mobility)return false;
    if(safe(p)){this.emit('safe',{},p.id);return false;}
    const selfCentered=skillId==='warrior-earthquake'||skillId==='mage-arcane-nova';
    const aimed=utility||mobility||selfCentered?undefined:this.aimedMob(p,targetId,skill.range);
    if(aimed===null)return false;
    if(aimed)yaw=Math.atan2(aimed.x-p.x,aimed.z-p.z);
    const areaSkill=skillId==='archer-rain'||skillId==='archer-arrow-storm'||skillId==='mage-meteor'||mobility||skillId==='archer-trap';
    let center:Point|undefined;
    if(target!==undefined){
      if(!areaSkill||!validPoint(target)||!sameLocation(p,target)){this.notice(p,'Неверная точка навыка');return false;}
      const d=distance(p,target),scale=d>skill.range?skill.range/d:1;
      center={x:p.x+(target.x-p.x)*scale,z:p.z+(target.z-p.z)*scale};
      if(!stand(center.x,center.z,0)||safe(center)||(!mobility&&!clearPath(p,center))){this.notice(p,'Точка навыка недоступна');return false;}
      yaw=Math.atan2(center.x-p.x,center.z-p.z);
    }
    const cd=Math.max(p.skillCooldowns?.[skillId]??0,skillId===legacySkillId(p.classId)?p.specialCooldown:0,...(skill.cooldownFamily?skillsForClass(p.classId).filter(s=>s.cooldownFamily===skill.cooldownFamily).map(s=>p.skillCooldowns?.[s.id]??0):[]));
    if(cd>0)return false;
    if(p.mana<skill.manaCost){this.notice(p,'Не хватает маны. Обычная атака не расходует ману');return false;}
    p.targetYaw=Math.atan2(Math.sin(yaw),Math.cos(yaw));
    const c=classFor(p.classId),base=(p.classId==='warrior'?WEAPONS[p.weapon].duration:c.duration)/(1+stats(p).attackSpeed);
    const focused=this.hasEffect(p,'archer-focus')&&skill.maxTargets===1;
    p.attack={id:++p.attackSerial,age:0,duration:base*skill.durationScale*(focused?1.1:1),weapon:p.weapon,yaw:null,hit:false,special:true,skillId,...(aimed?{targetId:aimed.id}:{}),...(center?{target:center}:{}),...(p.afk?{automatic:true}:{})};
    p.combatUntil=this.t+15000;if(skill.kind!=='channel')p.mana-=skill.manaCost;
    if(skill.kind==='channel'){p.channel={skillId,heldUntil:this.t+400,nextTick:this.t+p.attack.duration*550,yaw,...(aimed?{targetId:aimed.id}:{})};p.attack.hit=true;}
    if(mobility){const to=this.mobilityDestination(p,skillId,yaw,center);if(distance(p,to)<.15){p.mana+=skill.manaCost;p.attack=null;return false;}p.mobility={from:{x:p.x,z:p.z},to,age:0,duration:p.attack.duration,skillId};p.attack.yaw=yaw;p.attack.hit=true;this.emit('skillImpact',{x:to.x,z:to.z,from:{x:p.x,z:p.z},skillId,caster:p.id,attackId:p.attack.id,yaw,phase:'start',delay:p.attack.duration});}
    (p.skillCooldowns??={})[skillId]=skill.cooldown;
    if(skill.cooldownFamily)for(const other of skillsForClass(p.classId))if(other.cooldownFamily===skill.cooldownFamily)p.skillCooldowns[other.id]=Math.max(p.skillCooldowns[other.id]??0,skill.cooldown);
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
  stopCampReturn(p:Hero){delete p.campReturn;}
  campReturnAvailable(p:Hero){
    this.refreshCombat(p);
    return p.connected&&!p.dead&&!p.attack&&!p.channel&&!p.mobility&&p.combatUntil<=this.t
      &&!this.mobs.some(m=>liveMob(m)&&sameLocation(p,m)&&m.target===p.id&&['chase','windup','recover'].includes(m.state))
      &&!this.projectiles.some(b=>b.owner===p.id)&&!this.pendingAreas.some(a=>a.caster===p.id);
  }
  startCampReturn(p:Hero){
    if(p.campReturn){this.stopCampReturn(p);return;}
    this.stopAfk(p);this.stopInteraction(p);p.shopActive=false;p.stashActive=false;
    if(!this.campReturnAvailable(p)){this.notice(p,'Возврат в город доступен только вне боя');return;}
    p.input={...p.input,x:0,z:0,aim:null};p.vx=p.vz=p.moveBlend=p.runBlend=0;
    p.campReturn={x:p.x,z:p.z,until:this.t+5000};
  }
  tickCampReturn(p:Hero){
    const pending=p.campReturn;if(!pending)return;
    if(!this.campReturnAvailable(p)||p.afk||p.interactionTarget||distance(p,pending)>.01){this.stopCampReturn(p);return;}
    if(this.t>=pending.until)this.camp(p,false);
  }
  camp(p: Hero,respawn: boolean){
    this.stopCampReturn(p);this.stopInteraction(p);p.shopActive=false;p.stashActive=false;this.stopAfk(p);this.clearSkillRuntime(p);
    delete p.navigationPlanAt;Object.assign(p,{...CAMP_SPAWN,yaw:Math.PI*.25,targetYaw:Math.PI*.25,vx:0,vz:0,dead:0,attack:null,moveBlend:0,runBlend:0,gait:0,input:{...p.input,x:0,z:0,aim:null}});
    if(respawn){p.hp=stats(p).maxHp;p.mana=stats(p).maxMana;}
    this.emit('camp',{},p.id);
  }
  damagePlayer(p: Hero,amount: number){
    if(p.dead||safe(p))return;
    this.stopCampReturn(p);
    const defense=Math.max(this.hasEffect(p,'warrior-guard')?.3:0,this.hasEffect(p,'mage-ward')?.18:0,this.inSkillZone(p,'warrior-banner',p.id)?.2:0);
    let damage=Math.max(1,Math.round(amount*(1-stats(p).damageReduction)*(1-defense)*(this.hasEffect(p,'warrior-berserk')?1.2:1)));
    if(this.hasEffect(p,'mage-mana-shield')&&p.mana>0&&(p.shieldBudget??0)>0){const absorbed=Math.min(damage*.35,p.mana,p.shieldBudget!);p.mana-=absorbed;p.shieldBudget!-=absorbed;damage=Math.max(0,damage-Math.floor(absorbed));} 
    p.hp=Math.max(0,p.hp-damage);p.hurt=.35;p.combatUntil=this.t+15000;this.emit('hurt',{x:p.x,z:p.z,amount:damage},p.id);
    if(!p.hp){this.clearSkillRuntime(p);this.stopAfk(p);this.stopInteraction(p);p.shopActive=false;p.stashActive=false;p.dead=2.5;p.attack=null;p.vx=p.vz=p.moveBlend=p.runBlend=0;this.emit('death',{},p.id);}
  }
  hurtMob(p: Hero,m: Mob,amount: number,automatic=false){
    if(p.dead||safe(p)||m.state==='dead'||m.bossLocked||safe(m)||!sameLocation(p,m)||!clearPath(p,m))return false;
    const dealt=Math.min(m.hp,Math.max(0,Math.round(amount)));if(!dealt)return false;
    this.stopCampReturn(p);
    const earlier=m.contributors.get(p.id);
    m.hp-=dealt;m.flash=.2;p.combatUntil=this.t+15000;m.contributors.set(p.id,{at:this.t,damage:(earlier?.damage||0)+dealt,automatic:(earlier?.automatic??automatic)&&automatic});
    this.emit('hit',{x:m.x,z:m.z,amount:dealt,id:m.id});
    if(!m.hp)this.kill(m);else if(m.state==='idle'||m.state==='return'){m.state='chase';m.target=p.id;m.timer=0;m.age=0;}
    return true;
  }
  strikeMob(p: Hero,m: Mob,amount: number,automatic=false,skillId?:SkillId){
    if(p.dead||safe(p)||m.state==='dead'||m.bossLocked||safe(m)||!sameLocation(p,m)||!clearPath(p,m))return false;
    if(this.random()>=Math.min(.99,stats(p).hitChance+(skillId&&SKILLS[skillId].maxTargets===1?(talentBonuses(p).singleAccuracy??0)+(this.hasEffect(p,'archer-focus')?.05:0):0))){
      p.combatUntil=this.t+15000;
      if(m.state==='idle'||m.state==='return'){m.state='chase';m.target=p.id;m.timer=0;m.age=0;}
      this.emit('miss',{x:m.x,z:m.z,id:m.id},p.id);return false;
    }
    return this.hurtMob(p,m,amount,automatic);
  }
  kill(m: Mob){
    if(m.state==='dead')return;
    m.state='dead';m.timer=m.eliteId?mobConfig(m).respawn:m.spotId?16:m.type==='alpha'?40:24;m.age=0;m.speed=0;m.slowUntil=0;m.rootUntil=0;m.dots=[];
    const cfg=mobConfig(m);
    // Recent nearby contributors receive personal rewards. A final hit cannot steal the kill.
    for(const [id,contribution] of m.contributors){
      const p=this.players.get(id);if(!p||p.dead||this.t-contribution.at>20000||!sameLocation(p,m)||distance(p,m)>12||contribution.damage<cfg.hp*.05)continue;
      const automatic=contribution.automatic===true,earnedXp=p.level>=MAX_LEVEL?0:mobExperience(p.level,cfg.level,cfg.xp);
      p.kills++;if(!automatic&&locationAt(m)==='forest')p.questKills++;p.xp+=earnedXp;if(!automatic&&m.id===6&&locationAt(m)==='forest')p.boss=true;
      while(p.level<MAX_LEVEL&&p.xp>=stats(p).xpNeeded){p.xp-=stats(p).xpNeeded;p.level++;p.statRevision++;this.emit('level',{level:p.level,points:5},p.id);}
      if(p.level>=MAX_LEVEL)p.xp=0;
      this.addGroundDrop(p.id,{id:randomUUID(),kind:'gold',x:m.x,z:m.z,amount:cfg.coins,expiresAt:this.t+LOOT_TTL_MS});
      const rarity=gearRarity(m.type,m.eliteId,this.random,!!m.bossId);
      if(rarity!==null){
        const choices=regionalEquipment(p.classId,fieldRegionAt(m),rarity),definition=choices[Math.floor(this.random()*choices.length)];
        const item=rollEquipment(definition.id,randomUUID(),this.random);
        const shifted=stand(m.x+.22,m.z+.12),x=shifted?m.x+.22:m.x,z=shifted?m.z+.12:m.z;
        this.addGroundDrop(p.id,{id:randomUUID(),kind:'item',x,z,item,expiresAt:this.t+LOOT_TTL_MS});
      }
      this.emit('kill',{id:m.id,name:cfg.name,xp:earnedXp},p.id);
    }
    m.contributors.clear();m.target=null;delete m.telegraph;
    if(m.bossId)this.dungeonRuns.get(m.bossId)!.resetAt=this.t+DUNGEON_RESET_SECONDS*1000;
    if(m.dungeonId)this.refreshDungeon(m.dungeonId);
  }
  resolveAttack(p: Hero,a: HeroAttack,attackPower: number){
    if(p.dead||safe(p))return;
    const skillId=a.skillId??(a.special?legacySkillId(p.classId):undefined),skill=skillId?effectiveSkill(p,skillId):undefined;
    if(skill&&this.resolveUtility(p,a,skill.id))return;
    if(skill?.maxTargets===1&&this.hasEffect(p,'archer-focus'))attackPower*=1.12;
    const yaw=a.yaw??p.yaw,baseDamage=attackPower*(p.classId==='warrior'&&a.weapon==='axe'?1.45:1);
    if(p.classId==='warrior'){
      const range=skill?.range??WEAPONS[a.weapon??p.weapon].range,halfAngle=skill?.halfAngle??.9;
      const targets=this.mobs.filter(m=>liveMob(m)&&sameLocation(p,m)&&bodyStrike(p,m,yaw,range,halfAngle))
        .sort((left,right)=>distance(p,left)-distance(p,right)||left.id-right.id).slice(0,skill?.maxTargets??1);
      for(const m of targets){
        if(a.automatic&&!p.afk)break;
        const struck=this.strikeMob(p,m,baseDamage*(skill?.damageScale??1),a.automatic===true,skillId);
        if(struck&&skillId==='warrior-bleed')this.addDot(p,m,skillId,baseDamage*.13,skill!.effectDuration!,a.automatic===true);
      }
      if(a.targetId!==undefined&&!targets.some(m=>m.id===a.targetId))this.notice(p,'Навык не коснулся выбранной цели');
      if(skillId)this.emit('skillImpact',{x:p.x,z:p.z,skillId,caster:p.id,attackId:a.id,yaw});
    }else if(skillId==='mage-frost'||skillId==='mage-seals'||skillId==='mage-arcane-nova'){
      const targets=this.mobs.filter(m=>liveMob(m)&&sameLocation(p,m)&&bodyStrike(p,m,yaw,skill!.range,Math.PI))
        .sort((left,right)=>distance(p,left)-distance(p,right)||left.id-right.id).slice(0,skill!.maxTargets);
      for(const m of targets){
        if(a.automatic&&!p.afk)break;
        if(this.strikeMob(p,m,attackPower*skill!.damageScale,a.automatic===true,skillId)&&m.state!=='dead'){if(skillId==='mage-seals')this.rootMob(p,m,1.5);else if(skillId==='mage-frost')this.slowMob(p,m,2,skillId);}
      }
      if(a.targetId!==undefined&&!targets.some(m=>m.id===a.targetId))this.notice(p,'Навык не коснулся выбранной цели');
      this.emit('skillImpact',{x:p.x,z:p.z,skillId,caster:p.id,attackId:a.id,yaw});
    }else if(skillId==='mage-lightning'){
      const hitIds=new Set<number>();let source: {x:number;z:number}=p;
      for(let index=0;index<skill!.maxTargets;index++){
        const reach=index===0?skill!.range:skill!.radius!;
        const next=this.mobs.filter(m=>liveMob(m)&&sameLocation(p,m)&&!safe(m)&&!hitIds.has(m.id)&&distance(source,m)<=reach+mobConfig(m).radius&&clearPath(p,m)&&clearPath(source,m)&&(index>0||bodyStrike(p,m,yaw,reach,.8)))
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
    }else if(skillId==='archer-rain'||skillId==='archer-arrow-storm'||skillId==='mage-meteor'){
      const distanceAhead=skill!.range*.75,center=a.target??{x:p.x+Math.sin(yaw)*distanceAhead,z:p.z+Math.cos(yaw)*distanceAhead};
      if(!stand(center.x,center.z,0)||safe(center)||!clearPath(p,center)){
        this.emit('skillImpact',{x:p.x,z:p.z,skillId,caster:p.id,attackId:a.id,yaw});return;
      }
      const delay=skillId==='archer-rain'?.45:skillId==='archer-arrow-storm'?.55:.7;
      this.pendingAreas.push({skillId,caster:p.id,attackId:a.id,yaw,...center,at:this.t+delay*1000,damage:attackPower*skill!.damageScale,automatic:a.automatic===true});
      this.emit('skillImpact',{...center,skillId,caster:p.id,attackId:a.id,yaw,phase:'warning',delay,radius:skill!.radius});
    }else{
      const spread=skillId==='archer-volley'?skill?.halfAngle??.27:.27,sharedHits: number[]=[],angles=skillId==='archer-volley'?[-spread,0,spread]:[0];
      for(const offset of angles)this.projectiles.push({
        id:randomUUID(),owner:p.id,x:p.x,z:p.z,yaw:yaw+offset,remaining:skill?.range??stats(p).range,hitIds:[],
        speed:skill?.projectileSpeed??(p.classId==='archer'?13:9),kind:p.classId,
        damage:attackPower*(skill?.damageScale??1),aoe:skillId==='mage-fireball'?skill!.radius??0:0,
        ...(a.targetId!==undefined?{targetId:a.targetId}:{}),...(skillId?{skillId,attackId:a.id,maxTargets:skill!.maxTargets,hitIds:skillId==='archer-volley'?sharedHits:[],pierce:skillId==='archer-piercing',damageScaleOnPierce:.82,...(skillId==='archer-frost-shot'?{slowMs:2500}:{})}:{}),
        ...(skillId==='archer-poison'?{dot:{skillId,damage:attackPower*.13,duration:skill!.effectDuration!}}:{}),...(skillId==='mage-ice-lance'?{slowMs:1500}:{}),
        ...(a.automatic?{automatic:true}:{})
      });
    }
  }
  afkRadius(p:Hero){return afkCombatRadius({...p.afkPreferences,skillOrder:p.afkPreferences.skillOrder.filter(id=>equippedSkills(p).some(s=>s.id===id)&&['attack','channel','control'].includes(SKILLS[id].kind))},p.classId==='warrior'?WEAPONS[p.weapon].range:stats(p).range);}
  afkTargets(p: Hero){
    if(!p.afk||!p.connected||p.dead||safe(p))return [];
    const reach=this.afkRadius(p);
    if(reach<=0)return [];
    return this.mobs.filter(m=>liveMob(m)&&sameLocation(p,m)&&!safe(m)&&
      distance(p.afk!.anchor,m)<=reach+mobConfig(m).radius&&clearPath(p,m))
      .sort((left,right)=>distance(p,left)-distance(p,right)||left.id-right.id);
  }
  /** Only personal filtered drops within stationary AFK pickup reach; AFK never approaches. */
  afkDrop(p:Hero){
    if(!p.afk||!p.connected||p.dead)return undefined;
    const room=backpackUsage(p)<BAG_CAPACITY,prefs=p.afkPreferences;

    return this.groundLoot.filter(drop=>drop.owner===p.id&&drop.expiresAt>this.t&&
      (drop.kind==='gold'?prefs.pickupGold:room&&!!drop.item&&prefs.pickupRarities.includes(drop.item.rarity))&&sameLocation(p,drop)&&
      distance(p,drop)<=AFK_PICKUP_RANGE&&stand(drop.x,drop.z,0)&&clearPath(p,drop))
      .sort((left,right)=>(left.kind==='gold'?0:1)-(right.kind==='gold'?0:1)||distance(p,left)-distance(p,right)||left.id.localeCompare(right.id))[0];
  }
  afkPickup(p:Hero){
    if(!p.afk||p.attack)return false;
    const drop=this.afkDrop(p);
    return !!drop&&this.collectDrop(p,drop.id,AFK_PICKUP_RANGE);
  }
  driveAfk(p: Hero){
    if(!p.afk)return {x:0,z:0,aim:null};
    if(!p.connected||p.dead){this.stopAfk(p);this.clearSkillRuntime(p);return {x:0,z:0,aim:null};}
    const target=this.afkTargets(p)[0];p.afk.targetId=target?.id??null;
    return {x:0,z:0,aim:target?Math.atan2(target.x-p.x,target.z-p.z):null};
  }
  autoAttack(p: Hero){
    if(!p.afk||p.attack||p.dead)return false;
    const targets=this.afkTargets(p),target=targets.find(m=>m.id===p.afk?.targetId)??targets[0];
    p.afk.targetId=target?.id??null;
    if(!target)return false;
    const yaw=Math.atan2(target.x-p.x,target.z-p.z),d=distance(p,target),body=mobConfig(target).radius,order=p.afkPreferences.skillOrder;
    for(let offset=0;offset<order.length;offset++){
      const index=(p.afk.skillCursor+offset)%order.length,skill=effectiveSkill(p,order[index]);
      const utility=['support','defense'].includes(skill.kind);
      if(!equippedSkills(p).some(s=>s.id===skill.id)||skill.kind==='mobility'||(utility&&!this.utilityNeeded(p,skill.id)))continue;
      if(!skill||skill.classId!==p.classId||(!utility&&d>skill.range+body)||p.mana<skill.manaCost||
        Math.max(p.skillCooldowns?.[skill.id]??0,skill.id===legacySkillId(p.classId)?p.specialCooldown:0)>0)continue;
      const area=skill.id==='archer-rain'||skill.id==='archer-arrow-storm'||skill.id==='mage-meteor';
      if(this.castSkill(p,skill.id,yaw,utility?undefined:target.id,area?{x:target.x,z:target.z}:undefined)){
        p.afk.skillCursor=(index+1)%order.length;return true;
      }
    }
    const basicRange=p.classId==='warrior'?WEAPONS[p.weapon].range:stats(p).range;
    if(p.afkPreferences.basicAttackFallback&&d<=basicRange+body&&this.attack(p,yaw,false,target.id))return true;
    return false;
  }
  refreshDungeon(id:string){
    const guards=this.mobs.some(m=>m.dungeonId===id&&!m.bossId&&m.state!=='dead');
    const boss=this.mobs.find(m=>m.bossId===id);if(boss)boss.bossLocked=guards;
  }
  resetDungeon(id:string,evacuate=false){
    if(evacuate){const d=dungeonById(id)!;for(const p of this.players.values())if(dungeonAt(p)?.id===id){this.stopAfk(p);this.stopInteraction(p);this.clearSkillRuntime(p);p.attack=null;p.input={...p.input,x:0,z:0,aim:null};Object.assign(p,d.entry,{vx:0,vz:0,moveBlend:0,runBlend:0});this.settleSafe(p);this.notice(p,'Подземелье обновилось. Вы перемещены к безопасному входу.');}}

    for(const m of this.mobs)if(m.dungeonId===id){Object.assign(m,{x:m.homeX,z:m.homeZ,hp:mobConfig(m).hp,state:'idle',timer:1,age:0,target:null,speed:0,flash:0,patrol:null,slowUntil:0,rootUntil:0,rootImmunityUntil:0,dots:[]});delete m.telegraph;m.contributors.clear();this.bossTurns.delete(m.id);}
    this.refreshDungeon(id);this.dungeonRuns.set(id,{resetAt:0,lastOccupied:this.t});
  }
  tickDungeons(){
    for(const [id,run] of this.dungeonRuns){
      const occupied=[...this.players.values()].some(p=>p.connected&&!p.dead&&dungeonAt(p)?.id===id&&!dungeonSafe(p));
      if(occupied)run.lastOccupied=this.t;
      // A cleared shared dungeon cannot be held forever by an idle/AFK occupant.
      if(run.resetAt>0&&this.t>=run.resetAt)this.resetDungeon(id,true);
      else if(!occupied&&this.t-run.lastOccupied>=DUNGEON_ABANDON_SECONDS*1000)this.resetDungeon(id);
    }
  }
  tickBoss(m:Mob,dt:number){
    const cfg=mobConfig(m),home={x:m.homeX,z:m.homeZ},movementScale=(m.rootUntil??0)>this.t?0:(m.slowUntil??0)>this.t?.7:1;
    const candidates=[...this.players.values()].filter(p=>p.connected&&!p.dead&&distance(p,home)<22&&sameLocation(p,m)&&!safe(p)&&clearPath(m,p));
    const target=candidates.find(p=>p.id===m.target)??candidates.sort((a,b)=>distance(a,m)-distance(b,m))[0];
    if(!target){
      delete m.telegraph;m.target=null;
      const d=distance(m,home);
      if(d>.2){m.state='return';const yaw=Math.atan2(home.x-m.x,home.z-m.z);m.yaw=turnTowards(m.yaw,yaw,dt,8);m.speed=translate(m,Math.sin(yaw)*cfg.speed*movementScale*dt,Math.cos(yaw)*cfg.speed*movementScale*dt,cfg.radius,true)/dt;}
      else{if(m.state!=='idle'){m.state='idle';m.timer=5;}m.timer-=dt;if(m.timer<=0){m.hp=cfg.hp;m.contributors.clear();}}
      m.gait+=m.speed*dt*5.8;return;
    }
    m.target=target.id;
    if(m.telegraph){
      m.state='windup';m.telegraph.remaining=Math.max(0,m.telegraph.remaining-dt);m.timer=m.telegraph.remaining;
      if(m.timer<=0){const warning=m.telegraph;for(const p of candidates)if(inBossTelegraph(warning,p)&&clearPath(warning,p))this.damagePlayer(p,cfg.damage*(warning.kind==='circle'?1.25:warning.kind==='ring'?1.05:.85));delete m.telegraph;m.state='recover';m.timer=1.2;m.age=0;}
      return;
    }
    if(m.state==='recover'){m.timer-=dt;if(m.timer>0)return;}
    const yaw=Math.atan2(target.x-m.x,target.z-m.z);m.yaw=turnTowards(m.yaw,yaw,dt,8);
    if(distance(target,m)>8){m.state='chase';m.speed=translate(m,Math.sin(yaw)*cfg.speed*movementScale*dt,Math.cos(yaw)*cfg.speed*movementScale*dt,cfg.radius,true)/dt;m.gait+=m.speed*dt*5.8;return;}
    const turn=this.bossTurns.get(m.id)??0,kind=(['cone','circle','ring'] as const)[turn%3];this.bossTurns.set(m.id,turn+1);
    const duration=kind==='cone'?1.15:kind==='circle'?1.7:1.9,origin=kind==='circle'?{x:target.x,z:target.z}:{x:m.x,z:m.z};
    m.telegraph={...origin,kind,yaw,radius:kind==='cone'?8:kind==='circle'?2.6:9,innerRadius:3.4,halfAngle:.65,duration,remaining:duration};m.targetYaw=yaw;m.yaw=yaw;m.state='windup';m.timer=duration;m.age=0;
  }
  tick(dt: number,now=this.t+dt*1000){
    dt=Math.max(0,Math.min(.1,dt));this.t=now;this.age+=dt;
    this.groundLoot=this.groundLoot.filter(drop=>drop.expiresAt>this.t);
    for(const p of this.players.values()){
      this.refreshCombat(p);
      if(p.campReturn&&(!this.campReturnAvailable(p)||p.dead))this.stopCampReturn(p);
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
      if(p.travelPortalId&&!this.travelAvailable(p,p.travelPortalId))delete p.travelPortalId;
      const input=p.afk?this.driveAfk(p):p.interactionTarget?this.interactionInput(p):p.navigation||p.attackTargetId!==undefined?this.navigationInput(p):p.connected&&this.t-p.inputAt<350?p.input:{x:0,z:0,aim:null};
      this.tickSkillRuntime(p,dt);
      const s=stats(p),before={gait:p.gait,x:p.x,z:p.z};p.speedScale=s.speedScale;if(!p.mobility)moveHero(p,dt,input);p.ack=p.input.seq;
      if(!p.afk&&!p.dead&&Math.hypot(input.x??0,input.z??0)>.01){
        const passage=ALL_PASSAGES.find(gate=>sameLocation(p,gate)&&distance(before,gate)>gate.range&&distance(p,gate)<=gate.range);
        if(passage)this.startPortal(p,passage.id);
      }
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
          if(intended&&liveMob(intended)&&sameLocation(p,intended)&&!safe(intended)&&distance(p,intended)<=reach+mobConfig(intended).radius&&clearPath(p,intended)){
            const revised=Math.atan2(intended.x-p.x,intended.z-p.z),change=angleDelta(p.yaw,revised);
            a.yaw=p.yaw+Math.max(-.5,Math.min(.5,change));
          }else a.yaw=p.yaw;
        }
        const attackSkill=a.skillId??(a.special?legacySkillId(p.classId):undefined);
        if(!a.hit&&a.age>=a.duration*(attackSkill?SKILLS[attackSkill].hitFraction:.49)){
          a.hit=true;this.resolveAttack(p,a,s.attack);
        }
        if(a.age>=a.duration){if(p.channel)a.age=0;else if(!p.mobility)p.attack=null;}
      }
      const atCamp=safe(p);
      const hpRegen=atCamp?s.hpRegen+18:p.combatUntil>this.t?s.hpRegen/3:s.hpRegen;
      p.hp=Math.min(s.maxHp,p.hp+hpRegen*dt);
      p.mana=Math.min(s.maxMana,p.mana+(s.manaRegen+(atCamp?12:0))*dt);
      if(atCamp){
        if(p.questKills>=5&&p.boss&&!p.questClaimed){p.questClaimed=true;p.gold+=50;this.emit('quest',{},p.id);}
      }
    }
    this.tickSkillZones(dt);this.tickDungeons();
    const activeLocations=new Set([...this.players.values()].map(p=>locationAt(p)));
    for(const m of this.mobs){
      this.tickDots(m,dt);
      const cfg=mobConfig(m),home={x:m.homeX,z:m.homeZ};m.age+=dt;m.flash=Math.max(0,m.flash-dt);m.speed=0;
      if(m.state==='dead'){if(m.dungeonId)continue;m.patrol=null;m.timer-=dt;if(m.timer<=0){Object.assign(m,{x:home.x,z:home.z,hp:cfg.hp,state:'idle',timer:1,age:0,target:null,slowUntil:0});m.contributors.clear();}continue;}
      if(!activeLocations.has(locationAt(m)))continue;
      if(m.bossLocked){m.state='idle';m.target=null;continue;}
      if(m.bossId){this.tickBoss(m,dt);continue;}
      const spot=m.spotId?AFK_SPOTS.find(candidate=>candidate.id===m.spotId):null;
      let p=m.target===null?undefined:this.players.get(m.target);
      if(m.state==='idle'){
        p=[...this.players.values()].filter(p=>!p.dead&&distance(p,m)<cfg.aggro&&sameLocation(p,m)&&!safe(p)&&clearPath(p,m)).sort((a,b)=>distance(a,m)-distance(b,m))[0];
        if(p){m.target=p.id;m.state='chase';m.age=0;}
      }
      if(['chase','windup','recover'].includes(m.state)&&(!p||p.dead||safe(p)||!sameLocation(p,m)||distance(p,m)>CHASE_TARGET_LIMIT)){
        const replacement=[...this.players.values()].filter(other=>!other.dead&&distance(other,m)<cfg.aggro&&sameLocation(other,m)&&!safe(other)&&clearPath(other,m)).sort((a,b)=>distance(a,m)-distance(b,m))[0];
        if(replacement){p=replacement;m.target=p.id;}
      }
      if(['chase','windup','recover'].includes(m.state)&&(!p||p.dead||safe(p)||!sameLocation(p,m)||distance(m,home)>CHASE_HOME_LIMIT||distance(p,m)>CHASE_TARGET_LIMIT)){
        m.state='return';m.target=null;m.timer=0;m.age=0;
      }
      if(m.state!=='idle'&&m.patrol){m.patrol.goal=null;m.patrol.speed=0;m.patrol.pause=1.1;}
      if((m.rootUntil??0)>this.t){m.speed=0;continue;}
      const slowScale=(m.slowUntil??0)>this.t?.7:1;
      if(m.state==='return'){
        const replacement=distance(m,home)<CHASE_HOME_LIMIT?[...this.players.values()].filter(other=>!other.dead&&distance(other,m)<cfg.aggro&&sameLocation(other,m)&&!safe(other)&&clearPath(other,m)).sort((a,b)=>distance(a,m)-distance(b,m))[0]:undefined;
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
        m.timer-=dt;if(m.timer<=0){for(const target of this.players.values())if(!target.dead&&inStrike(m,target,m.targetYaw,cfg.range+.2,.72)&&sameLocation(target,m)&&!safe(target)&&clearPath(m,target))if(!this.inSkillZone(m,'archer-smoke')||this.random()>=.28)this.damagePlayer(target,cfg.damage);m.state='recover';m.timer=cfg.cooldown;m.age=0;}
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
    for(const p of this.players.values())this.refreshCombat(p);
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
        const m=this.mobs.find(m=>liveMob(m)&&sameLocation(owner,m)&&!safe(m)&&!b.hitIds?.includes(m.id)&&distance(m,b)<mobConfig(m).radius+.34&&clearPath(owner,m));
        if(!m)continue;
        if(b.skillId&&b.attackId!==undefined)this.emit('skillImpact',{x:m.x,z:m.z,skillId:b.skillId,caster:b.owner,attackId:b.attackId,yaw:b.yaw});
        if(b.aoe){
          const targets=this.mobs.filter(other=>liveMob(other)&&sameLocation(owner,other)&&(other===m||distance(other,m)<=b.aoe+mobConfig(other).radius)&&!safe(other)&&clearPath(m,other))
            .sort((left,right)=>(left===m?-1:right===m?1:distance(left,m)-distance(right,m))||left.id-right.id).slice(0,b.maxTargets??this.mobs.length);
          for(const target of targets){
            if(b.automatic&&!owner.afk)break;
            b.hitIds?.push(target.id);this.strikeMob(owner,target,b.damage*(target===m?1:.65),b.automatic===true);
          }
          hit=true;
        }else{
          const ordinal=b.hitIds?.length??0;
          b.hitIds?.push(m.id);
          const struck=this.strikeMob(owner,m,b.damage*(b.pierce?(b.damageScaleOnPierce??1)**ordinal:1),b.automatic===true,b.skillId);
          if(struck&&b.slowMs&&m.state!=='dead')this.slowMob(owner,m,b.slowMs/1000,b.skillId);
          if(struck&&b.dot&&m.state!=='dead')this.addDot(owner,m,b.dot.skillId,b.dot.damage,b.dot.duration,b.automatic===true);
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
      const owner=this.players.get(area.caster),skill=owner?effectiveSkill(owner,area.skillId):SKILLS[area.skillId];
      if(!owner||owner.dead||safe(owner)||safe(area)||!sameLocation(owner,area)||area.automatic&&!owner.afk)continue;
      const targets=this.mobs.filter(m=>liveMob(m)&&sameLocation(owner,m)&&!safe(m)&&distance(area,m)<=skill.radius!+mobConfig(m).radius&&clearPath(area,m)&&clearPath(owner,m))
        .sort((left,right)=>distance(area,left)-distance(area,right)||left.id-right.id).slice(0,skill.maxTargets);
      for(const m of targets){
        const falloff=area.skillId==='mage-meteor'?Math.max(.68,1-.32*distance(area,m)/skill.radius!):1;
        this.strikeMob(owner,m,area.damage*falloff,area.automatic);
      }
      this.emit('skillImpact',{x:area.x,z:area.z,skillId:area.skillId,caster:area.caster,attackId:area.attackId,yaw:area.yaw,phase:'impact',radius:skill.radius});
    }
    // Finish after all hostile work: fresh aggro or damage on the deadline must win.
    for(const p of this.players.values())this.tickCampReturn(p);
  }
  snapshot(forId: string): WorldSnapshot{
    const p=this.players.get(forId);
    const dungeon=p?dungeonAt(p):undefined,run=dungeon?this.dungeonRuns.get(dungeon.id):undefined;
    return {dungeon:dungeon?{id:dungeon.id,guardsRemaining:this.mobs.filter(m=>m.dungeonId===dungeon.id&&!m.bossId&&m.state!=='dead').length,bossDefeated:this.mobs.some(m=>m.bossId===dungeon.id&&m.state==='dead'),resetIn:run?.resetAt?Math.max(0,(run.resetAt-this.t)/1000):0}:undefined,t:this.t,skillZones:this.skillZones.filter(z=>!p||sameLocation(p,z)).map(({budget,attackId,yaw,damage,automatic,...z})=>z),players:[...this.players.values()].filter(other=>!p||sameLocation(p,other)).map(p=>({id:p.id,name:p.name,classId:p.classId,x:p.x,z:p.z,yaw:p.yaw,weapon:p.weapon,hp:p.hp,maxHp:stats(p).maxHp,level:p.level,dead:p.dead,hurt:p.hurt,attack:p.attack,moveBlend:p.moveBlend,runBlend:p.runBlend,gait:p.gait,vx:p.vx,vz:p.vz,connected:p.connected,effects:p.effects,appearance:equipmentAppearance(p)})),onlinePlayers:[...this.players.values()].filter(player=>player.connected).map(player=>({id:player.id,name:player.name,classId:player.classId,level:player.level,location:locationAt(player)})),mobs:this.mobs.filter(m=>!p||sameLocation(p,m)).map(({contributors,patrol,slowUntil,rootUntil,rootImmunityUntil,dots,slow,...m})=>({...m,slow:Math.max(0,((slowUntil??0)-this.t)/1000)})),projectiles:this.projectiles.filter(b=>!p||sameLocation(p,b)).map(({damage,aoe,maxTargets,hitIds,pierce,damageScaleOnPierce,slowMs,automatic,dot,rootMs,...b})=>b),groundLoot:this.groundLoot.filter(drop=>drop.owner===forId&&(!p||sameLocation(p,drop))).map(({owner,...drop})=>drop),self:p?{...stats(p),...persistentHero(p),navigationTarget:p.navigation?.target??null,attackTargetId:p.attackTargetId??null,travelPortalId:p.travelPortalId,campReturnRemaining:p.campReturn?Math.max(0,(p.campReturn.until-this.t)/1000):0,appearance:equipmentAppearance(p),attackPower:stats(p).attack,targetYaw:p.targetYaw,vx:p.vx,vz:p.vz,hurt:p.hurt,gait:p.gait,moveBlend:p.moveBlend,runBlend:p.runBlend,ack:p.ack,afk:p.afk,afkRadius:this.afkRadius(p),interactionTarget:p.interactionTarget,shopActive:p.shopActive,stashActive:p.stashActive}:null,events:this.events.filter(e=>(!e.owner||e.owner===forId)&&(!p||!('x' in e&&'z' in e)||sameLocation(p,e)))};
  }
}
