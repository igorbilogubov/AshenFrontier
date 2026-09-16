import * as T from './vendor/three.module.js';
import {mobConfig} from './location.js';
import {possibleLoot} from './possible-loot.js';
import type {MobType} from '../../shared/types.js';

export type PresentedTarget =
  | {kind:'mob';type:MobType;eliteId?:string;x:number;z:number;hp:number;maxHp:number;name:string}
  | {kind:'vendor'|'player';id:string;name:string;x:number;z:number;hp?:number;maxHp?:number;subtitle?:string};

const ICONS={
  gold:'<circle cx="17" cy="17" r="11"/><path d="M17 9v16m-5-13h7a3 3 0 0 1 0 6h-5a3 3 0 0 0 0 6h8"/>',
  weapon:'<path d="M26 5l5 5-15 16-5-5zM10 22l8 8M7 31l5-5 7 7-5 5z"/>',
  armor:'<path d="M11 6l6 4 6-4 8 7-5 7-2-2v14H10V18l-2 2-5-7zM17 10v22M17 10l-7 7m7-7 7 7"/>',
  accessory:'<path d="M13 7h8l4 6-8 8-8-8zM13 7l4 14 4-14M10 21a12 12 0 1 0 14 0M12 25a8 8 0 1 0 10 0"/>'
} as const;
const RARITY_NAMES=['Обычный','Необычный','Редкий'];

/** Owns the existing central target panel and one lightweight world selection ring. */
export function bindTargetPresentation(scene:T.Scene):(target:PresentedTarget|null)=>void{
  const panel=document.getElementById('target-panel'),name=document.getElementById('target-name'),health=document.getElementById('target-health'),fill=document.getElementById('target-fill');
  const bar=panel?.querySelector<HTMLElement>('.bar');
  if(!panel||!name||!health||!fill||!bar)throw new Error('Target presentation requires the existing target-panel/name/health/fill markup');
  const loot=document.createElement('div');loot.className='target-loot';loot.hidden=true;
  const row=document.createElement('div');row.className='target-loot-row';loot.append(row);panel.append(loot);
  const geometry=new T.RingGeometry(.88,1,48),material=new T.MeshBasicMaterial({color:'#d7a469',transparent:true,opacity:.8,side:T.DoubleSide,depthWrite:false});
  const ring=new T.Mesh(geometry,material);ring.rotation.x=-Math.PI/2;ring.position.y=.08;ring.renderOrder=4;ring.visible=false;ring.castShadow=false;ring.userData.dynamic=true;scene.add(ring);
  let shownLootType:string|null=null;
  function showLoot(type:MobType,eliteId?:string){
    loot.hidden=false;
    const key=type+':'+(eliteId||'');if(shownLootType===key)return;
    shownLootType=key;
    const available=possibleLoot(type,eliteId);
    row.replaceChildren();
    for(const category of available.categories){
      const badge=document.createElement('div');badge.className=`target-loot-category ${category.rarity==='gold'?'gold':`rarity-${category.rarity}`}`;
      const rarity=category.rarity==='gold'?'Гарантированная личная стопка':RARITY_NAMES[category.rarity]??`Редкость ${category.rarity}`;
      badge.setAttribute('role','img');badge.setAttribute('aria-label',`${category.name}: ${rarity}${category.id==='gold'?`, ${available.gold} золота после убийства`:`, общий шанс вещи${category.chance===undefined?'':' этой редкости'} ${Math.round((category.chance??available.itemChance)*100)}%, категория случайна`}`);
      badge.title=badge.getAttribute('aria-label')??'';
      const symbol=document.createElement('span');symbol.className='target-loot-symbol';symbol.innerHTML=`<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${ICONS[category.id]}</svg>`;
      badge.append(symbol);row.append(badge);
    }
  }
  return (target)=>{
    if(!target||(target.kind==='mob'&&target.hp<=0)){
      panel.hidden=true;ring.visible=false;shownLootType=null;loot.hidden=true;return;
    }
    panel.hidden=false;name.textContent=target.name;panel.classList.toggle('elite-target',target.kind==='mob'&&!!target.eliteId);
    const withHealth=typeof target.hp==='number'&&typeof target.maxHp==='number'&&Number.isFinite(target.hp)&&Number.isFinite(target.maxHp)&&target.maxHp>0;
    bar.hidden=!withHealth;
    if(withHealth){
      health.textContent=`${Math.round(target.hp!)} / ${Math.round(target.maxHp!)}`;
      fill.style.transform=`scaleX(${Math.max(0,Math.min(1,target.hp!/target.maxHp!))})`;
    }else{health.textContent=target.kind==='mob'?'Цель':target.kind==='vendor'?target.subtitle??'Торговец':target.subtitle??'Игрок';}
    if(target.kind==='mob')showLoot(target.type,target.eliteId);else{loot.hidden=true;shownLootType=null;}
    const validPosition=Number.isFinite(target.x)&&Number.isFinite(target.z);
    ring.visible=validPosition;
    if(validPosition){
      ring.position.set(target.x,.08,target.z);
      const radius=target.kind==='mob'?mobConfig(target).radius+.28:target.kind==='vendor'?.62:.52;
      ring.scale.setScalar(radius);
      material.color.set(target.kind==='mob'?'#d7a469':target.kind==='vendor'?'#e5bf76':'#89bbce');
    }
  };
}
