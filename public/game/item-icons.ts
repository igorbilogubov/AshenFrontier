import {EQUIPMENT_ITEMS} from './equipment-items.js';
import type {ClassId,EquipmentSlot,StatKey,Item,WeaponId} from '../../shared/types.js';
// Quiet vector guides are only for empty slots and attribute labels.
const shapes={
  sword:'<path d="m30 5 5 5-15 24-5-4Z"/><path d="m11 27 13 8M16 32l-7 11M5 41l7 5"/>',
  bow:'<path d="M17 5c23 10 23 28 0 38l7-19Z"/><path d="M7 24h32m-5-5 5 5-5 5"/>',
  staff:'<path d="m15 44 12-29m-4 6 9 4"/><path d="m29 3 8 7-7 9-9-7Z"/><path d="m29 3 1 16M21 12l16-2"/>',
  armor:'<path d="m15 8 9 4 9-4 9 9-7 8-4-4 2 22H15l2-22-4 4-7-8Z"/><path d="m15 8 9 13 9-13M24 21v22M16 34h16"/>',
  helmet:'<path d="M12 36V20C12 4 36 4 36 20v16l-9 7-3-11-3 11Z"/><path d="M12 23h9l3 5 3-5h9M24 6v17"/>',
  boots:'<path d="m10 6 12 1-2 25 7 8-2 4H6V32l4-7ZM28 7h11l-1 23 7 8-1 4H31l-4-10Z"/><path d="M10 15h11M28 16h10M8 27l12 3M29 26l10 3"/>',
  ring:'<path d="m19 6 10 0 5 8-10 8-10-8Z"/><path d="m19 6 5 16 5-16M14 14h20"/><path d="M16 19a15 15 0 1 0 16 0M19 23a10 10 0 1 0 10 0"/>',
  amulet:'<path d="M9 5c1 13 8 14 15 20 7-6 14-7 15-20M24 23v5"/><path d="m24 26 11 9-11 11-11-11Z"/><path d="m24 31 5 4-5 6-5-6Z"/>',
  strength:'<path d="m9 27 8-5 5 5 7-11 10 6-2 13-12 7-14-5ZM22 27l-4-13 4-7 8 1 2 7-6 3"/>',
  dexterity:'<circle cx="24" cy="24" r="14"/><circle cx="24" cy="24" r="5"/><path d="M24 4v11m0 18v11M4 24h11m18 0h11"/>',
  vitality:'<path d="M24 42C-4 24 9 3 24 17 39 3 52 24 24 42Z"/><path d="M9 25h9l4-8 5 17 4-9h8"/>',
  energy:'<path d="m24 4 14 22-14 18-14-18Z"/><path d="m24 4 3 19 11 3-14 6-14-6 11-3ZM24 32v12"/>'
};
export function itemIcon(slot:EquipmentSlot|StatKey,classId:ClassId='warrior'){
  const kind=slot==='weapon'?(classId==='mage'?'staff':classId==='archer'?'bow':'sword'):slot;
  return `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true" focusable="false">${shapes[kind]||shapes.amulet}</svg>`;
}
export const heroSilhouette='<svg viewBox="0 0 120 210" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true" focusable="false"><path d="m60 8 13 7 3 18-8 12H52l-8-12 3-18Z M48 46 12 61 8 91l15 14 8-28 5 49-5 20 17 7 12-18 12 18 17-7-5-20 5-49 8 28 15-14-4-30-36-15M48 153l-6 41-10 9v4h22l6-54 6 54h22v-4l-10-9-6-41M38 61l22 12 22-12M60 73v62M36 126h48M47 23l13 4 13-4M55 32h10"/><path d="M20 11h80M11 106h98M20 204h80" stroke-dasharray="2 6" opacity=".5"/></svg>';

// Explicit asset keys: item names, ids and server strings never become HTML/URLs.
const definitionIcons=new Set(EQUIPMENT_ITEMS.map(item=>item.id));
export function itemArtKey(item:Item,ownerClass:ClassId='warrior',weapon:WeaponId='sword'){
  if(item.definitionId&&definitionIcons.has(item.definitionId))return item.definitionId;
  const classId=item.classId??ownerClass;
  if(item.slot==='weapon')return classId==='archer'?'ranger-bow':classId==='mage'?'acolyte-staff':weapon==='axe'?'legacy-axe':'wanderer-blade';
  if(item.slot==='armor')return classId==='archer'?'ranger-armor':classId==='mage'?'acolyte-armor':'watch-armor';
  if(classId==='archer')return {helmet:'ranger-hood',boots:'ranger-boots',ring:'hawk-ring',amulet:'leaf-amulet'}[item.slot];
  if(classId==='mage')return {helmet:'acolyte-hood',boots:'acolyte-boots',ring:'rune-ring',amulet:'moon-amulet'}[item.slot];
  return {helmet:'watch-helm',boots:'watch-boots',ring:'copper-ring',amulet:'ember-amulet'}[item.slot];
}
export function itemArtwork(item:Item,ownerClass:ClassId='warrior',weapon:WeaponId='sword'){
  return `<img class="item-artwork" src="/game/item-icons/${itemArtKey(item,ownerClass,weapon)}.png" width="256" height="256" alt="" draggable="false" decoding="async">`;
}
