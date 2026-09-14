// Shared item/class definitions. No renderer-specific units or sprites.
export const EQUIPMENT_SLOTS={
  weapon:{name:'Оружие',stat:'attack',statName:'урона',symbol:'⚔'},
  armor:{name:'Доспех',stat:'armor',statName:'брони',symbol:'▣'},
  helmet:{name:'Шлем',stat:'armor',statName:'брони',symbol:'♜'},
  boots:{name:'Сапоги',stat:'speed',statName:'скорости',symbol:'➶'},
  ring:{name:'Кольцо',stat:'attack',statName:'урона',symbol:'○'},
  amulet:{name:'Амулет',stat:'maxHp',statName:'здоровья',symbol:'◇'}
};
export const CLASSES={
  warrior:{name:'Воин',color:'#e0b77d',hp:100,hpPerLevel:8,damage:25,range:1.95,duration:.64,special:'Вихрь',weaponNames:['Меч странника','Клинок сумерек','Осколок рассвета']},
  archer:{name:'Лучник',color:'#a9ce91',hp:90,hpPerLevel:7,damage:22,range:6,duration:.72,special:'Меткий выстрел',weaponNames:['Лук следопыта','Лук сумерек','Зов рассвета']},
  mage:{name:'Маг',color:'#c6ace7',hp:85,hpPerLevel:6,damage:28,range:5.5,duration:.88,special:'Огненный шар',weaponNames:['Посох ученика','Посох сумерек','Свет разлома']}
};
export const BAG_CAPACITY=16;
export const classFor=id=>CLASSES[Object.hasOwn(CLASSES,id)?id:'warrior'];
export const weaponClass=item=>item?.classId||'warrior';
export const canEquip=(hero,item)=>!!item&&Object.hasOwn(EQUIPMENT_SLOTS,item.slot)&&(item.slot!=='weapon'||weaponClass(item)===(hero.classId||'warrior'));
export const itemBonus=item=>`+${item.power} ${EQUIPMENT_SLOTS[item.slot]?.statName||''}`;

