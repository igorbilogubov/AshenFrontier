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
