import {BOSS_SET_DEFINITIONS,itemDefinition} from './equipment-items.js';
import type {Item,ItemStatKey,StatSource} from '../../shared/types.js';

export interface SetBonus {pieces:2|4;stats:readonly {key:ItemStatKey;value:number}[]}
export interface EquipmentSet {id:string;classId:'warrior'|'archer'|'mage';region:string;level:number;name:string;bonuses:readonly SetBonus[]}
/** Bonuses are ordinary additive stats. No damage procs, skill modifiers or hidden slots. */
export const EQUIPMENT_SETS:readonly EquipmentSet[]=BOSS_SET_DEFINITIONS.map(set=>({...set,bonuses:[
  {pieces:2,stats:[{key:set.classId==='mage'?'maxMana':'maxHp',value:Math.round(4+set.level*.65)}]},
  {pieces:4,stats:[{key:'attack',value:Math.round(1+set.level*.09)}]}
]}));
export const itemSet=(item:Pick<Item,'definitionId'>)=>{const id=itemDefinition(item.definitionId)?.setId;return id?EQUIPMENT_SETS.find(set=>set.id===id):undefined;};
export function equippedSetCounts(source:StatSource):Map<string,number>{
  const slots=new Map<string,Set<string>>();
  for(const [slot,id] of Object.entries(source.equipment??{})){
    const item=source.items?.find(item=>item.id===id&&item.slot===slot);if(!item)continue;
    const definition=itemDefinition(item.definitionId),set=itemSet(item);
    if(!definition||!set||set.classId!==(source.classId??'warrior')||definition.level>(source.level??1))continue;
    let worn=slots.get(set.id);if(!worn){worn=new Set();slots.set(set.id,worn);}worn.add(slot);
  }
  return new Map([...slots].map(([id,worn])=>[id,worn.size]));
}
export function activeSetBonuses(source:StatSource):{key:ItemStatKey;value:number}[]{
  const counts=equippedSetCounts(source);return EQUIPMENT_SETS.flatMap(set=>set.bonuses.filter(bonus=>(counts.get(set.id)??0)>=bonus.pieces).flatMap(bonus=>bonus.stats));
}
