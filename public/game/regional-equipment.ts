import type {ClassId,EquipmentSlot,ItemStatKey} from '../../shared/types.js';
import type {ItemDefinition} from './equipment-items.js';

/** Versioned region collections. Never change these ranges for already rolled items. */
export type GearRegion='forest'|'snow'|'wasteland';
export const REGIONAL_COLLECTIONS={
  snow:{level:10,warrior:['frostguard','Морозный страж','морозного стража'],archer:['snowhunter','Снежный охотник','снежного охотника'],mage:['winterweaver','Зимний заклинатель','зимнего заклинателя']},
  wasteland:{level:25,warrior:['obsidian','Обсидиановый рыцарь','обсидианового рыцаря'],archer:['ashranger','Пепельный следопыт','пепельного следопыта'],mage:['ashseer','Пепельный провидец','пепельного провидца']}
} as const;
export const REGIONAL_BASE_APPEARANCES:Record<ClassId,Record<EquipmentSlot,string>>={
  warrior:{weapon:'watch-sword',armor:'watch-armor',helmet:'watch-helm',boots:'watch-boots',ring:'copper-ring',amulet:'ember-amulet'},
  archer:{weapon:'sentinel-bow',armor:'sentinel-armor',helmet:'sentinel-hood',boots:'sentinel-boots',ring:'hawk-ring',amulet:'leaf-amulet'},
  mage:{weapon:'runekeeper-staff',armor:'runekeeper-armor',helmet:'runekeeper-crown',boots:'runekeeper-boots',ring:'rune-ring',amulet:'moon-amulet'}
};
const range=(key:ItemStatKey,min:number,max:number,step?:number)=>({key,min,max,...(step?{step}:{})});
const classes=['warrior','archer','mage'] as const,slots=['weapon','armor','helmet','boots','ring','amulet'] as const;
function collection(region:'snow'|'wasteland',classId:ClassId):ItemDefinition[]{
  const config=REGIONAL_COLLECTIONS[region],prefix=config[classId][0],suffix=config[classId][2],snow=region==='snow',mage=classId==='mage';
  const names={weapon:classId==='warrior'?'Клинок':classId==='archer'?'Лук':'Посох',armor:mage?'Мантия':'Доспех',helmet:mage?'Венец':classId==='archer'?'Капюшон':'Шлем',boots:'Сапоги',ring:'Кольцо',amulet:'Оберег'};
  const ranges:Record<EquipmentSlot,ItemDefinition['ranges']>={
    weapon:[range('attack',snow?16:30,snow?24:44),range('haste',2,5)],
    armor:[range('armor',snow?8:14,snow?12:21),range(mage?'maxMana':'maxHp',snow?20:42,snow?35:66)],
    helmet:[range('armor',snow?4:7,snow?7:12),range('accuracy',snow?2:3,snow?4:5)],
    boots:[range('armor',snow?3:6,snow?5:9),range('maxHp',snow?12:25,snow?22:40)],
    ring:[range('attack',snow?3:6,snow?6:10),range('haste',1,3)],
    amulet:[range('maxHp',snow?14:28,snow?26:45),range('maxMana',snow?12:24,snow?22:38),range('manaRegen',snow?.12:.2,snow?.22:.35,.01)]
  };
  return slots.map(slot=>({id:`${prefix}-${slot}-v1`,classId,slot,appearance:`${prefix}-${slot}`,name:`${names[slot]} ${suffix}`,level:config.level,ranges:ranges[slot]}));
}
export const REGIONAL_ITEMS:Record<'snow'|'wasteland',Record<ClassId,readonly ItemDefinition[]>>={
  snow:Object.fromEntries(classes.map(c=>[c,collection('snow',c)])) as Record<ClassId,ItemDefinition[]>,
  wasteland:Object.fromEntries(classes.map(c=>[c,collection('wasteland',c)])) as Record<ClassId,ItemDefinition[]>
};
export function regionalAppearance(appearance:unknown):{region:'snow'|'wasteland';classId:ClassId;slot:EquipmentSlot;base:string}|undefined{
  for(const region of ['snow','wasteland'] as const)for(const classId of classes){
    const item=REGIONAL_ITEMS[region][classId].find(item=>item.appearance===appearance);
    if(item)return {region,classId,slot:item.slot,base:REGIONAL_BASE_APPEARANCES[classId][item.slot]};
  }
}
