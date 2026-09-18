import type {FieldRegionId,Item,ItemRoll,MobType} from '../../shared/types.js';
import type {ConsumableDefinition} from './consumables.js';
import {itemDisplayName} from './equipment-items.js';

export const SMITH=Object.freeze({id:'camp-smith',name:'Кузнец',x:-6.4,z:3.2,range:2.4});
export const MAX_ENHANCE=9;
export const ENHANCE_PER_LEVEL=.02;
export const WHETSTONE_ID='whetstone';
export const INGOT_ID='tempered-ingot';
export const WHETSTONE_CHANCE=.04;
export const LATE_INGOT_CHANCE=.004;
export const ELITE_WHETSTONE_CHANCE=.25;
export const ELITE_INGOT_CHANCE=.50;
export const GUARD_MATERIAL_CHANCE=.08;
export const BOSS_INGOT_MIN=2;
export const BOSS_INGOT_EXTRA=.40;
const ENHANCE_GOLD=Object.freeze([0,20,35,55,90,150,250,400,650,1000]);
const LATE_INGOT_REGIONS=new Set<FieldRegionId>(['wasteland','swamp','mines','rift','citadel']);

export const SMITH_MATERIALS=Object.freeze({
  [WHETSTONE_ID]:Object.freeze({id:WHETSTONE_ID,kind:'material',name:'Оселок',price:4,restore:0,cooldown:0,stackLimit:999}) satisfies ConsumableDefinition,
  [INGOT_ID]:Object.freeze({id:INGOT_ID,kind:'material',name:'Закалённый слиток',price:24,restore:0,cooldown:0,stackLimit:999}) satisfies ConsumableDefinition
});
export const smithMaterial=(id:unknown)=>typeof id==='string'&&Object.hasOwn(SMITH_MATERIALS,id)?SMITH_MATERIALS[id as keyof typeof SMITH_MATERIALS]:undefined;
export const itemEnhance=(item:Pick<Item,'enhance'>|null|undefined)=>{
  const value=item?.enhance??0;
  return Number.isInteger(value)?Math.max(0,Math.min(MAX_ENHANCE,value)):0;
};
export const itemEnhanceMark=(item:Pick<Item,'name'|'enhance'>|null|undefined)=>itemEnhance(item)?` +${itemEnhance(item)}`:'';
export const itemTitle=(item:Pick<Item,'name'|'enhance'>)=>`${itemDisplayName(item.name)}${itemEnhanceMark(item)}`;
export const enhanceGold=(next:number)=>ENHANCE_GOLD[next]??0;
export const enhanceMaterial=(next:number)=>next<=6?WHETSTONE_ID:INGOT_ID;
export const enhanceChance=(next:number)=>next<=3?1:next<=6?.8:next<=MAX_ENHANCE?.6:0;
export function enhanceOffer(item:Pick<Item,'enhance'>){
  const next=itemEnhance(item)+1;
  if(next>MAX_ENHANCE)return null;
  const materialId=enhanceMaterial(next);
  return {next,chance:enhanceChance(next),gold:enhanceGold(next),materialId,material:smithMaterial(materialId)!};
}
export function enhanceRollBonus(item:Pick<Item,'enhance'>,roll:ItemRoll,index:number){
  const level=itemEnhance(item);
  if(index!==0||level<=0)return 0;
  return Math.round(roll.value*ENHANCE_PER_LEVEL*level*1000)/1000;
}
export function enhancePowerBonus(item:Pick<Item,'enhance'|'power'>){
  const level=itemEnhance(item),power=Number.isFinite(item.power)?item.power:0;
  return Math.round(power*ENHANCE_PER_LEVEL*level*1000)/1000;
}

export interface MaterialDrop {definitionId:typeof WHETSTONE_ID|typeof INGOT_ID;amount:number}
const unit=(random:()=>number)=>{
  const roll=random();if(!Number.isFinite(roll)||roll<0||roll>=1)throw new Error('Random source must return [0, 1)');
  return roll;
};
const push=(drops:MaterialDrop[],id:MaterialDrop['definitionId'],amount:number)=>{if(amount>0)drops.push({definitionId:id,amount});};

/** Stadium callers must skip this. Ordinary forest/snow never yield ingots. */
export function rollSmithMaterials(source:{type:MobType;eliteId?:string;bossId?:string;dungeonId?:string;region:FieldRegionId},random:()=>number):MaterialDrop[]{
  const drops:MaterialDrop[]=[];
  if(source.bossId){
    push(drops,INGOT_ID,BOSS_INGOT_MIN+(unit(random)<BOSS_INGOT_EXTRA?1:0));
    push(drops,WHETSTONE_ID,3+Math.floor(unit(random)*3));
    return drops;
  }
  if(source.eliteId){
    if(unit(random)<ELITE_INGOT_CHANCE)push(drops,INGOT_ID,1);
    if(unit(random)<ELITE_WHETSTONE_CHANCE)push(drops,WHETSTONE_ID,1);
    return drops;
  }
  if(source.dungeonId){
    if(unit(random)<GUARD_MATERIAL_CHANCE)push(drops,INGOT_ID,1);
    if(unit(random)<GUARD_MATERIAL_CHANCE)push(drops,WHETSTONE_ID,1);
    return drops;
  }
  if(unit(random)<WHETSTONE_CHANCE)push(drops,WHETSTONE_ID,1);
  if(LATE_INGOT_REGIONS.has(source.region)&&unit(random)<LATE_INGOT_CHANCE)push(drops,INGOT_ID,1);
  return drops;
}
