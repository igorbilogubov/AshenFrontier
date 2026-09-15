const isRecord=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
import type {AfkPreferences,ClassId,SkillId} from '../../shared/types.js';
import {SKILLS,skillsForClass} from './skills.js';

const RARITIES=[0,1,2] as const;
export const MIN_AFK_RADIUS_PERCENT=25;
export const MAX_AFK_RADIUS_PERCENT=100;
const exactKeys=(value:Record<string,unknown>,keys:readonly string[])=>Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const threshold=(value:unknown):value is {enabled:boolean;belowPercent:number}=>isRecord(value)&&exactKeys(value,['enabled','belowPercent'])&&typeof value.enabled==='boolean'&&Number.isInteger(value.belowPercent)&&typeof value.belowPercent==='number'&&value.belowPercent>=1&&value.belowPercent<=99;

export function defaultAfkPreferences(classId:ClassId):AfkPreferences{
  return {pickupGold:true,pickupRarities:[...RARITIES],hpPotion:{enabled:true,belowPercent:35},manaPotion:{enabled:true,belowPercent:25},
    skillOrder:skillsForClass(classId).slice(0,2).map(skill=>skill.id),basicAttackFallback:true,radiusPercent:MAX_AFK_RADIUS_PERCENT};
}
/** Validate a full client payload; partial or cross-class settings never reach storage. */
export function parseAfkPreferences(value:unknown,classId:ClassId):AfkPreferences|null{
  if(!isRecord(value)||!exactKeys(value,['pickupGold','pickupRarities','hpPotion','manaPotion','skillOrder','basicAttackFallback','radiusPercent']))return null;
  if(typeof value.pickupGold!=='boolean'||typeof value.basicAttackFallback!=='boolean'||!threshold(value.hpPotion)||!threshold(value.manaPotion))return null;
  if(!Number.isInteger(value.radiusPercent)||typeof value.radiusPercent!=='number'||value.radiusPercent<MIN_AFK_RADIUS_PERCENT||value.radiusPercent>MAX_AFK_RADIUS_PERCENT)return null;
  const rarities=value.pickupRarities;
  if(!Array.isArray(rarities)||rarities.length>RARITIES.length||new Set(rarities).size!==rarities.length||rarities.some(rarity=>!RARITIES.includes(rarity)))return null;
  const order=value.skillOrder,available=new Set<SkillId>(skillsForClass(classId).map(skill=>skill.id));
  if(!Array.isArray(order)||order.length>available.size||new Set(order).size!==order.length||order.some(skill=>!available.has(skill)))return null;
  return {pickupGold:value.pickupGold,pickupRarities:[...rarities],hpPotion:{enabled:value.hpPotion.enabled as boolean,belowPercent:value.hpPotion.belowPercent as number},
    manaPotion:{enabled:value.manaPotion.enabled as boolean,belowPercent:value.manaPotion.belowPercent as number},skillOrder:[...order] as SkillId[],basicAttackFallback:value.basicAttackFallback,radiusPercent:value.radiusPercent};
}
/** Stable engagement radius, independent of temporary mana and cooldown availability. */
export const afkCombatRadius=(preferences:AfkPreferences,basicRange:number)=>
  Math.max(preferences.basicAttackFallback?basicRange:0,...preferences.skillOrder.map(id=>SKILLS[id].range))*preferences.radiusPercent/100;
