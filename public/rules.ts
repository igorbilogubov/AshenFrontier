import {xpNeeded} from './game/progression-curve.js';
import {activeSetBonuses} from './game/equipment-sets.js';
import {itemDefinition,ITEM_STAT_LABELS,rollValue} from './game/equipment-items.js';
import type {Attributes, ClassId, EquipmentSlot, Item, StatSource, CharacterStats} from '../shared/types.js';
// Shared item/class definitions. No renderer-specific units or sprites.
export const EQUIPMENT_SLOTS: Record<EquipmentSlot, {name: string; stat: 'attack' | 'armor' | 'speed' | 'maxHp'; statName: string; symbol: string}>={
  weapon:{name:'Оружие',stat:'attack',statName:'урона',symbol:'⚔'},
  armor:{name:'Доспех',stat:'armor',statName:'брони',symbol:'▣'},
  helmet:{name:'Шлем',stat:'armor',statName:'брони',symbol:'♜'},
  boots:{name:'Сапоги',stat:'speed',statName:'скорости',symbol:'➶'},
  ring:{name:'Кольцо',stat:'attack',statName:'урона',symbol:'○'},
  amulet:{name:'Амулет',stat:'maxHp',statName:'здоровья',symbol:'◇'}
};
export const CLASSES: Record<ClassId, {name: string; color: string; hp: number; hpPerLevel: number; damage: number; range: number; duration: number; special: string; weaponNames: string[]}>={
  warrior:{name:'Воин',color:'#e0b77d',hp:100,hpPerLevel:8,damage:25,range:1.95,duration:.64,special:'Вихрь',weaponNames:['Меч странника','Клинок сумерек','Осколок рассвета']},
  archer:{name:'Лучник',color:'#a9ce91',hp:90,hpPerLevel:7,damage:22,range:6,duration:.72,special:'Меткий выстрел',weaponNames:['Лук следопыта','Лук сумерек','Зов рассвета']},
  mage:{name:'Маг',color:'#c6ace7',hp:85,hpPerLevel:6,damage:28,range:5.5,duration:.88,special:'Огненный шар',weaponNames:['Посох ученика','Посох сумерек','Свет разлома']}
};
export const DEFAULT_BAG_CAPACITY=16;
export const DEFAULT_STASH_CAPACITY=32;
export const MAX_BAG_CAPACITY=40;
export const MAX_STASH_CAPACITY=64;
export const BAG_SLOT_PRICE=100;
export const STASH_SLOT_PRICE=100;
export const BAG_CAPACITY=DEFAULT_BAG_CAPACITY;
export const STASH_CAPACITY=DEFAULT_STASH_CAPACITY;
export const clampBagCapacity=(value:unknown)=>{
  const n=typeof value==='number'&&Number.isSafeInteger(value)?value:DEFAULT_BAG_CAPACITY;
  return Math.min(MAX_BAG_CAPACITY,Math.max(DEFAULT_BAG_CAPACITY,n));
};
export const clampStashCapacity=(value:unknown)=>{
  const n=typeof value==='number'&&Number.isSafeInteger(value)?value:DEFAULT_STASH_CAPACITY;
  return Math.min(MAX_STASH_CAPACITY,Math.max(DEFAULT_STASH_CAPACITY,n));
};
// items owns every instance; equipment references the worn subset. Only loose
// items occupy backpack cells, so equipping never deletes or duplicates an item.
export const backpackItems=(source:Pick<StatSource,'items'|'equipment'> & {stash?:readonly string[]})=>{
  const stashed=new Set(source.stash??[]);
  return (source.items??[]).filter(item=>source.equipment?.[item.slot]!==item.id&&!stashed.has(item.id));
};
const validClass=(id: unknown): ClassId=>id==='warrior'||id==='archer'||id==='mage'?id:'warrior';
export const classFor=(id: unknown)=>CLASSES[validClass(id)];
export const weaponClass=(item: Item | null | undefined)=>item?.classId||'warrior';
export const canEquip=(hero: Pick<StatSource, 'classId'|'level'>,item: Item | null | undefined)=>!!item&&Object.hasOwn(EQUIPMENT_SLOTS,item.slot)&&(item.definitionId?(!!itemDefinition(item.definitionId)&&item.classId===(hero.classId||'warrior')&&(hero.level??1)>=(item.itemLevel??1)):(item.slot!=='weapon'||weaponClass(item)===(hero.classId||'warrior')));
export const itemBonus=(item: Item)=>item.rolls?.map(roll=>`${ITEM_STAT_LABELS[roll.key]} ${rollValue(roll)}`).join(' · ')||`+${item.power} ${EQUIPMENT_SLOTS[item.slot]?.statName||''}`;