// One ruleset drives the authoritative simulation and the allocation preview.
export const STAT_KEYS=Object.freeze(['strength','dexterity','vitality','energy']);
export const STAT_DEFINITIONS=Object.freeze({
  strength:{name:'Сила',description:'Урон оружием. Главная характеристика воина.'},
  dexterity:{name:'Ловкость',description:'Шанс попадания и защита. Главная характеристика лучника.'},
  vitality:{name:'Живучесть',description:'Максимум здоровья и восстановление вне боя.'},
  energy:{name:'Энергия',description:'Максимум маны и её восстановление. Главная характеристика мага.'}
});
export const CLASS_PROGRESSION=Object.freeze({
  warrior:{base:{strength:20,dexterity:12,vitality:20,energy:8},damage:{strength:.8,dexterity:.12,vitality:0,energy:0},hpPerVitality:4,mana:40,manaPerLevel:2,manaPerEnergy:4,specialManaCost:12,
    description:'Ближний бой: сильные удары и большой запас здоровья; для точности нужна ловкость.',
    statDescriptions:{strength:'+0,8 урона за очко',dexterity:'+0,12 урона, точность и защита',vitality:'+4 HP и +0,025 HP/с вне боя',energy:'+4 MP и +0,075 MP/с'}},
  archer:{base:{strength:12,dexterity:20,vitality:16,energy:12},damage:{strength:.15,dexterity:.65,vitality:0,energy:0},hpPerVitality:3.5,mana:55,manaPerLevel:3,manaPerEnergy:4,specialManaCost:16,
    description:'Дальний одиночный урон: ловкость усиливает выстрел, точность и защиту; здоровье требует отдельных вложений.',
    statDescriptions:{strength:'+0,15 урона за очко',dexterity:'+0,65 урона, точность и защита',vitality:'+3,5 HP и +0,025 HP/с вне боя',energy:'+4 MP и +0,075 MP/с'}},
  mage:{base:{strength:8,dexterity:14,vitality:14,energy:24},damage:{strength:0,dexterity:0,vitality:0,energy:.95},hpPerVitality:3,mana:75,manaPerLevel:5,manaPerEnergy:5,specialManaCost:24,
    description:'Магия и урон по площади: энергия усиливает заклинания; точность и выживаемость развиваются отдельно.',
    statDescriptions:{strength:'Не усиливает заклинания; для текущей сборки не требуется',dexterity:'Точность заклинаний и защита',vitality:'+3 HP и +0,025 HP/с вне боя',energy:'+0,95 урона, +5 MP и +0,075 MP/с'}}
});
const validClass=id=>Object.hasOwn(CLASSES,id)?id:'warrior';
const positive=value=>Number.isFinite(value)?Math.max(0,value):0;
export const baseAttributes=classId=>({...CLASS_PROGRESSION[validClass(classId)].base});
// Five immediately spendable points, then five per level. No gameplay level cap.
export const statBudget=level=>Math.min(Number.MAX_SAFE_INTEGER,Math.max(1,Math.floor(positive(level)))*5);
export function normalizedAllocations(points,level){
  const empty=Object.fromEntries(STAT_KEYS.map(key=>[key,0]));
  if(!points||Array.isArray(points)||typeof points!=='object')return empty;
  let sum=0;
  for(const key of STAT_KEYS){
    const amount=points[key]??0;
    if(!Number.isSafeInteger(amount)||amount<0)return empty;
    empty[key]=amount;sum+=amount;
  }
  return Number.isSafeInteger(sum)&&sum<=statBudget(level)?empty:Object.fromEntries(STAT_KEYS.map(key=>[key,0]));
}
export function characterStats(p){
  const classId=validClass(p.classId),c=CLASSES[classId],progression=CLASS_PROGRESSION[classId];
  const level=Math.max(1,Math.floor(positive(p.level))),allocatedStats=normalizedAllocations(p.allocatedStats,level);
  const attributes=baseAttributes(classId);for(const key of STAT_KEYS)attributes[key]+=allocatedStats[key];
  const s={attributes,allocatedStats,unspentPoints:statBudget(level)-STAT_KEYS.reduce((sum,key)=>sum+allocatedStats[key],0),statRevision:Number.isSafeInteger(p.statRevision)&&p.statRevision>=0?p.statRevision:0,
    maxHp:c.hp+(level-1)*c.hpPerLevel+allocatedStats.vitality*progression.hpPerVitality,
    maxMana:progression.mana+(level-1)*progression.manaPerLevel+allocatedStats.energy*progression.manaPerEnergy,
    hpRegen:.15+attributes.vitality*.025,manaRegen:.5+attributes.energy*.075,
    attack:c.damage+(level-1)*2+STAT_KEYS.reduce((sum,key)=>sum+allocatedStats[key]*progression.damage[key],0),
    // Dexterity already grants the archer damage and accuracy. Its armor bonus
    // approaches 21, so investing in damage cannot replace defensive equipment.
    armor:attributes.dexterity*.35/(1+attributes.dexterity/60),hitChance:Math.min(.95,.72+.23*attributes.dexterity/(attributes.dexterity+18)),
    speedScale:1,range:c.range,xpNeeded:level*65,specialManaCost:progression.specialManaCost};
  for(const [slot,definition] of Object.entries(EQUIPMENT_SLOTS)){
    const item=p.items?.find(i=>i.id===p.equipment?.[slot]&&i.slot===slot&&canEquip(p,i));
    if(!item)continue;const power=positive(item.power);
    if(slot==='boots')s.speedScale=1+Math.min(.18,power*.005);else s[definition.stat]+=power;
  }
  s.damageReduction=Math.min(.65,s.armor/(s.armor+70));s.attackPower=s.attack;
  return s;
}
