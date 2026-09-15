import type {ClassId,EquipmentSlot,Item} from '../../shared/types.js';
import {CLASS_ITEMS} from './equipment-items.js';

export const SHOP=Object.freeze({id:'camp-vendor',name:'Торговец',x:2,z:-2,range:2.4});
export interface ShopListing {definitionId:string;name:string;classId:ClassId;slot:EquipmentSlot;price:number}
const PRICES:Readonly<Record<EquipmentSlot,number>>=Object.freeze({weapon:40,armor:35,helmet:25,boots:20,ring:30,amulet:30});
const basics=Object.values(CLASS_ITEMS).flatMap(items=>{
  const seen=new Set<EquipmentSlot>();
  return items.filter(item=>{if(seen.has(item.slot))return false;seen.add(item.slot);return true;});
});
const listings:readonly ShopListing[]=Object.freeze(basics.map(item=>Object.freeze({definitionId:item.id,name:item.name,classId:item.classId,slot:item.slot,price:PRICES[item.slot]})));
export const shopItems=()=>listings;
export const shopPrice=(definitionId:unknown)=>typeof definitionId==='string'?listings.find(item=>item.definitionId===definitionId)?.price:undefined;
export function sellPrice(item:Item){
  const power=Number.isFinite(item.power)?Math.max(0,item.power):0;
  const base=Math.max(1,Math.min(1000,Math.round(power*3+5)));
  const purchase=shopPrice(item.definitionId);
  return purchase===undefined?base:Math.min(base,Math.max(1,Math.floor(purchase/2)));
}
