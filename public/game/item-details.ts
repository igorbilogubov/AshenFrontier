import type {Item,ItemStatKey} from '../../shared/types.js';
import {ITEM_STAT_LABELS,rollValue,rollRange,rollPosition,rollUnit} from './equipment-items.js';
const format=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});
const legacyKey:Record<string,ItemStatKey|undefined>={weapon:'attack',armor:'armor',helmet:'armor',ring:'attack',amulet:'maxHp'};
export function itemStatValue(item:Item|undefined,key:ItemStatKey){return item?.rolls?.find(roll=>roll.key===key)?.value??(!item?.definitionId&&legacyKey[item?.slot??'']===key?item?.power??0:0);}
export function renderItemRolls(container:HTMLElement,item:Item|undefined,equipped?:Item){
  container.replaceChildren();if(!item?.rolls)return;
  for(const roll of item.rolls){
    const row=document.createElement('div');row.className='item-roll';
    const line=document.createElement('div'),label=document.createElement('span'),value=document.createElement('strong');
    label.textContent=ITEM_STAT_LABELS[roll.key];value.textContent=rollValue(roll);line.append(label,value);
    const track=document.createElement('div');track.className='roll-track';const fill=document.createElement('i');fill.style.width=`${rollPosition(roll)*100}%`;track.append(fill);
    const meta=document.createElement('div');meta.className='roll-meta';const range=document.createElement('span');range.textContent=`Диапазон ${rollRange(roll)}`;meta.append(range);
    const note=document.createElement('span');if(roll.value===roll.max){note.className='roll-best';note.textContent='МАКСИМУМ';}meta.append(note);
    row.append(line,track,meta);
    if(equipped&&equipped.id!==item.id){const delta=roll.value-itemStatValue(equipped,roll.key),comparison=document.createElement('small');comparison.className=delta>0?'roll-gain':delta<0?'roll-loss':'roll-same';comparison.textContent=`${delta>0?'+':''}${format.format(delta)}${rollUnit(roll.key)} к надетому предмету`;row.append(comparison);}
    container.append(row);
  }
  // Also expose bonuses that disappear when the selected item lacks their key.
  if(equipped&&equipped.id!==item.id){
    if(equipped.slot==='boots'&&!equipped.definitionId){const lost=Math.min(18,equipped.power*.5),line=document.createElement('small');line.className='roll-loss';line.textContent='Скорость передвижения: −'+format.format(lost)+'% к надетому предмету';container.append(line);}
    const keys=equipped.rolls?.map(roll=>roll.key)??[legacyKey[equipped.slot]].filter((key):key is ItemStatKey=>!!key);
    for(const key of keys)if(!item.rolls.some(roll=>roll.key===key)){const lost=itemStatValue(equipped,key);if(lost){const line=document.createElement('small');line.className='roll-loss';line.textContent=`${ITEM_STAT_LABELS[key]}: −${format.format(lost)}${rollUnit(key)} к надетому предмету`;container.append(line);}}
  }
}
