import type {ClassId, EquipmentSlot, Item, ItemRoll, ItemStatKey, ItemAppearance, StatSource} from '../../shared/types.js';
import {REGIONAL_ITEMS,REGIONAL_COLLECTIONS,GEAR_REGIONS,type GearRegion,type CollectionRegion} from './regional-equipment.js';

export interface ItemDefinition {
  id:string; rarity?:0|1|2|3|4; setId?:string; classId:ClassId; name:string; slot:EquipmentSlot; appearance:string; level:number;
  ranges:readonly {key:ItemStatKey; min:number; max:number; step?:number}[];
}
export const ITEM_STAT_LABELS:Record<ItemStatKey,string>={attack:'Урон',armor:'Защита',maxHp:'Здоровье',maxMana:'Мана',hpRegen:'Восстановление HP',manaRegen:'Восстановление маны',accuracy:'Шанс попадания',haste:'Скорость атаки'};
export const WARRIOR_ITEMS:readonly ItemDefinition[]=[
  {classId:'warrior',id:'wanderer-blade',name:'Меч странника',slot:'weapon',appearance:'wanderer-sword',level:1,ranges:[{key:'attack',min:4,max:8},{key:'accuracy',min:1,max:3}]},
  {classId:'warrior',id:'watch-blade',name:'Клинок дозорного',slot:'weapon',appearance:'watch-sword',level:1,ranges:[{key:'attack',min:7,max:11},{key:'haste',min:2,max:5}]},
  {classId:'warrior',id:'wanderer-armor',name:'Кожаный доспех странника',slot:'armor',appearance:'wanderer-armor',level:1,ranges:[{key:'armor',min:2,max:4},{key:'maxHp',min:5,max:15}]},
  {classId:'warrior',id:'watch-armor',name:'Панцирь дозорного',slot:'armor',appearance:'watch-armor',level:1,ranges:[{key:'armor',min:4,max:7},{key:'maxHp',min:8,max:18}]},
  {classId:'warrior',id:'wanderer-hood',name:'Капюшон странника',slot:'helmet',appearance:'wanderer-hood',level:1,ranges:[{key:'armor',min:1,max:3},{key:'accuracy',min:1,max:2}]},
  {classId:'warrior',id:'watch-helm',name:'Шлем дозорного',slot:'helmet',appearance:'watch-helm',level:1,ranges:[{key:'armor',min:2,max:4},{key:'maxHp',min:5,max:12}]},
  {classId:'warrior',id:'wanderer-boots',name:'Сапоги странника',slot:'boots',appearance:'wanderer-boots',level:1,ranges:[{key:'armor',min:1,max:2},{key:'hpRegen',min:.05,max:.15,step:.01}]},
  {classId:'warrior',id:'watch-boots',name:'Сапоги дозорного',slot:'boots',appearance:'watch-boots',level:1,ranges:[{key:'armor',min:2,max:3},{key:'maxHp',min:4,max:10}]},
  {classId:'warrior',id:'copper-ring',name:'Медное кольцо рвения',slot:'ring',appearance:'copper-ring',level:1,ranges:[{key:'attack',min:1,max:3},{key:'haste',min:1,max:3}]},
  {classId:'warrior',id:'ember-amulet',name:'Оберег тлеющего угля',slot:'amulet',appearance:'ember-amulet',level:1,ranges:[{key:'maxHp',min:5,max:15},{key:'maxMana',min:5,max:10}]}
];
export const ARCHER_ITEMS:readonly ItemDefinition[]=[
  {classId:'archer',id:'ranger-bow',name:'Лук следопыта',slot:'weapon',appearance:'ranger-bow',level:1,ranges:[{key:'attack',min:4,max:8},{key:'accuracy',min:1,max:3}]},
  {classId:'archer',id:'ranger-armor',name:'Доспех следопыта',slot:'armor',appearance:'ranger-armor',level:1,ranges:[{key:'armor',min:2,max:4},{key:'maxHp',min:5,max:15}]},
  {classId:'archer',id:'ranger-hood',name:'Капюшон следопыта',slot:'helmet',appearance:'ranger-hood',level:1,ranges:[{key:'armor',min:1,max:3},{key:'accuracy',min:1,max:2}]},
  {classId:'archer',id:'ranger-boots',name:'Сапоги следопыта',slot:'boots',appearance:'ranger-boots',level:1,ranges:[{key:'armor',min:1,max:2},{key:'maxHp',min:4,max:10}]},
  {classId:'archer',id:'sentinel-bow',name:'Лук лесного стража',slot:'weapon',appearance:'sentinel-bow',level:1,ranges:[{key:'attack',min:7,max:11},{key:'haste',min:2,max:5}]},
  {classId:'archer',id:'sentinel-armor',name:'Доспех лесного стража',slot:'armor',appearance:'sentinel-armor',level:1,ranges:[{key:'armor',min:4,max:7},{key:'maxHp',min:8,max:18}]},
  {classId:'archer',id:'sentinel-hood',name:'Капюшон лесного стража',slot:'helmet',appearance:'sentinel-hood',level:1,ranges:[{key:'armor',min:2,max:4},{key:'maxHp',min:5,max:12}]},
  {classId:'archer',id:'sentinel-boots',name:'Сапоги лесного стража',slot:'boots',appearance:'sentinel-boots',level:1,ranges:[{key:'armor',min:2,max:3},{key:'maxHp',min:4,max:10}]},
  {classId:'archer',id:'hawk-ring',name:'Кольцо сокола',slot:'ring',appearance:'hawk-ring',level:1,ranges:[{key:'attack',min:1,max:3},{key:'haste',min:1,max:3}]},
  {classId:'archer',id:'leaf-amulet',name:'Оберег листвы',slot:'amulet',appearance:'leaf-amulet',level:1,ranges:[{key:'maxHp',min:5,max:15},{key:'maxMana',min:5,max:10}]}
];
export const MAGE_ITEMS:readonly ItemDefinition[]=[
  {classId:'mage',id:'acolyte-staff',name:'Посох послушника',slot:'weapon',appearance:'acolyte-staff',level:1,ranges:[{key:'attack',min:4,max:8},{key:'haste',min:1,max:3}]},
  {classId:'mage',id:'acolyte-armor',name:'Одеяние послушника',slot:'armor',appearance:'acolyte-armor',level:1,ranges:[{key:'armor',min:2,max:4},{key:'maxMana',min:5,max:15}]},
  {classId:'mage',id:'acolyte-hood',name:'Капюшон послушника',slot:'helmet',appearance:'acolyte-hood',level:1,ranges:[{key:'armor',min:1,max:3},{key:'maxMana',min:5,max:12}]},
  {classId:'mage',id:'acolyte-boots',name:'Сапоги послушника',slot:'boots',appearance:'acolyte-boots',level:1,ranges:[{key:'armor',min:1,max:2},{key:'maxHp',min:4,max:10}]},
  {classId:'mage',id:'runekeeper-staff',name:'Посох хранителя рун',slot:'weapon',appearance:'runekeeper-staff',level:1,ranges:[{key:'attack',min:7,max:11},{key:'haste',min:2,max:5}]},
  {classId:'mage',id:'runekeeper-armor',name:'Одеяние хранителя рун',slot:'armor',appearance:'runekeeper-armor',level:1,ranges:[{key:'armor',min:4,max:7},{key:'maxMana',min:8,max:18}]},
  {classId:'mage',id:'runekeeper-crown',name:'Венец хранителя рун',slot:'helmet',appearance:'runekeeper-crown',level:1,ranges:[{key:'armor',min:2,max:4},{key:'maxMana',min:5,max:12}]},
  {classId:'mage',id:'runekeeper-boots',name:'Сапоги хранителя рун',slot:'boots',appearance:'runekeeper-boots',level:1,ranges:[{key:'armor',min:2,max:3},{key:'maxHp',min:4,max:10}]},
  {classId:'mage',id:'rune-ring',name:'Рунное кольцо',slot:'ring',appearance:'rune-ring',level:1,ranges:[{key:'attack',min:1,max:3},{key:'haste',min:1,max:3}]},
  {classId:'mage',id:'moon-amulet',name:'Лунный оберег',slot:'amulet',appearance:'moon-amulet',level:1,ranges:[{key:'maxHp',min:5,max:15},{key:'maxMana',min:5,max:10}]}
];
export const CLASS_ITEMS:Record<ClassId,readonly ItemDefinition[]>={warrior:WARRIOR_ITEMS.map(i=>({...i,ranges:adjustRanges(i,2,1)})),archer:ARCHER_ITEMS.map(i=>({...i,ranges:adjustRanges(i,2,1)})),mage:MAGE_ITEMS.map(i=>({...i,ranges:adjustRanges(i,2,1)}))};
// Versioned common definitions let white drops use a real pool without
// changing the IDs, ranges, or rarity of any saved green equipment.