// One ruleset drives the authoritative simulation and the allocation preview.
export const STAT_KEYS=Object.freeze(['strength','dexterity','vitality','energy'] as const);
export const STAT_DEFINITIONS=Object.freeze({
  strength:{name:'Сила',description:'Урон оружием. Главная характеристика воина.'},
  dexterity:{name:'Ловкость',description:'Шанс попадания и защита. Главная характеристика лучника.'},
  vitality:{name:'Живучесть',description:'Максимум здоровья и регенерация; в бою восстановление втрое медленнее.'},
  energy:{name:'Энергия',description:'Максимум маны и её восстановление. Главная характеристика мага.'}
});
export const CLASS_PROGRESSION=Object.freeze({
  warrior:{base:{strength:20,dexterity:12,vitality:20,energy:8},damage:{strength:.8,dexterity:.12,vitality:0,energy:0},hpPerVitality:4,mana:40,manaPerLevel:2,manaPerEnergy:4,specialManaCost:12,
    description:'Ближний бой: сильные удары и большой запас здоровья; для точности нужна ловкость.',
    statDescriptions:{strength:'+0,8 урона за очко',dexterity:'+0,12 урона, точность и защита',vitality:'+4 HP и +0,025 HP/с; в бою — треть',energy:'+4 MP и +0,075 MP/с'}},
  archer:{base:{strength:12,dexterity:20,vitality:16,energy:12},damage:{strength:.15,dexterity:.65,vitality:0,energy:0},hpPerVitality:3.5,mana:55,manaPerLevel:3,manaPerEnergy:4,specialManaCost:16,
    description:'Дальний одиночный урон: ловкость усиливает выстрел, точность и защиту; здоровье требует отдельных вложений.',
    statDescriptions:{strength:'+0,15 урона за очко',dexterity:'+0,65 урона, точность и защита',vitality:'+3,5 HP и +0,025 HP/с; в бою — треть',energy:'+4 MP и +0,075 MP/с'}},
  mage:{base:{strength:8,dexterity:14,vitality:14,energy:24},damage:{strength:0,dexterity:0,vitality:0,energy:.95},hpPerVitality:3,mana:75,manaPerLevel:5,manaPerEnergy:5,specialManaCost:24,
    description:'Магия и урон по площади: энергия усиливает заклинания; точность и выживаемость развиваются отдельно.',
    statDescriptions:{strength:'Не усиливает заклинания; для текущей сборки не требуется',dexterity:'Точность заклинаний и защита',vitality:'+3 HP и +0,025 HP/с; в бою — треть',energy:'+0,95 урона, +5 MP и +0,075 MP/с'}}
});
const positive=(value: unknown)=>typeof value==='number'&&Number.isFinite(value)?Math.max(0,value):0;
export const baseAttributes=(classId: unknown): Attributes=>({...CLASS_PROGRESSION[validClass(classId)].base});
// Five immediately spendable points, then five per level. No gameplay level cap.
export const statBudget=(level: unknown)=>Math.min(Number.MAX_SAFE_INTEGER,Math.max(1,Math.floor(positive(level)))*5);
export function normalizedAllocations(points: unknown,level: unknown): Attributes{
  const empty: Attributes={strength:0,dexterity:0,vitality:0,energy:0};
  if(!points||Array.isArray(points)||typeof points!=='object')return empty;
  let sum=0;
  for(const key of STAT_KEYS){
    const amount=(points as Record<string, unknown>)[key]??0;
    if(typeof amount!=='number'||!Number.isSafeInteger(amount)||amount<0)return empty;
    empty[key]=amount;sum+=amount;
  }
  return Number.isSafeInteger(sum)&&sum<=statBudget(level)?empty:{strength:0,dexterity:0,vitality:0,energy:0};
}
export function characterStats(p: StatSource): CharacterStats{
  const classId=validClass(p.classId),c=CLASSES[classId],progression=CLASS_PROGRESSION[classId];
  const level=Math.max(1,Math.floor(positive(p.level))),allocatedStats=normalizedAllocations(p.allocatedStats,level);
  const attributes=baseAttributes(classId);for(const key of STAT_KEYS)attributes[key]+=allocatedStats[key];
  const s: CharacterStats={attributes,allocatedStats,unspentPoints:statBudget(level)-STAT_KEYS.reduce((sum,key)=>sum+allocatedStats[key],0),statRevision:typeof p.statRevision==='number'&&Number.isSafeInteger(p.statRevision)&&p.statRevision>=0?p.statRevision:0,
    maxHp:c.hp+(level-1)*c.hpPerLevel+allocatedStats.vitality*progression.hpPerVitality,
    maxMana:progression.mana+(level-1)*progression.manaPerLevel+allocatedStats.energy*progression.manaPerEnergy,
    hpRegen:.15+attributes.vitality*.025,manaRegen:.5+attributes.energy*.075,
    attack:c.damage+(level-1)*2+STAT_KEYS.reduce((sum,key)=>sum+allocatedStats[key]*progression.damage[key],0),
    // Dexterity already grants the archer damage and accuracy. Its armor bonus
    // approaches 21, so investing in damage cannot replace defensive equipment.
    armor:attributes.dexterity*.35/(1+attributes.dexterity/60),hitChance:Math.min(.95,.72+.23*attributes.dexterity/(attributes.dexterity+18)),
    attackSpeed:0,speedScale:1,range:c.range,xpNeeded:xpNeeded(level),specialManaCost:progression.specialManaCost,damageReduction:0,attackPower:0};
  for(const [slot,definition] of Object.entries(EQUIPMENT_SLOTS) as [EquipmentSlot, (typeof EQUIPMENT_SLOTS)[EquipmentSlot]][]){
    const item=p.items?.find(i=>i.id===p.equipment?.[slot]&&i.slot===slot&&canEquip(p,i));
    if(!item)continue;
    if(item.definitionId&&item.rolls){for(const roll of item.rolls){const value=positive(roll.value);if(roll.key==='haste')s.attackSpeed+=value/100;else if(roll.key==='accuracy')s.hitChance+=value/100;else s[roll.key]+=value;}continue;}
    const power=positive(item.power);
    if(slot==='boots')s.speedScale=1+Math.min(.18,power*.005);else if(definition.stat!=='speed')s[definition.stat]+=power;
  }
  for(const bonus of activeSetBonuses(p)){if(bonus.key==='haste')s.attackSpeed+=bonus.value/100;else if(bonus.key==='accuracy')s.hitChance+=bonus.value/100;else s[bonus.key]+=bonus.value;}
  s.attackSpeed=Math.min(.3,s.attackSpeed);s.hitChance=Math.min(.95,s.hitChance);
  s.damageReduction=Math.min(.65,s.armor/(s.armor+70));s.attackPower=s.attack;
  return s;
}
