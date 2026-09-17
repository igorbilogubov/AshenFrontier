const isRecord=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
import type {AfkPreferences,ClassId,SkillId} from '../../shared/types.js';
import {SKILLS,skillsForClass,type SkillDefinition} from './skills.js';

export const AFK_PICKUP_RARITIES=[0,1,2,3,4] as const;
export const MIN_AFK_RADIUS_PERCENT=25;
export const MAX_AFK_RADIUS_PERCENT=100;
export const AFK_ATTACK_KINDS=['attack','channel','control'] as const;
export const AFK_BUFF_KINDS=['support','defense'] as const;
const exactKeys=(value:Record<string,unknown>,keys:readonly string[])=>Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const threshold=(value:unknown):value is {enabled:boolean;belowPercent:number}=>isRecord(value)&&exactKeys(value,['enabled','belowPercent'])&&typeof value.enabled==='boolean'&&Number.isInteger(value.belowPercent)&&typeof value.belowPercent==='number'&&value.belowPercent>=1&&value.belowPercent<=99;
const NEW_KEYS=['pickupGold','pickupRarities','hpPotion','manaPotion','attackSkill','buffSkills','basicAttackFallback','radiusPercent'] as const;
const OLD_KEYS=['pickupGold','pickupRarities','hpPotion','manaPotion','skillOrder','basicAttackFallback','radiusPercent'] as const;

export const isAfkAttackSkill=(skill:Pick<SkillDefinition,'kind'>)=>AFK_ATTACK_KINDS.includes(skill.kind as typeof AFK_ATTACK_KINDS[number]);
export const isAfkBuffSkill=(skill:Pick<SkillDefinition,'kind'>)=>AFK_BUFF_KINDS.includes(skill.kind as typeof AFK_BUFF_KINDS[number]);
export function afkSkillsFromIds(ids:readonly (SkillId|null)[]):Pick<AfkPreferences,'attackSkill'|'buffSkills'>{
  const present=ids.filter((id):id is SkillId=>!!id&&Object.hasOwn(SKILLS,id));
  return {attackSkill:present.find(id=>isAfkAttackSkill(SKILLS[id]))??null,buffSkills:present.filter(id=>isAfkBuffSkill(SKILLS[id]))};
}
export function clampAfkPreferences(preferences:AfkPreferences,slots:readonly (SkillId|null)[]):AfkPreferences{
  const allowed=new Set(slots.filter((id):id is SkillId=>!!id));
  return {
    ...preferences,
    attackSkill:preferences.attackSkill&&allowed.has(preferences.attackSkill)&&isAfkAttackSkill(SKILLS[preferences.attackSkill])?preferences.attackSkill:null,
    buffSkills:preferences.buffSkills.filter(id=>allowed.has(id)&&isAfkBuffSkill(SKILLS[id]))
  };
}

function commonFields(value:Record<string,unknown>){
  if(typeof value.pickupGold!=='boolean'||typeof value.basicAttackFallback!=='boolean'||!threshold(value.hpPotion)||!threshold(value.manaPotion))return null;
  if(!Number.isInteger(value.radiusPercent)||typeof value.radiusPercent!=='number'||value.radiusPercent<MIN_AFK_RADIUS_PERCENT||value.radiusPercent>MAX_AFK_RADIUS_PERCENT)return null;
  const rarities=value.pickupRarities;
  if(!Array.isArray(rarities)||rarities.length>AFK_PICKUP_RARITIES.length||new Set(rarities).size!==rarities.length||rarities.some(rarity=>!AFK_PICKUP_RARITIES.includes(rarity)))return null;
  return {pickupGold:value.pickupGold,pickupRarities:[...rarities] as number[],hpPotion:{enabled:value.hpPotion.enabled,belowPercent:value.hpPotion.belowPercent},
    manaPotion:{enabled:value.manaPotion.enabled,belowPercent:value.manaPotion.belowPercent},basicAttackFallback:value.basicAttackFallback,radiusPercent:value.radiusPercent};
}

export function defaultAfkPreferences(classId:ClassId):AfkPreferences{
  return {pickupGold:true,pickupRarities:[...AFK_PICKUP_RARITIES],hpPotion:{enabled:true,belowPercent:35},manaPotion:{enabled:true,belowPercent:25},
    attackSkill:skillsForClass(classId).find(isAfkAttackSkill)?.id??null,buffSkills:[],basicAttackFallback:true,radiusPercent:MAX_AFK_RADIUS_PERCENT};
}
/** Validate a full client payload; partial or cross-class settings never reach storage. */
export function parseAfkPreferences(value:unknown,classId:ClassId):AfkPreferences|null{
  if(!isRecord(value))return null;
  const available=new Set<SkillId>(skillsForClass(classId).map(skill=>skill.id));
  const validId=(id:unknown):id is SkillId=>typeof id==='string'&&available.has(id as SkillId);
  let attackSkill:SkillId|null;
  let buffSkills:SkillId[];
  if(exactKeys(value,NEW_KEYS)){
    if(!(value.attackSkill===null||(validId(value.attackSkill)&&isAfkAttackSkill(SKILLS[value.attackSkill]))))return null;
    const buffs=value.buffSkills;
    if(!Array.isArray(buffs)||new Set(buffs).size!==buffs.length||buffs.some(id=>!validId(id)||!isAfkBuffSkill(SKILLS[id])))return null;
    attackSkill=value.attackSkill;buffSkills=[...buffs];
  }else if(exactKeys(value,OLD_KEYS)){
    const order=value.skillOrder;
    if(!Array.isArray(order)||order.length>available.size||new Set(order).size!==order.length||order.some(id=>!validId(id)))return null;
    const migrated=afkSkillsFromIds(order as SkillId[]);
    attackSkill=migrated.attackSkill;buffSkills=migrated.buffSkills;
  }else return null;
  const common=commonFields(value);if(!common)return null;
  return {...common,attackSkill,buffSkills};
}
/** Stable engagement radius, independent of temporary mana and cooldown availability. */
export const afkCombatRadius=(preferences:AfkPreferences,basicRange:number)=>
  Math.max(preferences.basicAttackFallback?basicRange:0,preferences.attackSkill?SKILLS[preferences.attackSkill].range:0)*preferences.radiusPercent/100;