function adjustRanges(item: ItemDefinition, count: number, scale: number): ItemDefinition['ranges'] {
  const result: ItemDefinition['ranges'][number][] = [];
  for (let i = 0; i < Math.min(count, item.ranges.length); i++) {
    const r = item.ranges[i];
    result.push({
      ...r,
      min: Math.round(Math.ceil(r.min * scale / (r.step ?? 1)) * (r.step ?? 1) * 1000) / 1000,
      max: Math.round(Math.ceil(r.max * scale / (r.step ?? 1)) * (r.step ?? 1) * 1000) / 1000
    });
  }
  const level = item.level || 1;
  const extraKeys: ItemStatKey[] = {
    weapon: ['haste', 'accuracy', 'maxHp', 'hpRegen'],
    armor: ['maxHp', 'maxMana', 'hpRegen', 'manaRegen'],
    helmet: ['accuracy', 'maxMana', 'maxHp', 'armor'],
    boots: ['hpRegen', 'maxHp', 'haste', 'armor'],
    ring: ['haste', 'accuracy', 'maxHp', 'attack'],
    amulet: ['manaRegen', 'hpRegen', 'maxMana', 'maxHp']
  }[item.slot] as ItemStatKey[];

  let keyIndex = 0;
  while (result.length < count && keyIndex < extraKeys.length) {
    const key = extraKeys[keyIndex++];
    if (result.some(r => r.key === key)) continue;
    let min = 1, max = 2, step = 1;
    switch (key) {
      case 'maxHp': min = 5 + level * 2; max = 15 + level * 3; break;
      case 'maxMana': min = 5 + level * 1.5; max = 10 + level * 2; break;
      case 'hpRegen': case 'manaRegen': min = 0.05 + level * 0.005; max = 0.15 + level * 0.01; step = 0.01; break;
      case 'haste': min = 1 + Math.floor(level/20); max = 3 + Math.floor(level/15); break;
      case 'accuracy': min = 1 + Math.floor(level/25); max = 2 + Math.floor(level/20); break;
      case 'armor': min = 1 + Math.floor(level/4); max = 2 + Math.floor(level/3); break;
      case 'attack': min = 1 + Math.floor(level/3); max = 3 + Math.floor(level/2.5); break;
    }
    min = Math.round(Math.ceil(min * scale / step) * step * 1000) / 1000;
    max = Math.round(Math.ceil(max * scale / step) * step * 1000) / 1000;
    result.push({ key, min, max, ...(step !== 1 ? {step} : {}) });
  }
  return result;
}

