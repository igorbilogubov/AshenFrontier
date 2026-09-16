import {regionalEquipment} from './equipment-items.js';
import {mobConfig} from './location.js';
import {BOSS_GEAR_CHANCE,BOSS_RARITY_CHANCES,GEAR_CHANCE,ELITE_GEAR_CHANCE,ELITE_RARE_CHANCE,GREEN_GEAR_CHANCE,WHITE_GEAR_CHANCE} from './loot-rules.js';
import type {DungeonId,EquipmentSlot,MobType} from '../../shared/types.js';
import type {GearRegion} from './regional-equipment.js';

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

const REGION_TYPES:Readonly<Record<Exclude<GearRegion,'forest'>,readonly MobType[]>>=Object.freeze({
  snow:['lynx','yak','frost-spider','ice-golem'],
  wasteland:['ash-jackal','scorpion','monitor-lizard','scarab'],
  swamp:['swamp-frog','marsh-crocodile','plague-mosquito','bog-spider'],
  mines:['cave-bat','cave-crawler','crystal-beetle','stone-guardian'],
  rift:['hellhound','lava-elemental','ember-crab','basalt-brute'],
  citadel:['bonehound','gargoyle','void-stalker','iron-warden']
});
export const lootRegionForType=(type:MobType):GearRegion=>
  (Object.entries(REGION_TYPES).find(([,types])=>types.includes(type))?.[0] as GearRegion|undefined)??'forest';

const GROUPS:Readonly<Record<Exclude<LootCategoryId,'gold'>,readonly EquipmentSlot[]>>=Object.freeze({
  weapon:['weapon'],armor:['armor','helmet','boots'],accessory:['ring','amulet']
});
const LABELS:Readonly<Record<LootCategoryId,string>>=Object.freeze({
  gold:'Золото',weapon:'Оружие',armor:'Броня',accessory:'Аксессуары'
});
const BOSS_RARITIES=[1,2,3,4] as const;

/** Display only categories that the current server item catalog can actually roll. */
export function possibleLoot(type:MobType,eliteId?:string,bossId?:DungeonId,dungeonId?:DungeonId):PossibleLoot{
  const categories:PossibleLootCategory[]=[{id:'gold',name:LABELS.gold,rarity:'gold',slots:[]}];
  const region=(bossId??dungeonId)?(bossId??dungeonId)!.replace(/-dungeon$/,'') as GearRegion:lootRegionForType(type);
  const rarities:readonly (0|1|2|3|4)[]=bossId?BOSS_RARITIES:eliteId?[1,2]:[0,1];
  for(const id of ['weapon','armor','accessory'] as const){
    const slots=GROUPS[id];
    for(const rarity of rarities){
      const definitions=(['warrior','archer','mage'] as const).flatMap(classId=>regionalEquipment(classId,region,rarity)).filter(item=>slots.includes(item.slot));
      if(!definitions.length)continue;
      const chance=bossId?BOSS_RARITY_CHANCES[rarity as keyof typeof BOSS_RARITY_CHANCES]:eliteId?(rarity===2?ELITE_RARE_CHANCE:ELITE_GEAR_CHANCE-ELITE_RARE_CHANCE):rarity===0?(WHITE_GEAR_CHANCE[type]??.005):(GREEN_GEAR_CHANCE[type]??.02);
      categories.push({id,name:LABELS[id],rarity,slots,...(chance===undefined?{}:{chance})});
    }
  }
  const config=mobConfig({type,eliteId,bossId,dungeonId:dungeonId??bossId});
  return {gold:config.coins,itemChance:bossId?BOSS_GEAR_CHANCE:eliteId?ELITE_GEAR_CHANCE:(GEAR_CHANCE[type]??.025),categories};
}
