import type {ClassId, EquipmentSlot, Item, ItemRoll, ItemStatKey, ItemAppearance, StatSource} from '../../shared/types.js';

export interface ItemDefinition {
  id:string; classId:ClassId; name:string; slot:EquipmentSlot; appearance:string; level:number;
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
export const CLASS_ITEMS:Record<ClassId,readonly ItemDefinition[]>={warrior:WARRIOR_ITEMS,archer:ARCHER_ITEMS,mage:MAGE_ITEMS};
export const EQUIPMENT_ITEMS:readonly ItemDefinition[]=Object.values(CLASS_ITEMS).flat();
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
  return {id,name:definition.name,slot:definition.slot,rarity:1,power:rolls[0].value,classId:definition.classId,definitionId,rollVersion:1,itemLevel:definition.level,rolls};
}
export function validateEquipment(item:Item){
  if(item.definitionId===undefined){if(item.rolls!==undefined||item.rollVersion!==undefined)throw new Error('Item rolls need a definition');return;}
  const definition=itemDefinition(item.definitionId);
  if(!definition||item.rollVersion!==1||item.slot!==definition.slot||item.classId!==definition.classId||item.itemLevel!==definition.level||!Array.isArray(item.rolls)||item.rolls.length!==definition.ranges.length)throw new Error('Invalid saved equipment');
  for(let i=0;i<definition.ranges.length;i++){
    const roll=item.rolls[i],range=definition.ranges[i];
    if(!roll||roll.key!==range.key||roll.min!==range.min||roll.max!==range.max||(roll.step??1)!==(range.step??1)||!Number.isFinite(roll.value)||roll.value<roll.min||roll.value>roll.max||Math.abs((roll.value-roll.min)/(range.step??1)-Math.round((roll.value-roll.min)/(range.step??1)))>1e-6)throw new Error('Invalid saved equipment roll');
  }
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
export const rollValue=(roll:ItemRoll)=>`+${number.format(roll.value)}${rollUnit(roll.key)}`;
export const rollRange=(roll:ItemRoll)=>`${number.format(roll.min)}–${number.format(roll.max)}${rollUnit(roll.key)}`;
export const rollPosition=(roll:ItemRoll)=>roll.max===roll.min?1:(roll.value-roll.min)/(roll.max-roll.min);
