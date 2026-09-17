import type {Item,ClassId,EquipmentSlot,WorldEvent,ClientCommand} from '../../shared/types.js';
import type {NetworkGame} from './network.js';
import {MAX_STASH_CAPACITY,STASH_SLOT_PRICE,backpackItems,canEquip,CLASSES,EQUIPMENT_SLOTS,itemBonus,itemClassName,itemShownClass,itemWrongClass} from '../rules.js';
import {safe,distance} from './location.js';
import {renderItemRolls} from './item-details.js';
import {itemArtwork} from './item-icons.js';
import {ITEM_STAT_LABELS,itemDisplayName,rollEquipment,rollUnit} from './equipment-items.js';
import {SHOP,shopItems,sellPrice} from './shop.js';
import {CONSUMABLE_CATALOG,CONSUMABLE_LIMIT,backpackUsage,consumableDefinition,consumableKindQuantity,consumableQuantity} from './consumables.js';
import {PERSONAL_CHEST} from './personal-stash.js';
import {consumableArtwork,consumableTier} from './consumable-ui.js';
import {equippedSetCounts,itemSet} from './equipment-sets.js';

export const RARITY_LABELS=['Обычный','Необычный','Редкий','Возвышенный','Сетовый'] as const;
const node=<K extends keyof HTMLElementTagNameMap>(tag:K,className='',text='')=>{const value=document.createElement(tag);value.className=className;value.textContent=text;return value;};
export function paintItemClass(host:HTMLElement,item:{classId?:Item['classId'];slot?:Item['slot']}|undefined,heroClass:ClassId){
  let mark=host.querySelector<HTMLElement>(':scope > .item-class');
  const classId=itemShownClass(item);
  if(!classId){mark?.remove();return;}
  if(!mark){mark=node('b','item-class');host.append(mark);}
  mark.textContent=itemClassName(classId);
  mark.classList.toggle('wrong-class',itemWrongClass({classId:heroClass},item));
}
export function tooltipPosition(anchor:Pick<DOMRect,'left'|'right'|'top'|'bottom'>,width:number,height:number,viewportWidth:number,viewportHeight:number){
  const margin=12;
  let x=anchor.left-width-14;if(x<margin)x=anchor.right+14;
  return {x:Math.max(margin,Math.min(x,viewportWidth-width-margin)),y:Math.max(margin,Math.min(anchor.top,viewportHeight-height-margin))};
}

