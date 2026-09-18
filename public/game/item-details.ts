import type {Item,ItemStatKey} from '../../shared/types.js';
import {ITEM_STAT_LABELS,rollValue,rollRange,rollPosition,rollUnit} from './equipment-items.js';
import {enhanceRollBonus,itemEnhance} from './smith.js';
const format=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0});
const amount=(value:number)=>format.format(Math.round(value));
const legacyKey:Record<string,ItemStatKey|undefined>={weapon:'attack',armor:'armor',helmet:'armor',ring:'attack',amulet:'maxHp'};
const rollBonus=(item:Item|undefined,key:ItemStatKey)=>{
  const index=item?.rolls?.findIndex(roll=>roll.key===key)??-1;
  return index>=0&&item?enhanceRollBonus(item,item.rolls![index],index):0;
};
export function itemStatValue(item:Item|undefined,key:ItemStatKey){
  const roll=item?.rolls?.find(roll=>roll.key===key);
  if(roll)return roll.value+rollBonus(item,key);
  return !item?.definitionId&&legacyKey[item?.slot??'']===key?(item?.power??0)+enhanceRollBonus({enhance:item?.enhance},{key,value:item?.power??0,min:0,max:0},0):0;
}
export function renderItemRolls(container:HTMLElement,item:Item|undefined,equipped?:Item){
  container.replaceChildren();if(!item?.rolls)return;
  const level=itemEnhance(item);
  if(level){
    const mark=document.createElement('p');mark.className='item-enhance-note';
    mark.textContent=`Заточка +${level}`;
    container.append(mark);
  }
  for(const [index,roll] of item.rolls.entries()){
    const row=document.createElement('div');row.className='item-roll';
    const line=document.createElement('div'),label=document.createElement('span'),value=document.createElement('strong');
    const bonus=enhanceRollBonus(item,roll,index);
    const unit=rollUnit(roll.key);
    label.textContent=ITEM_STAT_LABELS[roll.key];
    value.textContent=bonus?`${amount(roll.value+bonus)} (+${amount(bonus)})${unit}`:rollValue(roll);
    line.append(label,value);
    const track=document.createElement('div');track.className='roll-track';const fill=document.createElement('i');fill.style.width=`${rollPosition(roll)*100}%`;track.append(fill);
    const meta=document.createElement('div');meta.className='roll-meta';const range=document.createElement('span');range.textContent=`Диапазон ${rollRange(roll)}`;meta.append(range);
    const note=document.createElement('span');if(roll.value===roll.max){note.className='roll-best';note.textContent='МАКСИМУМ';}meta.append(note);
    row.append(line,track,meta);
    if(equipped&&equipped.id!==item.id){const delta=itemStatValue(item,roll.key)-itemStatValue(equipped,roll.key),comparison=document.createElement('small');comparison.className=delta>0?'roll-gain':delta<0?'roll-loss':'roll-same';comparison.textContent=`${delta>0?'+':''}${amount(delta)}${rollUnit(roll.key)} к надетому предмету`;row.append(comparison);}
    container.append(row);
  }
  if(equipped&&equipped.id!==item.id){
    if(equipped.slot==='boots'&&!equipped.definitionId){const lost=Math.min(18,equipped.power*.5),line=document.createElement('small');line.className='roll-loss';line.textContent='Скорость передвижения: −'+amount(lost)+'% к надетому предмету';container.append(line);}
    const keys=equipped.rolls?.map(roll=>roll.key)??[legacyKey[equipped.slot]].filter((key):key is ItemStatKey=>!!key);
    for(const key of keys)if(!item.rolls.some(roll=>roll.key===key)){const lost=itemStatValue(equipped,key);if(lost){const line=document.createElement('small');line.className='roll-loss';line.textContent=`${ITEM_STAT_LABELS[key]}: −${amount(lost)}${rollUnit(key)} к надетому предмету`;container.append(line);}}
  }
}