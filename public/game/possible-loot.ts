import {CLASS_ITEMS,RARE_CLASS_ITEMS,rollEquipment} from './equipment-items.js';
import {mobConfig} from './location.js';
import {GEAR_CHANCE,ELITE_GEAR_CHANCE,ELITE_RARE_CHANCE} from './loot-rules.js';
import type {EquipmentSlot,MobType} from '../../shared/types.js';

export type LootCategoryId='gold'|'weapon'|'armor'|'accessory';
export interface PossibleLootCategory {
  id:LootCategoryId;
  name:string;
  rarity:number|'gold';
  slots:readonly EquipmentSlot[];
  chance?:number;
}
export interface PossibleLoot {
  gold:number;
  itemChance:number;
  categories:readonly PossibleLootCategory[];
}

const GROUPS:Readonly<Record<Exclude<LootCategoryId,'gold'>,readonly EquipmentSlot[]>>=Object.freeze({
  weapon:['weapon'],armor:['armor','helmet','boots'],accessory:['ring','amulet']
});
const LABELS:Readonly<Record<LootCategoryId,string>>=Object.freeze({
  gold:'Золото',weapon:'Оружие',armor:'Броня',accessory:'Аксессуары'
});

/** Display only categories that the current server item catalog can actually roll. */
export function possibleLoot(type:MobType,eliteId?:string):PossibleLoot{
  const categories:PossibleLootCategory[]=[{id:'gold',name:LABELS.gold,rarity:'gold',slots:[]}];
  for(const id of ['weapon','armor','accessory'] as const){
    const slots=GROUPS[id],definitions=[...Object.values(CLASS_ITEMS).flat(),...(eliteId?Object.values(RARE_CLASS_ITEMS).flat():[])].filter(item=>slots.includes(item.slot));
    if(!definitions.length)continue;
    // The actual server roll establishes today's rarity. Keep the badge tied to
    // that result rather than promising a future rarity not in the drop table.
    const rarities=new Set(definitions.map(item=>rollEquipment(item.id,'display-only',()=>0).rarity));
    for(const rarity of [...rarities].sort((a,b)=>a-b))categories.push({id,name:LABELS[id],rarity,slots,...(eliteId?{chance:rarity===2?ELITE_RARE_CHANCE:ELITE_GEAR_CHANCE-ELITE_RARE_CHANCE}:{})});
  }
  return {gold:mobConfig({type,eliteId}).coins,itemChance:eliteId?ELITE_GEAR_CHANCE:GEAR_CHANCE[type],categories};
}
