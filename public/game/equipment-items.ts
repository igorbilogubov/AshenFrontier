import type {EquipmentSlot, Item, ItemRoll, ItemStatKey, ItemAppearance, StatSource} from '../../shared/types.js';

export interface ItemDefinition {
  id:string; name:string; slot:EquipmentSlot; appearance:string; level:number;
  ranges:readonly {key:ItemStatKey; min:number; max:number; step?:number}[];
}
export const ITEM_STAT_LABELS:Record<ItemStatKey,string>={attack:'Урон',armor:'Защита',maxHp:'Здоровье',maxMana:'Мана',hpRegen:'Восстановление HP',manaRegen:'Восстановление маны',accuracy:'Шанс попадания',haste:'Скорость атаки'};
export const WARRIOR_ITEMS:readonly ItemDefinition[]=[
  {id:'wanderer-blade',name:'Меч странника',slot:'weapon',appearance:'wanderer-sword',level:1,ranges:[{key:'attack',min:4,max:8},{key:'accuracy',min:1,max:3}]},
  {id:'watch-blade',name:'Клинок дозорного',slot:'weapon',appearance:'watch-sword',level:1,ranges:[{key:'attack',min:7,max:11},{key:'haste',min:2,max:5}]},
  {id:'wanderer-armor',name:'Кожаный доспех странника',slot:'armor',appearance:'wanderer-armor',level:1,ranges:[{key:'armor',min:2,max:4},{key:'maxHp',min:5,max:15}]},
  {id:'watch-armor',name:'Панцирь дозорного',slot:'armor',appearance:'watch-armor',level:1,ranges:[{key:'armor',min:4,max:7},{key:'maxHp',min:8,max:18}]},
  {id:'wanderer-hood',name:'Капюшон странника',slot:'helmet',appearance:'wanderer-hood',level:1,ranges:[{key:'armor',min:1,max:3},{key:'accuracy',min:1,max:2}]},
  {id:'watch-helm',name:'Шлем дозорного',slot:'helmet',appearance:'watch-helm',level:1,ranges:[{key:'armor',min:2,max:4},{key:'maxHp',min:5,max:12}]},
  {id:'wanderer-boots',name:'Сапоги странника',slot:'boots',appearance:'wanderer-boots',level:1,ranges:[{key:'armor',min:1,max:2},{key:'hpRegen',min:.05,max:.15,step:.01}]},
  {id:'watch-boots',name:'Сапоги дозорного',slot:'boots',appearance:'watch-boots',level:1,ranges:[{key:'armor',min:2,max:3},{key:'maxHp',min:4,max:10}]},
  {id:'copper-ring',name:'Медное кольцо рвения',slot:'ring',appearance:'copper-ring',level:1,ranges:[{key:'attack',min:1,max:3},{key:'haste',min:1,max:3}]},
  {id:'ember-amulet',name:'Оберег тлеющего угля',slot:'amulet',appearance:'ember-amulet',level:1,ranges:[{key:'maxHp',min:5,max:15},{key:'maxMana',min:5,max:10}]}
];
export const itemDefinition=(id:unknown)=>typeof id==='string'?WARRIOR_ITEMS.find(item=>item.id===id):undefined;
// Called with server randomness for real loot. The workshop creates labelled,
// disposable samples using the identical range rules; samples cannot enter a hero.
export function rollEquipment(definitionId:string,id:string,random:()=>number):Item{
  const definition=itemDefinition(definitionId);if(!definition)throw new Error('Unknown equipment definition');
  const rolls:ItemRoll[]=definition.ranges.map(range=>{
    const unit=random();if(!Number.isFinite(unit)||unit<0||unit>=1)throw new Error('Random source must return [0, 1)');
    const step=range.step??1,steps=Math.round((range.max-range.min)/step);
    return {...range,value:Math.round((range.min+Math.floor(unit*(steps+1))*step)*1000)/1000};
  });
  return {id,name:definition.name,slot:definition.slot,rarity:1,power:rolls[0].value,classId:'warrior',definitionId,rollVersion:1,itemLevel:definition.level,rolls};
}
export function validateEquipment(item:Item){
  if(item.definitionId===undefined){if(item.rolls!==undefined||item.rollVersion!==undefined)throw new Error('Item rolls need a definition');return;}
  const definition=itemDefinition(item.definitionId);
  if(!definition||item.rollVersion!==1||item.slot!==definition.slot||item.classId!=='warrior'||item.itemLevel!==definition.level||!Array.isArray(item.rolls)||item.rolls.length!==definition.ranges.length)throw new Error('Invalid saved equipment');
  for(let i=0;i<definition.ranges.length;i++){
    const roll=item.rolls[i],range=definition.ranges[i];
    if(!roll||roll.key!==range.key||roll.min!==range.min||roll.max!==range.max||(roll.step??1)!==(range.step??1)||!Number.isFinite(roll.value)||roll.value<roll.min||roll.value>roll.max||Math.abs((roll.value-roll.min)/(range.step??1)-Math.round((roll.value-roll.min)/(range.step??1)))>1e-6)throw new Error('Invalid saved equipment roll');
  }
  if(item.power!==item.rolls[0].value)throw new Error('Invalid equipment primary value');
}
export function equipmentAppearance(source:StatSource):ItemAppearance|undefined{
  if(source.classId!=='warrior')return undefined;
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
