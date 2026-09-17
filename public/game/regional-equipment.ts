import type {ClassId,EquipmentSlot,ItemStatKey} from '../../shared/types.js';
import type {ItemDefinition} from './equipment-items.js';

/** Versioned region collections. Never change these ranges for already rolled items. */
export type GearRegion='forest'|'snow'|'wasteland'|'swamp'|'mines'|'rift'|'citadel';
export const REGIONAL_COLLECTIONS={
  snow:{level:10,warrior:['frostguard','Морозный страж','морозного стража'],archer:['snowhunter','Снежный охотник','снежного охотника'],mage:['winterweaver','Зимний заклинатель','зимнего заклинателя']},
  wasteland:{level:25,warrior:['obsidian','Обсидиановый рыцарь','обсидианового рыцаря'],archer:['ashranger','Пепельный следопыт','пепельного следопыта'],mage:['ashseer','Пепельный провидец','пепельного провидца']}
,
  swamp:{level:40,warrior:['bogwarden','Страж топи','стража топи'],archer:['reedstalker','Тростниковый ловчий','тростникового ловчего'],mage:['mireoracle','Оракул трясины','оракула трясины']},
  mines:{level:55,warrior:['ironbound','Железный бастион','железного бастиона'],archer:['deepdelver','Глубинный разведчик','глубинного разведчика'],mage:['crystalweaver','Кристальный чародей','кристального чародея']},
  rift:{level:70,warrior:['riftbreaker','Рассекатель разлома','рассекателя разлома'],archer:['emberhawk','Пламенный сокол','пламенного сокола'],mage:['voidcaller','Заклинатель пустоты','заклинателя пустоты']},
  citadel:{level:85,warrior:['dreadsovereign','Владыка бастиона','владыки бастиона'],archer:['nightsovereign','Владыка ночи','владыки ночи'],mage:['astralsovereign','Владыка созвездий','владыки созвездий']}
} as const;
export type CollectionRegion=Exclude<GearRegion,'forest'>;
export const GEAR_REGIONS:readonly GearRegion[]=['forest','snow','wasteland','swamp','mines','rift','citadel'];
export const REGIONAL_BASE_APPEARANCES:Record<ClassId,Record<EquipmentSlot,string>>={
  warrior:{weapon:'watch-sword',armor:'watch-armor',helmet:'watch-helm',boots:'watch-boots',ring:'copper-ring',amulet:'ember-amulet'},
  archer:{weapon:'sentinel-bow',armor:'sentinel-armor',helmet:'sentinel-hood',boots:'sentinel-boots',ring:'hawk-ring',amulet:'leaf-amulet'},
  mage:{weapon:'runekeeper-staff',armor:'runekeeper-armor',helmet:'runekeeper-crown',boots:'runekeeper-boots',ring:'rune-ring',amulet:'moon-amulet'}
};
const range=(key:ItemStatKey,min:number,max:number,step?:number)=>({key,min:Math.round(min*1000)/1000,max:Math.round(max*1000)/1000,...(step?{step}:{})});
const classes=['warrior','archer','mage'] as const,slots=['weapon','armor','helmet','boots','ring','amulet'] as const;
function collection(region:CollectionRegion,classId:ClassId):ItemDefinition[]{
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
  if(region!=='snow'&&region!=='wasteland'){
    const budgets={swamp:{attack:[55,78],armor:[24,34],helmet:[12,18],boots:[10,15],hp:[75,110],ring:[12,18]},mines:{attack:[85,120],armor:[36,48],helmet:[18,26],boots:[15,21],hp:[115,170],ring:[20,28]},rift:{attack:[125,170],armor:[50,66],helmet:[26,36],boots:[22,30],hp:[170,240],ring:[30,42]},citadel:{attack:[175,230],armor:[68,88],helmet:[36,48],boots:[30,40],hp:[235,320],ring:[45,60]}} as const;
    const b=budgets[region],index=['swamp','mines','rift','citadel'].indexOf(region);
    ranges.weapon=[range('attack',b.attack[0],b.attack[1]),range('haste',2,5)];
    ranges.armor=[range('armor',b.armor[0],b.armor[1]),range(mage?'maxMana':'maxHp',b.hp[0],b.hp[1])];
    ranges.helmet=[range('armor',b.helmet[0],b.helmet[1]),range('accuracy',3,5)];
    ranges.boots=[range('armor',b.boots[0],b.boots[1]),range('maxHp',Math.round(b.hp[0]*.6),Math.round(b.hp[1]*.6))];
    ranges.ring=[range('attack',b.ring[0],b.ring[1]),range('haste',1,3)];
    ranges.amulet=[range('maxHp',Math.round(b.hp[0]*.7),Math.round(b.hp[1]*.7)),range('maxMana',Math.round(b.hp[0]*.6),Math.round(b.hp[1]*.6)),range('manaRegen',.3+index*.1,.45+index*.1,.01)];
  }
  return slots.map(slot=>({id:`${prefix}-${slot}-v1`,classId,slot,appearance:`${prefix}-${slot}`,name:`${names[slot]} ${suffix}`,level:config.level,ranges:ranges[slot].slice(0, 2)}));
}
export const REGIONAL_ITEMS=Object.fromEntries((Object.keys(REGIONAL_COLLECTIONS) as CollectionRegion[]).map(region=>[region,Object.fromEntries(classes.map(classId=>[classId,collection(region,classId)]))])) as unknown as Record<CollectionRegion,Record<ClassId,readonly ItemDefinition[]>>;
export function regionalAppearance(appearance:unknown):{region:CollectionRegion;classId:ClassId;slot:EquipmentSlot;base:string}|undefined{
  for(const region of Object.keys(REGIONAL_COLLECTIONS) as CollectionRegion[])for(const classId of classes){
    const item=REGIONAL_ITEMS[region][classId].find(item=>item.appearance===appearance);
    if(item)return {region,classId,slot:item.slot,base:REGIONAL_BASE_APPEARANCES[classId][item.slot]};
  }
}
