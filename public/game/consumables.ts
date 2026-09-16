import type {ConsumableStack,QuickSlots,QuickSlot,Item,Equipment} from '../../shared/types.js';
import {backpackItems} from '../rules.js';

export type ConsumableKind='hp'|'mana';
export interface ConsumableDefinition {id:string;kind:ConsumableKind;name:string;price:number;restore:number;cooldown:number;stackLimit:number}
export const CONSUMABLE_STACK_LIMIT=999;
export const CONSUMABLE_LIMIT=CONSUMABLE_STACK_LIMIT*4;
export const CONSUMABLES=Object.freeze({
  hp:Object.freeze({id:'hp-basic',kind:'hp',name:'Зелье здоровья',price:6,restore:45,cooldown:4,stackLimit:CONSUMABLE_STACK_LIMIT}),
  mana:Object.freeze({id:'mana-basic',kind:'mana',name:'Зелье маны',price:8,restore:40,cooldown:4,stackLimit:CONSUMABLE_STACK_LIMIT})
} satisfies Record<ConsumableKind,ConsumableDefinition>);
const additionalConsumables:ConsumableDefinition[]=[
  {id:'hp-medium',kind:'hp',name:'Среднее зелье здоровья',price:24,restore:180,cooldown:4,stackLimit:CONSUMABLE_STACK_LIMIT},
  {id:'hp-large',kind:'hp',name:'Большое зелье здоровья',price:80,restore:600,cooldown:4,stackLimit:CONSUMABLE_STACK_LIMIT},
  {id:'hp-greater',kind:'hp',name:'Великое зелье здоровья',price:240,restore:1800,cooldown:4,stackLimit:CONSUMABLE_STACK_LIMIT},
  {id:'mana-medium',kind:'mana',name:'Среднее зелье маны',price:32,restore:160,cooldown:4,stackLimit:CONSUMABLE_STACK_LIMIT},
  {id:'mana-large',kind:'mana',name:'Большое зелье маны',price:100,restore:500,cooldown:4,stackLimit:CONSUMABLE_STACK_LIMIT},
  {id:'mana-greater',kind:'mana',name:'Великое зелье маны',price:300,restore:1500,cooldown:4,stackLimit:CONSUMABLE_STACK_LIMIT}
];
const catalogDefinitions=[CONSUMABLES.hp,...additionalConsumables.filter(def=>def.kind==='hp'),CONSUMABLES.mana,...additionalConsumables.filter(def=>def.kind==='mana')];
export const CONSUMABLE_CATALOG:Readonly<Record<string,ConsumableDefinition>>=Object.freeze(Object.fromEntries(catalogDefinitions.map(def=>[def.id,Object.freeze(def)])));
export const consumable=(kind:unknown)=>kind==='hp'||kind==='mana'?CONSUMABLES[kind]:undefined;
export const consumableDefinition=(id:unknown)=>typeof id==='string'&&Object.hasOwn(CONSUMABLE_CATALOG,id)?CONSUMABLE_CATALOG[id]:undefined;
export const isQuickSlot=(slot:unknown):slot is QuickSlot=>slot==='q'||slot==='w';
type ConsumableSource={consumableInventory?:ConsumableStack[];quickSlots?:QuickSlots};
export const consumableQuantity=(hero:ConsumableSource,definitionId:string)=>(hero.consumableInventory??[]).filter(stack=>stack.definitionId===definitionId).reduce((sum,stack)=>sum+stack.quantity,0);
export const consumableKindQuantity=(hero:ConsumableSource,kind:ConsumableKind)=>(hero.consumableInventory??[]).filter(stack=>consumableDefinition(stack.definitionId)?.kind===kind).reduce((sum,stack)=>sum+stack.quantity,0);
export const assignedConsumable=(hero:ConsumableSource,slot:QuickSlot)=>consumableDefinition(hero.quickSlots?.[slot]);
/** Bottles share a backpack cell by definition, alongside loose equipment. */
export const backpackUsage=(hero:ConsumableSource&{items?:Item[];equipment?:Equipment;stash?:string[]})=>backpackItems(hero).length+(hero.consumableInventory??[]).filter(stack=>stack.quantity>0).length;

export function validateConsumables(inventory:unknown,slots:unknown):asserts inventory is ConsumableStack[]{
  if(!Array.isArray(inventory)||!slots||typeof slots!=='object'||Array.isArray(slots))throw new Error('Invalid consumable inventory');
  const ids=new Set<string>(),definitions=new Set<string>();
  for(const stack of inventory){
    if(!stack||typeof stack!=='object')throw new Error('Invalid consumable stack');
    const def=consumableDefinition(stack.definitionId);
    if(!def||typeof stack.id!=='string'||!stack.id.length||stack.id.length>128||ids.has(stack.id)||definitions.has(def.id)||!Number.isSafeInteger(stack.quantity)||stack.quantity<=0||stack.quantity>def.stackLimit)throw new Error('Invalid consumable stack');
    ids.add(stack.id);definitions.add(def.id);
  }
  for(const kind of ['hp','mana'] as const)if(consumableKindQuantity({consumableInventory:inventory},kind)>CONSUMABLE_LIMIT)throw new Error('Consumable capacity exceeded');
  const quick=slots as Record<string,unknown>;
  if(Object.keys(quick).length!==2||!['q','w'].every(key=>Object.hasOwn(quick,key)&&(quick[key]===null||!!consumableDefinition(quick[key]))))throw new Error('Invalid consumable quick slots');
}
