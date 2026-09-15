import type {Item,ClassId,EquipmentSlot,WorldEvent,ClientCommand} from '../../shared/types.js';
import type {NetworkGame} from './network.js';
import {BAG_CAPACITY,backpackItems,canEquip,CLASSES,EQUIPMENT_SLOTS,itemBonus} from '../rules.js';
import {safe,distance} from './location.js';
import {renderItemRolls} from './item-details.js';
import {itemArtwork} from './item-icons.js';
import {rollEquipment} from './equipment-items.js';
import {SHOP,shopItems,sellPrice} from './shop.js';

const rarities=['Обычный','Необычный','Редкий'];
const node=<K extends keyof HTMLElementTagNameMap>(tag:K,className='',text='')=>{const value=document.createElement(tag);value.className=className;value.textContent=text;return value;};
export function tooltipPosition(anchor:Pick<DOMRect,'left'|'right'|'top'|'bottom'>,width:number,height:number,viewportWidth:number,viewportHeight:number){
  const margin=12;
  let x=anchor.left-width-14;if(x<margin)x=anchor.right+14;
  return {x:Math.max(margin,Math.min(x,viewportWidth-width-margin)),y:Math.max(margin,Math.min(anchor.top,viewportHeight-height-margin))};
}

export function bindInventoryInteractions(game:NetworkGame,toast:(text:string)=>void,openInventory:()=>void){
  const inventory=document.getElementById('inventory-panel')!,bag=document.getElementById('bag-items')!,slots=document.getElementById('equipment-slots')!;
  const tooltip=node('aside','item-tooltip');tooltip.id='item-tooltip';tooltip.setAttribute('role','tooltip');tooltip.hidden=true;document.body.append(tooltip);
  const vendor=node('aside','rpg-panel vendor-panel');vendor.id='vendor-panel';vendor.hidden=true;vendor.setAttribute('aria-label','Магазин торговца');
  const heading=node('div','panel-title'),titles=node('div');titles.append(node('p','eyebrow','ЛАГЕРНЫЙ ТОРГОВЕЦ'),node('h2','','Снаряжение в дорогу'));
  const close=node('button','panel-close','×');close.type='button';close.setAttribute('aria-label','Закрыть магазин');heading.append(titles,close);
  const tabs=node('nav','vendor-tabs');tabs.setAttribute('aria-label','Комплекты классов');
  const body=node('div','panel-body'),intro=node('p','vendor-intro','Простое снаряжение с минимальными свойствами. Лучшие экземпляры ищите в лесу.'),wares=node('div','vendor-grid');
  body.append(intro,wares);
  const sellZone=node('div','vendor-sell-zone','Перетащите сюда вещь из рюкзака, чтобы продать');sellZone.setAttribute('aria-label','Продать предмет');body.append(sellZone);
  const footer=node('div','panel-bottom vendor-bottom'),gold=node('span'),hint=node('small','','ПКМ по товару — купить · ПКМ в рюкзаке — продать');footer.append(gold,hint);
  vendor.append(heading,tabs,body,footer);document.body.append(vendor);
  let opened=false,tab:ClassId=game.player.classId,hover:HTMLElement|null=null,hoverSignature='',pendingSignature='',pendingUntil=0,dragging=false;
  const vendorSamples=new Map(shopItems().map(listing=>[listing.definitionId,rollEquipment(listing.definitionId,`shop-preview:${listing.definitionId}`,()=>0)]));
  const signature=()=>JSON.stringify([game.player.gold,game.player.items,game.player.equipment]);
  const canTrade=()=>opened&&game.player.shopActive===true&&game.connected&&!game.player.dead&&!game.player.attack&&safe(game.player)&&distance(game.player,SHOP)<=SHOP.range&&(game.player.combatUntil||0)<=game.serverTime;
  const canEdit=()=>game.connected&&!game.player.dead&&!game.player.attack&&safe(game.player)&&(game.player.combatUntil||0)<=game.serverTime;
  function hideTooltip(){tooltip.hidden=true;if(hover)hover.removeAttribute('aria-describedby');hover=null;hoverSignature='';}
  function setOpen(value:boolean){opened=value;vendor.hidden=!value;document.body.classList.toggle('vendor-open',value);hideTooltip();if(value){tab=game.player.classId;openInventory();renderShop();}update();}
  close.onclick=()=>setOpen(false);
  function send(command:ClientCommand){
    if(pendingUntil>performance.now()){toast('Дождитесь подтверждения предыдущего действия');return;}
    pendingSignature=signature();pendingUntil=performance.now()+2500;hideTooltip();game.send(command);
  }
  function itemFor(element:HTMLElement):Item|undefined{
    if(element.dataset.definitionId)return vendorSamples.get(element.dataset.definitionId);
    const id=element.dataset.itemId||game.player.equipment[element.dataset.slot as EquipmentSlot];
    return game.player.items.find(item=>item.id===id);
  }
  function showTooltip(element:HTMLElement){
    const item=itemFor(element);if(!item||dragging)return;
    const key=JSON.stringify([item,game.player.equipment,opened,game.player.items.find(other=>other.id===game.player.equipment[item.slot])]);
    if(hover===element&&hoverSignature===key&&!tooltip.hidden)return;
    hideTooltip();hover=element;hoverSignature=key;element.setAttribute('aria-describedby',tooltip.id);tooltip.replaceChildren();
    const head=node('div','tooltip-heading'),art=node('div','tooltip-art');art.innerHTML=itemArtwork(item,item.classId||game.player.classId);
    const text=node('div');text.append(node('p',`eyebrow rarity-text-${item.rarity}`,`${rarities[item.rarity]||rarities[0]} · ${EQUIPMENT_SLOTS[item.slot].name}`),node('h3','',item.name));head.append(art,text);
    tooltip.append(head,node('p','tooltip-requirements',`${item.classId?CLASSES[item.classId].name:'Все классы'} · уровень предмета ${item.itemLevel||1}`));
    const values=node('div','item-rolls');renderItemRolls(values,item,game.player.items.find(other=>other.id===game.player.equipment[item.slot]));
    if(!item.rolls)values.append(node('p','',itemBonus(item)));tooltip.append(values);
    if(!canEquip(game.player,item))tooltip.append(node('p','tooltip-warning','Этот предмет предназначен другому классу'));
    const worn=Object.values(game.player.equipment).includes(item.id);
    const listing=shopItems().find(value=>value.definitionId===element.dataset.definitionId);
    const status=listing?`Цена: ${listing.price} золота · ПКМ — купить`:item.bound?'Привязано к герою · не продаётся':worn?'Надето · ПКМ — снять':opened?`Продажа: ${sellPrice(item)} золота · ПКМ — продать`:`Продажа: ${sellPrice(item)} золота · ПКМ — надеть`;
    tooltip.append(node('p','tooltip-footer',status));tooltip.hidden=false;
    const position=tooltipPosition(element.getBoundingClientRect(),tooltip.offsetWidth,tooltip.offsetHeight,innerWidth,innerHeight);
    tooltip.style.left=`${position.x}px`;tooltip.style.top=`${position.y}px`;
  }
  function itemAction(item:Item,mode:'equip'|'unequip'|'sell'){
    if(mode==='sell'){
      if(!canTrade()){toast('Продавать вещи можно у торговца');return;}
      if(item.bound||Object.values(game.player.equipment).includes(item.id)){toast('Сначала снимите вещь. Привязанные предметы не продаются');return;}
    }else{
      if(!canEdit()){toast('Снаряжение меняется в лагере, вне боя');return;}
      if(!canEquip(game.player,item)){toast('Предмет не подходит вашему классу');return;}
      if(mode==='unequip'&&backpackItems(game.player).length>=BAG_CAPACITY){toast('В рюкзаке нет свободной ячейки');return;}
    }
    send({type:mode,id:item.id});
  }
  function buy(definitionId:string){
    const listing=shopItems().find(value=>value.definitionId===definitionId);if(!listing)return;
    if(!canTrade()){toast('Подойдите к торговцу и откройте магазин');return;}
    if(game.player.gold<listing.price){toast('Недостаточно золота');return;}
    if(backpackItems(game.player).length>=BAG_CAPACITY){toast('Освободите ячейку в рюкзаке');return;}
    send({type:'buy',definitionId});
  }
  function renderShop(){
    wares.replaceChildren();tabs.replaceChildren();
    for(const classId of ['warrior','archer','mage'] as const){const button=node('button',classId===tab?'selected':'',CLASSES[classId].name);button.type='button';button.setAttribute('aria-pressed',String(classId===tab));button.onclick=()=>{tab=classId;hideTooltip();renderShop();};tabs.append(button);}
    for(const listing of shopItems().filter(value=>value.classId===tab)){
      const button=node('button','vendor-item');button.type='button';button.dataset.definitionId=listing.definitionId;button.draggable=false;
      const image=node('span','vendor-item-art');image.innerHTML=itemArtwork(vendorSamples.get(listing.definitionId)!,listing.classId);
      button.append(image,node('span','vendor-item-name',listing.name),node('span','vendor-price',`${listing.price} зол.`));
      button.setAttribute('aria-label',`${listing.name} · ${listing.price} золота. Правая кнопка — купить`);
      button.onclick=()=>showTooltip(button);button.ondblclick=()=>buy(listing.definitionId);wares.append(button);
    }
  }
  function cell(event:Event){return event.target instanceof Element?event.target.closest<HTMLElement>('.bag-cell,.equipment-slot,.vendor-item'):null;}
  for(const container of [inventory,vendor]){
    container.addEventListener('pointerover',event=>{const target=cell(event);if(target)showTooltip(target);});
    container.addEventListener('pointerout',event=>{const target=cell(event);if(target&&(!(event.relatedTarget instanceof Node)||!target.contains(event.relatedTarget)))hideTooltip();});
    container.addEventListener('focusin',event=>{const target=cell(event);if(target)showTooltip(target);});
    container.addEventListener('focusout',hideTooltip);container.addEventListener('scroll',hideTooltip,true);
    container.addEventListener('contextmenu',event=>{
      event.preventDefault();const target=cell(event);if(!target)return;event.stopPropagation();
      if(target.dataset.definitionId){buy(target.dataset.definitionId);return;}
      const item=itemFor(target);if(item)itemAction(item,opened?'sell':Object.values(game.player.equipment).includes(item.id)?'unequip':'equip');
    });
    container.addEventListener('dragstart',event=>event.preventDefault());
  }
  type Transfer={id?:string;definitionId?:string};
  function dropItem(payload:Transfer,target:Element|null){
    if(!target)return;
    const inBag=bag.contains(target),slot=target.closest<HTMLElement>('.equipment-slot');
    if(payload.definitionId){if(inBag)buy(payload.definitionId);return;}
    const item=game.player.items.find(value=>value.id===payload.id);if(!item)return;
    if(vendor.contains(target)){itemAction(item,'sell');return;}
    const worn=Object.values(game.player.equipment).includes(item.id);
    if(inBag){if(worn)itemAction(item,'unequip');return;}
    if(!slot||!slots.contains(slot))return;
    if(slot.dataset.slot!==item.slot){toast('Перетащите вещь в подходящий слот');return;}
    if(!worn)itemAction(item,'equip');
  }
  let drag:{pointerId:number;source:HTMLElement;payload:Transfer;x:number;y:number;ghost:HTMLElement|null}|null=null,suppressClickUntil=0;
  function endDrag(){
    const old=drag;drag=null;dragging=false;old?.ghost?.remove();document.body.classList.remove('item-dragging');
    if(old?.source.hasPointerCapture(old.pointerId))old.source.releasePointerCapture(old.pointerId);
  }
  for(const container of [inventory,vendor])container.addEventListener('pointerdown',event=>{
    if(event.button!==0||event.isPrimary===false)return;
    const source=cell(event),item=source&&itemFor(source);if(!source||!item)return;
    endDrag();suppressClickUntil=0;
    drag={pointerId:event.pointerId,source,payload:source.dataset.definitionId?{definitionId:source.dataset.definitionId}:{id:item.id},x:event.clientX,y:event.clientY,ghost:null};
  });
  addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;
    if(!(event.buttons&1)){endDrag();return;}
    if(!dragging&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<6)return;
    if(!dragging){
      dragging=true;hideTooltip();document.body.classList.add('item-dragging');drag.source.setPointerCapture(event.pointerId);
      drag.ghost=node('div','item-drag-ghost');drag.ghost.innerHTML=drag.source.innerHTML;document.body.append(drag.ghost);
    }
    event.preventDefault();drag.ghost!.style.transform=`translate(${event.clientX+12}px,${event.clientY+12}px)`;
  },{passive:false});
  addEventListener('pointerup',event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;
    const payload=drag.payload,complete=dragging,target=document.elementFromPoint(event.clientX,event.clientY);
    endDrag();if(complete){event.preventDefault();suppressClickUntil=performance.now()+300;dropItem(payload,target);}
  });
  for(const container of [inventory,vendor])container.addEventListener('click',event=>{if(performance.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();suppressClickUntil=0;}},true);
  addEventListener('pointercancel',endDrag);addEventListener('blur',endDrag);
  addEventListener('keydown',event=>{if(event.code==='Escape'){setOpen(false);hideTooltip();}});
  addEventListener('resize',hideTooltip);addEventListener('blur',hideTooltip);
  function update(){
    if(opened&&(!game.connected||!game.player.shopActive||game.player.dead||distance(game.player,SHOP)>SHOP.range||inventory.hidden)){opened=false;vendor.hidden=true;document.body.classList.remove('vendor-open');hideTooltip();}
    if(inventory.hidden&&vendor.hidden){hideTooltip();endDrag();}
    if(pendingUntil&&(signature()!==pendingSignature||performance.now()>pendingUntil)){pendingUntil=0;pendingSignature='';}
    gold.textContent=`${game.player.gold} золота`;
    for(const element of inventory.querySelectorAll<HTMLElement>('.bag-cell,.equipment-slot')){element.draggable=false;element.removeAttribute('title');}
    for(const element of wares.querySelectorAll<HTMLElement>('.vendor-item')){const listing=shopItems().find(value=>value.definitionId===element.dataset.definitionId);element.classList.toggle('unaffordable',game.player.gold<(listing?.price||0));}
    const sell=document.getElementById('item-sell') as HTMLButtonElement;sell.hidden=!opened;
    const hint=document.getElementById('inventory-hint')!;hint.textContent=opened?'Магазин открыт · ПКМ по вещи — продать · перетащите вещь торговцу':'Наведите для описания · ПКМ — надеть / снять · перетащите в слот';
    if(hover&&!tooltip.hidden){if(!itemFor(hover))hideTooltip();else showTooltip(hover);}
  }
  function onEvent(event:WorldEvent){if(event.type==='shopOpen'&&event.npcId===SHOP.id)setOpen(true);if(event.type==='death'||event.type==='camp')setOpen(false);}
  return {update,onEvent,isOpen:()=>opened,canTrade,hideTooltip,sell:(item:Item)=>itemAction(item,'sell')};
}
