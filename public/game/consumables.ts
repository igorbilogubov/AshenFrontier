/** Server and vendor share these economy rules; consumables are counters, not gear. */
export type ConsumableKind='hp'|'mana';
export const CONSUMABLE_LIMIT=50;
export const CONSUMABLES=Object.freeze({
  hp:Object.freeze({kind:'hp',name:'Зелье здоровья',price:6,restore:45,cooldown:4}),
  mana:Object.freeze({kind:'mana',name:'Зелье маны',price:8,restore:40,cooldown:4})
});
export const consumable=(kind:unknown)=>kind==='hp'||kind==='mana'?CONSUMABLES[kind]:undefined;