export function bindInventoryInteractions(game:NetworkGame,toast:(text:string)=>void,openInventory:()=>void){
  const inventory=document.getElementById('inventory-panel')!,bag=document.getElementById('bag-items')!,slots=document.getElementById('equipment-slots')!;
  const tooltip=node('aside','item-tooltip');tooltip.id='item-tooltip';tooltip.setAttribute('role','tooltip');tooltip.hidden=true;document.body.append(tooltip);
  const vendor=node('aside','rpg-panel vendor-panel');vendor.id='vendor-panel';vendor.hidden=true;vendor.setAttribute('aria-label','Магазин торговца');
  const heading=node('div','panel-title'),titles=node('div');titles.append(node('p','eyebrow','ЛАГЕРНЫЙ ТОРГОВЕЦ'),node('h2','','Снаряжение и зелья'));
  const close=node('button','panel-close','×');close.type='button';close.setAttribute('aria-label','Закрыть магазин');heading.append(titles,close);
  const tabs=node('nav','vendor-tabs');tabs.setAttribute('aria-label','Комплекты классов');
  const body=node('div','panel-body'),intro=node('p','vendor-intro','Простое снаряжение с минимальными свойствами. Лучшие экземпляры ищите в лесу.'),wares=node('div','vendor-grid');
  const supplies=node('div','vendor-supplies');
  for(const kind of ['hp','mana'] as const){
    const group=node('section',`vendor-consumable-group vendor-consumable-${kind}`),groupTitle=node('h3','',kind==='hp'?'Зелья здоровья':'Зелья маны');group.append(groupTitle);
    for(const info of Object.values(CONSUMABLE_CATALOG).filter(value=>value.kind===kind)){
      const tier=consumableTier(info.id),card=node('article',`vendor-consumable consumable-tier-${tier.rank}`),icon=node('span','consumable-art');
      card.dataset.consumableDefinition=info.id;icon.innerHTML=consumableArtwork(info);
      const details=node('div','vendor-consumable-details');details.append(node('strong','',info.name),node('small','',`+${info.restore} ${kind==='hp'?'HP':'MP'} · уровень ${tier.label}`));
      const actions=node('div','vendor-consumable-actions');
      for(const quantity of [1,50] as const){
        const button=node('button','vendor-consumable-buy',quantity===1?`1 шт. · ${info.price} зол.`:`50 шт. · ${info.price*quantity} зол.`);button.type='button';
        button.dataset.definitionId=info.id;button.dataset.quantity=String(quantity);
        button.setAttribute('aria-label',`Купить ${info.name}: ${quantity} штук за ${info.price*quantity} золота`);
        button.onclick=()=>buyConsumable(info.id,quantity);actions.append(button);
      }
      card.append(icon,details,actions);group.append(card);
    }
    supplies.append(group);
  }
  body.append(intro,supplies,wares);
  const sellZone=node('div','vendor-sell-zone','Перетащите сюда вещь из рюкзака, чтобы продать');sellZone.setAttribute('aria-label','Продать предмет');body.append(sellZone);
  const footer=node('div','panel-bottom vendor-bottom'),gold=node('span'),hint=node('small','','ПКМ по товару — купить · ПКМ в рюкзаке — продать');footer.append(gold,hint);
  vendor.append(heading,tabs,body,footer);document.body.append(vendor);
  const stash=node('aside','rpg-panel stash-panel');stash.id='stash-panel';stash.hidden=true;stash.setAttribute('aria-label','Личный сундук');
  const stashHeading=node('div','panel-title'),stashTitles=node('div');stashTitles.append(node('p','eyebrow','ЛИЧНОЕ ХРАНИЛИЩЕ'),node('h2','','Сундук в доме'));
  const stashClose=node('button','panel-close','×');stashClose.type='button';stashClose.setAttribute('aria-label','Закрыть сундук');stashHeading.append(stashTitles,stashClose);
  const stashBody=node('div','panel-body'),stashCount=node('p','vendor-intro'),stashGrid=node('div','bag-grid stash-grid');stashBody.append(stashCount,stashGrid);
  stash.append(stashHeading,stashBody,node('div','panel-bottom','ПКМ или перетаскивание — переложить вещь'));document.body.append(stash);
  let stashOpened=false,stashKey='';
  let opened=false,tab:ClassId=game.player.classId,hover:HTMLElement|null=null,hoverSignature='',pendingSignature='',pendingUntil=0,dragging=false;
  const vendorSamples=new Map(shopItems().map(listing=>[listing.definitionId,rollEquipment(listing.definitionId,`shop-preview:${listing.definitionId}`,()=>0)]));
  const signature=()=>JSON.stringify([game.player.gold,game.player.items,game.player.equipment,game.player.stash,game.player.consumableInventory,game.player.quickSlots]);
  const canTrade=()=>opened&&game.player.shopActive===true&&game.connected&&!game.player.dead&&!game.player.attack&&safe(game.player)&&distance(game.player,SHOP)<=SHOP.range&&(game.player.combatUntil||0)<=game.serverTime;
  const canEdit=()=>game.connected&&!game.player.dead;
  const canUseStash=()=>canEdit()&&!game.player.attack&&safe(game.player)&&(game.player.combatUntil||0)<=game.serverTime;
  function hideTooltip(){tooltip.hidden=true;if(hover)hover.removeAttribute('aria-describedby');hover=null;hoverSignature='';}
  function setOpen(value:boolean){if(value&&stashOpened)setStashOpen(false);opened=value;vendor.hidden=!value;document.body.classList.toggle('vendor-open',value);hideTooltip();if(value){tab=game.player.classId;openInventory();renderShop();}update();}
  close.onclick=()=>setOpen(false);
  function setStashOpen(value:boolean,notify=true){
    const changed=stashOpened!==value;stashOpened=value;stash.hidden=!value;document.body.classList.toggle('stash-open',value);hideTooltip();
    if(!value&&changed&&notify&&game.connected)game.send({type:'stashClose'});
    if(value){if(opened)setOpen(false);openInventory();renderStash();}
  }
  stashClose.onclick=()=>setStashOpen(false);
  function transfer(item:Item,withdraw:boolean){
    if(!stashOpened||!game.player.stashActive||!canUseStash()){toast('Откройте личный сундук в доме');return;}
    if(Object.values(game.player.equipment).includes(item.id)){toast('Сначала снимите предмет');return;}
    if(withdraw&&backpackUsage(game.player)>=game.player.bagCapacity){toast('В рюкзаке нет свободной ячейки');return;}
    if(!withdraw&&game.player.stash.length>=game.player.stashCapacity){toast('Сундук заполнен');return;}
    send({type:withdraw?'stashWithdraw':'stashDeposit',id:item.id});
  }
  function renderStash(){
    const p=game.player,key=JSON.stringify([p.stash,p.items,p.stashCapacity,p.gold,p.stashActive,p.dead,game.connected]);if(key===stashKey)return;stashKey=key;
    stashCount.textContent=`${p.stash.length} / ${p.stashCapacity} ячеек · вещи сохранены у этого героя`;stashGrid.replaceChildren();
    for(let i=0;i<p.stashCapacity;i++){
      const item=p.items.find(item=>item.id===p.stash[i]),button=node('button',`bag-cell ${item?'rarity-'+item.rarity:'empty'}`);button.type='button';
      if(item){button.dataset.itemId=item.id;button.innerHTML=itemArtwork(item,item.classId||p.classId);button.setAttribute('aria-label',`${itemDisplayName(item.name)} · ${itemClassName(itemShownClass(item))}`);paintItemClass(button,item,p.classId);}else button.setAttribute('aria-label','Пустая ячейка сундука');
      stashGrid.append(button);
    }
    if(p.stashCapacity<MAX_STASH_CAPACITY){
      const plus=node('button','bag-cell bag-expand');plus.type='button';plus.innerHTML='<span>+</span>';
      plus.title=`Купить ячейку за ${STASH_SLOT_PRICE} золота`;plus.setAttribute('aria-label',plus.title);
      plus.disabled=!canUseStash()||!p.stashActive||p.gold<STASH_SLOT_PRICE;
      plus.onclick=()=>{if(plus.disabled){toast(p.gold<STASH_SLOT_PRICE?`Нужно ${STASH_SLOT_PRICE} золота`:'Откройте сундук');return;}send({type:'buyStashSlot'});};
      stashGrid.append(plus);
    }
  }
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
    if(element.dataset.consumableDefinition){showConsumableTooltip(element);return;}
    const item=itemFor(element);if(!item||dragging)return;
    const key=JSON.stringify([item,game.player.equipment,opened,stashOpened,game.player.stash,game.player.items.find(other=>other.id===game.player.equipment[item.slot])]);
    if(hover===element&&hoverSignature===key&&!tooltip.hidden)return;
    hideTooltip();hover=element;hoverSignature=key;element.setAttribute('aria-describedby',tooltip.id);tooltip.replaceChildren();
    const head=node('div','tooltip-heading'),art=node('div','tooltip-art');art.innerHTML=itemArtwork(item,item.classId||game.player.classId);
    const text=node('div');text.append(node('p',`eyebrow rarity-text-${item.rarity}`,`${RARITY_LABELS[item.rarity]||RARITY_LABELS[0]} · ${EQUIPMENT_SLOTS[item.slot].name}`),node('h3','',itemDisplayName(item.name)));head.append(art,text);
    const wrong=itemWrongClass(game.player,item);
    const requirement=node('p',`tooltip-requirements${wrong?' wrong-class':''}`,wrong?`${itemClassName(itemShownClass(item))} · нельзя надеть`:`${itemClassName(itemShownClass(item))} · уровень предмета ${item.itemLevel||1}`);
    tooltip.append(head,requirement);
    const values=node('div','item-rolls');renderItemRolls(values,item,game.player.items.find(other=>other.id===game.player.equipment[item.slot]));
    if(!item.rolls)values.append(node('p','',itemBonus(item)));tooltip.append(values);
    const set=itemSet(item);
    if(set){
      const count=equippedSetCounts(game.player).get(set.id)??0,section=node('section','tooltip-set');
      section.append(node('p','tooltip-set-name',`${set.name} · надето ${count} / 6`));
      for(const bonus of set.bonuses){
        const line=node('p',count>=bonus.pieces?'active':'');
        line.textContent=`${bonus.pieces} предмета: ${bonus.stats.map(stat=>`${ITEM_STAT_LABELS[stat.key]} +${stat.value}${rollUnit(stat.key)}`).join(' · ')}`;
        section.append(line);
      }
      tooltip.append(section);
    }
    if(wrong)tooltip.append(node('p','tooltip-warning','Нельзя надеть: эта шмотка для другого класса'));
    else if(!canEquip(game.player,item))tooltip.append(node('p','tooltip-warning','Нельзя надеть: не хватает уровня'));
    const worn=Object.values(game.player.equipment).includes(item.id);
    const listing=shopItems().find(value=>value.definitionId===element.dataset.definitionId);
    const stored=game.player.stash.includes(item.id);
    const binding=item.bound?'Привязано к герою · ':'';
    const status=stashOpened?`${stored?'В сундуке · ПКМ — забрать':worn?'Надето · сначала снимите предмет':'В рюкзаке · ПКМ — положить в сундук'}`:listing?`Цена: ${listing.price} золота · ПКМ — купить`:worn?`${binding}Надето · ПКМ — снять`:opened?`${binding}Продажа: ${sellPrice(item)} золота · ПКМ — продать`:`${binding}Продажа: ${sellPrice(item)} золота · ПКМ — надеть`;
    tooltip.append(node('p','tooltip-footer',status));tooltip.hidden=false;
    const position=tooltipPosition(element.getBoundingClientRect(),tooltip.offsetWidth,tooltip.offsetHeight,innerWidth,innerHeight);
    tooltip.style.left=`${position.x}px`;tooltip.style.top=`${position.y}px`;
  }
  function showConsumableTooltip(element:HTMLElement){
    const definition=consumableDefinition(element.dataset.consumableDefinition),stack=game.player.consumableInventory.find(value=>value.id===element.dataset.consumableId);
    if(!definition||!stack||dragging)return;
    const key=JSON.stringify([definition.id,stack.quantity]);if(hover===element&&hoverSignature===key&&!tooltip.hidden)return;
    hideTooltip();hover=element;element.setAttribute('aria-describedby',tooltip.id);tooltip.replaceChildren();
    hoverSignature=key;
    const heading=node('div','tooltip-heading'),art=node('div','tooltip-art');art.innerHTML=consumableArtwork(definition);
    const text=node('div');text.append(node('p','eyebrow',definition.kind==='hp'?'ЗДОРОВЬЕ':'МАНА'),node('h3','',definition.name));heading.append(art,text);
    tooltip.append(heading,node('p','tooltip-requirements',`Восстанавливает ${definition.restore} ${definition.kind==='hp'?'HP':'MP'} · в стопке ${stack.quantity} / ${definition.stackLimit}`),node('p','tooltip-footer','Перетащите бутылку на Q или W, чтобы назначить. Зелье останется в рюкзаке.'));tooltip.hidden=false;
    const position=tooltipPosition(element.getBoundingClientRect(),tooltip.offsetWidth,tooltip.offsetHeight,innerWidth,innerHeight);tooltip.style.left=`${position.x}px`;tooltip.style.top=`${position.y}px`;
  }
  function itemAction(item:Item,mode:'equip'|'unequip'|'sell'){
    if(mode==='sell'){
      if(!canTrade()){toast('Продавать вещи можно у торговца');return;}
      if(Object.values(game.player.equipment).includes(item.id)){toast('Сначала снимите вещь');return;}
    }else{
      if(!canEdit()){toast('Снаряжение недоступно: герой погиб или нет соединения');return;}
      if(!canEquip(game.player,item)){toast(itemWrongClass(game.player,item)?`Нельзя надеть: шмотка для класса «${itemClassName(item.classId)}»`:'Нельзя надеть: не хватает уровня');return;}
      if(mode==='unequip'&&backpackUsage(game.player)>=game.player.bagCapacity){toast('В рюкзаке нет свободной ячейки');return;}
    }
    send({type:mode,id:item.id});
  }
  function buy(definitionId:string){
    const listing=shopItems().find(value=>value.definitionId===definitionId);if(!listing)return;
    if(!canTrade()){toast('Подойдите к торговцу и откройте магазин');return;}
    if(game.player.gold<listing.price){toast('Недостаточно золота');return;}
    if(backpackUsage(game.player)>=game.player.bagCapacity){toast('Освободите ячейку в рюкзаке');return;}
    send({type:'buy',definitionId});
  }
  function buyConsumable(definitionId:string,quantity:1|50){
    const definition=consumableDefinition(definitionId);if(!definition)return;
    if(!canTrade()){toast('Подойдите к торговцу и откройте магазин');return;}
    const definitionCount=consumableQuantity(game.player,definition.id),kindCount=consumableKindQuantity(game.player,definition.kind),totalPrice=definition.price*quantity;
    if(definitionCount+quantity>definition.stackLimit||kindCount+quantity>CONSUMABLE_LIMIT){toast(`Для ${quantity} бутылок не хватает места в запасе`);return;}
    if(!definitionCount&&backpackUsage(game.player)>=game.player.bagCapacity){toast('Освободите ячейку в рюкзаке');return;}
    if(game.player.gold<totalPrice){toast(`Нужно ${totalPrice} золота`);return;}
    send({type:'buyConsumable',definitionId,quantity,requestId:crypto.randomUUID()});
  }
  function renderShop(){
    wares.replaceChildren();tabs.replaceChildren();
    for(const classId of ['warrior','archer','mage'] as const){const button=node('button',classId===tab?'selected':'',CLASSES[classId].name);button.type='button';button.setAttribute('aria-pressed',String(classId===tab));button.onclick=()=>{tab=classId;hideTooltip();renderShop();};tabs.append(button);}
    for(const listing of shopItems().filter(value=>value.classId===tab||value.slot==='ring'||value.slot==='amulet')){
      const button=node('button','vendor-item');button.type='button';button.dataset.definitionId=listing.definitionId;button.draggable=false;
      const image=node('span','vendor-item-art');image.innerHTML=itemArtwork(vendorSamples.get(listing.definitionId)!,listing.classId);
      button.append(image,node('span','vendor-item-name',listing.name),node('span','vendor-price',`${listing.price} зол.`));
      paintItemClass(button,listing,game.player.classId);
      button.setAttribute('aria-label',`${listing.name} · ${itemClassName(itemShownClass(listing))} · ${listing.price} золота. Правая кнопка — купить`);
      button.onclick=()=>showTooltip(button);button.ondblclick=()=>buy(listing.definitionId);wares.append(button);
    }
  }
  function cell(event:Event){return event.target instanceof Element?event.target.closest<HTMLElement>('.bag-cell:not(.bag-expand),.equipment-slot,.vendor-item'):null;}
  for(const container of [inventory,vendor,stash]){
    container.addEventListener('pointerover',event=>{const target=cell(event);if(target)showTooltip(target);});
    container.addEventListener('pointerout',event=>{const target=cell(event);if(target&&(!(event.relatedTarget instanceof Node)||!target.contains(event.relatedTarget)))hideTooltip();});
    container.addEventListener('focusin',event=>{const target=cell(event);if(target)showTooltip(target);});
    container.addEventListener('focusout',hideTooltip);container.addEventListener('scroll',hideTooltip,true);
    container.addEventListener('contextmenu',event=>{
      event.preventDefault();const target=cell(event);if(!target)return;event.stopPropagation();
      if(target.dataset.definitionId){buy(target.dataset.definitionId);return;}
      if(target.dataset.consumableDefinition)return;
      const item=itemFor(target);if(item&&stashOpened){transfer(item,game.player.stash.includes(item.id));return;}if(item)itemAction(item,opened?'sell':Object.values(game.player.equipment).includes(item.id)?'unequip':'equip');
    });
    container.addEventListener('dragstart',event=>event.preventDefault());
  }
  type Transfer={id?:string;definitionId?:string;consumableDefinition?:string};
  function dropItem(payload:Transfer,target:Element|null){
    if(!target)return;
    const quick=target.closest<HTMLElement>('[data-quick-slot]');
    if(payload.consumableDefinition&&quick){const slot=quick.dataset.quickSlot;if(slot==='q'||slot==='w')game.send({type:'assignConsumable',slot,definitionId:payload.consumableDefinition});return;}
    const inBag=bag.contains(target),slot=target.closest<HTMLElement>('.equipment-slot');
    if(payload.definitionId){if(inBag)buy(payload.definitionId);return;}
    const cell=target.closest<HTMLElement>('.bag-cell:not(.bag-expand)');
    const bagSlot=Number(cell?.dataset.bagIndex);
    if(inBag&&payload.id&&Number.isInteger(bagSlot)&&(game.player.bag??[]).includes(payload.id)&&(game.player.bag??[])[bagSlot]!==payload.id){
      game.send({type:'bagMove',id:payload.id,slot:bagSlot});return;
    }
    if(payload.consumableDefinition)return;
    const item=game.player.items.find(value=>value.id===payload.id);if(!item)return;
    if(stashOpened&&stash.contains(target)){if(!game.player.stash.includes(item.id))transfer(item,false);return;}
    if(stashOpened&&inBag&&game.player.stash.includes(item.id)){transfer(item,true);return;}
    if(game.player.stash.includes(item.id))return;
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
  for(const container of [inventory,vendor,stash])container.addEventListener('pointerdown',event=>{
    if(event.button!==0||event.isPrimary===false)return;
    const source=cell(event),item=source&&itemFor(source),consumable=source?.dataset.consumableDefinition;if(!source||(!item&&!consumable))return;
    endDrag();suppressClickUntil=0;
    drag={pointerId:event.pointerId,source,payload:consumable?{consumableDefinition:consumable,id:source.dataset.consumableId}:source.dataset.definitionId?{definitionId:source.dataset.definitionId}:{id:item!.id},x:event.clientX,y:event.clientY,ghost:null};
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
  for(const container of [inventory,vendor,stash,...[document.getElementById('potion')!,document.getElementById('mana-potion')!]])container.addEventListener('click',event=>{if(performance.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();suppressClickUntil=0;}},true);
  addEventListener('pointercancel',endDrag);addEventListener('blur',endDrag);
  addEventListener('keydown',event=>{if(event.code==='Escape'){setOpen(false);setStashOpen(false);hideTooltip();}});
  addEventListener('resize',hideTooltip);addEventListener('blur',hideTooltip);
  function update(){
    if(opened&&(!game.connected||!game.player.shopActive||game.player.dead||distance(game.player,SHOP)>SHOP.range||inventory.hidden)){opened=false;vendor.hidden=true;document.body.classList.remove('vendor-open');hideTooltip();}
    if(stashOpened&&(!game.connected||!game.player.stashActive||game.player.dead||distance(game.player,PERSONAL_CHEST)>PERSONAL_CHEST.range||inventory.hidden))setStashOpen(false,false);
    if(stashOpened)renderStash();
    if(inventory.hidden&&vendor.hidden&&stash.hidden){hideTooltip();endDrag();}
    if(pendingUntil&&(signature()!==pendingSignature||performance.now()>pendingUntil)){pendingUntil=0;pendingSignature='';}
    gold.textContent=`${game.player.gold} золота`;
    for(const element of inventory.querySelectorAll<HTMLElement>('.bag-cell:not(.bag-expand),.equipment-slot')){element.draggable=false;element.removeAttribute('title');}
    for(const element of wares.querySelectorAll<HTMLElement>('.vendor-item')){const listing=shopItems().find(value=>value.definitionId===element.dataset.definitionId);element.classList.toggle('unaffordable',game.player.gold<(listing?.price||0));}
    for(const button of supplies.querySelectorAll<HTMLButtonElement>('.vendor-consumable-buy')){
      const definition=consumableDefinition(button.dataset.definitionId),quantity=Number(button.dataset.quantity) as 1|50;if(!definition)continue;
      const definitionCount=consumableQuantity(game.player,definition.id),kindCount=consumableKindQuantity(game.player,definition.kind),needsCell=!definitionCount&&backpackUsage(game.player)>=game.player.bagCapacity;
      button.disabled=!canTrade()||game.player.gold<definition.price*quantity||definitionCount+quantity>definition.stackLimit||kindCount+quantity>CONSUMABLE_LIMIT||needsCell;
    }
    const hint=document.getElementById('inventory-hint')!;hint.textContent=stashOpened?'Сундук открыт · ПКМ или перетаскивание — переложить вещь':opened?'Магазин открыт · ПКМ по вещи — продать · перетащите зелье на Q/W':'Перетащите вещь в другую ячейку или слот · зелье — на Q/W';
    if(hover&&!tooltip.hidden){if(hover.dataset.consumableDefinition){if(!game.player.consumableInventory.some(stack=>stack.id===hover!.dataset.consumableId))hideTooltip();else showConsumableTooltip(hover);}else if(!itemFor(hover))hideTooltip();else showTooltip(hover);}
  }
  function onEvent(event:WorldEvent){if(event.type==='shopOpen'&&event.npcId===SHOP.id)setOpen(true);if(event.type==='stashOpened'&&event.npcId===PERSONAL_CHEST.id)setStashOpen(true);if(event.type==='death'||event.type==='camp'){setOpen(false);setStashOpen(false,false);}}
  return {update,onEvent,isOpen:()=>opened||stashOpened,canTrade,hideTooltip,sell:(item:Item)=>itemAction(item,'sell')};
}