const commonDefinitions=(items:readonly ItemDefinition[]):readonly ItemDefinition[]=>items.map(item=>({...item,id:`${item.id}-common-v1`,name:item.name,rarity:0 as const,ranges:adjustRanges(item, 1, 0.75)}));
export const COMMON_CLASS_ITEMS:Record<ClassId,readonly ItemDefinition[]>={warrior:commonDefinitions(WARRIOR_ITEMS),archer:commonDefinitions(ARCHER_ITEMS),mage:commonDefinitions(MAGE_ITEMS)};
// Frozen v1 ranges belong to these new IDs. Existing item definitions stay unchanged.
const rareDefinitions=(items:readonly ItemDefinition[]):readonly ItemDefinition[]=>items.map(item=>({...item,id:`${item.id}-rare-v1`,name:item.name,rarity:2,ranges:adjustRanges(item, 3, 1.25)}));
export const RARE_CLASS_ITEMS:Record<ClassId,readonly ItemDefinition[]>={warrior:rareDefinitions(WARRIOR_ITEMS),archer:rareDefinitions(ARCHER_ITEMS),mage:rareDefinitions(MAGE_ITEMS)};
type ClassCatalog=Record<ClassId,readonly ItemDefinition[]>;
const classes=['warrior','archer','mage'] as const;
export const RARE_REGIONAL_ITEMS=Object.fromEntries((Object.keys(REGIONAL_ITEMS) as CollectionRegion[]).map(region=>[region,Object.fromEntries(classes.map(classId=>[classId,rareDefinitions(REGIONAL_ITEMS[region][classId])]))])) as Record<CollectionRegion,ClassCatalog>;
export const COMMON_REGIONAL_ITEMS=Object.fromEntries((Object.keys(REGIONAL_ITEMS) as CollectionRegion[]).map(region=>[region,Object.fromEntries(classes.map(classId=>[classId,commonDefinitions(REGIONAL_ITEMS[region][classId])]))])) as Record<CollectionRegion,ClassCatalog>;
const bases=(classId:ClassId,region:GearRegion)=>region==='forest'?CLASS_ITEMS[classId]:REGIONAL_ITEMS[region][classId];
const scaledRanges=(item:ItemDefinition,scale:number)=>adjustRanges(item, 4, scale);
export const BOSS_SET_DEFINITIONS=GEAR_REGIONS.flatMap(region=>classes.map(classId=>({
  id:`${region}-${classId}-set-v1`,classId,region,level:bases(classId,region)[0].level,
  name:region==='forest'?({warrior:'Клятва дозорного',archer:'Обет лесного стража',mage:'Тайна хранителя рун'}[classId]):`Наследие: ${REGIONAL_COLLECTIONS[region][classId][1]}`
})));
const selectedSetBases=(classId:ClassId,region:GearRegion)=>region==='forest'?CLASS_ITEMS[classId].filter(item=>['watch-blade','watch-armor','watch-helm','watch-boots','copper-ring','ember-amulet','sentinel-bow','sentinel-armor','sentinel-hood','sentinel-boots','hawk-ring','leaf-amulet','runekeeper-staff','runekeeper-armor','runekeeper-crown','runekeeper-boots','rune-ring','moon-amulet'].includes(item.id)):bases(classId,region);
export const YELLOW_ITEMS=Object.fromEntries(GEAR_REGIONS.map(region=>[region,Object.fromEntries(classes.map(classId=>[classId,bases(classId,region).map(item=>({...item,id:`${item.id}-exalted-v1`,name:item.name,rarity:3 as const,ranges:scaledRanges(item,1.42)}))]))])) as unknown as Record<GearRegion,ClassCatalog>;
export const SET_ITEMS=Object.fromEntries(GEAR_REGIONS.map(region=>[region,Object.fromEntries(classes.map(classId=>[classId,selectedSetBases(classId,region).map(item=>({...item,id:`${item.id}-set-v1`,name:item.name,rarity:4 as const,setId:`${region}-${classId}-set-v1`,ranges:scaledRanges(item,1.23)}))]))])) as unknown as Record<GearRegion,ClassCatalog>;
export const EQUIPMENT_ITEMS:readonly ItemDefinition[]=[...Object.values(COMMON_CLASS_ITEMS).flat(),...Object.values(CLASS_ITEMS).flat(),...Object.values(RARE_CLASS_ITEMS).flat(),...Object.values(REGIONAL_ITEMS).flatMap(region=>Object.values(region).flat()),...Object.values(COMMON_REGIONAL_ITEMS).flatMap(region=>Object.values(region).flat()),...Object.values(RARE_REGIONAL_ITEMS).flatMap(region=>Object.values(region).flat()),...Object.values(YELLOW_ITEMS).flatMap(region=>Object.values(region).flat()),...Object.values(SET_ITEMS).flatMap(region=>Object.values(region).flat())];
export const regionalEquipment=(classId:ClassId,region:GearRegion,rarity:0|1|2|3|4):readonly ItemDefinition[]=>rarity===4?SET_ITEMS[region][classId]:rarity===3?YELLOW_ITEMS[region][classId]:region==='forest'?(rarity===0?COMMON_CLASS_ITEMS:rarity===2?RARE_CLASS_ITEMS:CLASS_ITEMS)[classId]:(rarity===0?COMMON_REGIONAL_ITEMS:rarity===2?RARE_REGIONAL_ITEMS:REGIONAL_ITEMS)[region][classId];
export const regionalDropPool=(region:GearRegion,rarity:0|1|2|3|4)=>classes.flatMap(classId=>regionalEquipment(classId,region,rarity));
const QUALITY_TAIL=/ (простого качества|превосходства|величия|наследия)$/;
export const itemDisplayName=(name:string)=>name.replace(QUALITY_TAIL,'');
export const equipmentItems=(classId:ClassId)=>CLASS_ITEMS[classId];
export const itemDefinition=(id:unknown)=>typeof id==='string'?EQUIPMENT_ITEMS.find(item=>item.id===id):undefined;
// Called with server randomness for real loot. The workshop creates labelled,
// disposable samples using the identical range rules; samples cannot enter a hero.
export function rollEquipment(definitionId:string,id:string,random:()=>number):Item{
  const definition=itemDefinition(definitionId);if(!definition)throw new Error('Unknown equipment definition');
  const rolls:ItemRoll[]=definition.ranges.map(range=>{
    const unit=random();if(!Number.isFinite(unit)||unit<0||unit>=1)throw new Error('Random source must return [0, 1)');
    const step=range.step??1,steps=Math.round((range.max-range.min)/step);
    return {...range,value:Math.round((range.min+Math.floor(unit*(steps+1))*step)*1000)/1000};
  });
  return {id,name:definition.name,slot:definition.slot,rarity:definition.rarity??1,power:rolls[0].value,classId:definition.classId,definitionId,rollVersion:1,itemLevel:definition.level,rolls};
}
export function validateEquipment(item:Item){
  if(item.definitionId===undefined){if(item.rolls!==undefined||item.rollVersion!==undefined)throw new Error('Item rolls need a definition');return;}
  const definition=itemDefinition(item.definitionId);
  if(!definition||item.rarity!==(definition.rarity??1)||item.rollVersion!==1||item.slot!==definition.slot||item.classId!==definition.classId||item.itemLevel!==definition.level||!Array.isArray(item.rolls)||!item.rolls.length)throw new Error('Invalid saved equipment structure');
  // Stored roll counts stay frozen. New rarity tables may have more or fewer
  // options than a live item; mutating them would change the durable fingerprint.
  const shared=Math.min(item.rolls.length,definition.ranges.length);
  for(let i=0;i<shared;i++){
    const roll=item.rolls[i],range=definition.ranges[i];
    if(!roll||roll.key!==range.key)throw new Error('Invalid saved equipment roll');
  }
  if(item.enhance!==undefined&&(!Number.isInteger(item.enhance)||item.enhance<0||item.enhance>9))throw new Error('Invalid saved equipment structure');
  if(item.power!==item.rolls[0].value)throw new Error('Invalid equipment primary value');
}
export function equipmentAppearance(source:StatSource):ItemAppearance|undefined{
  const result:ItemAppearance={};
  for(const slot of ['weapon','armor','helmet','boots','ring','amulet'] as const){
    const item=source.items?.find(item=>item.id===source.equipment?.[slot]&&item.slot===slot);
    result[slot]=item?itemDefinition(item.definitionId)?.appearance??'legacy':null;
  }
  return result;
}
const number=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});
export const rollUnit=(key:ItemStatKey)=>key==='accuracy'||key==='haste'?'%':key==='hpRegen'||key==='manaRegen'?' / с':'';
export const rollValue=(roll:ItemRoll)=>`${number.format(roll.value)}${rollUnit(roll.key)}`;
export const rollRange=(roll:ItemRoll)=>`${number.format(roll.min)}–${number.format(roll.max)}${rollUnit(roll.key)}`;
export const rollPosition=(roll:ItemRoll)=>roll.max===roll.min?1:(roll.value-roll.min)/(roll.max-roll.min);
