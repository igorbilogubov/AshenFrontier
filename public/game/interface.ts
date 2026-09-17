import {bindAccountInterface} from './account-interface.js';
import {SKILLS} from './skills.js';
import {effectiveSkill} from './skill-builds.js';
import {actionIcon} from './action-icons.js';
import {bindInventoryInteractions,paintItemClass} from './inventory-interactions.js';
import {CLASSES,EQUIPMENT_SLOTS,BAG_SLOT_PRICE,MAX_BAG_CAPACITY,itemBonus,STAT_KEYS,STAT_DEFINITIONS,CLASS_PROGRESSION,characterStats,itemClassName,itemShownClass,bagOccupants} from '../rules.js';
import {backpackUsage,consumableDefinition} from './consumables.js';
import {consumableArtwork,consumableTier} from './consumable-ui.js';
import {itemDisplayName} from './equipment-items.js';
import {safe} from './location.js';
import {itemIcon,itemArtwork,itemArtKey,heroSilhouette} from './item-icons.js';
import {element as $} from './ui-types.js';
import {MAX_LEVEL} from './progression-curve.js';
import type {NetworkGame} from './network.js';
import type {Attributes,ClassId,EquipmentSlot,StatKey,WorldEvent,Item,WeaponId} from '../../shared/types.js';
type PanelName='character'|'inventory';
type StatNodes={row:HTMLDivElement;description:HTMLElement;number:HTMLSpanElement;gain:HTMLElement;value:HTMLDivElement;minus:HTMLButtonElement;plus:HTMLButtonElement};
type DerivedStat='attack'|'armor'|'hitChance'|'damageReduction'|'maxHp'|'hpRegen'|'maxMana'|'manaRegen'|'attackSpeed';
type DerivedNodes={before:HTMLSpanElement;arrow:HTMLSpanElement;after:HTMLSpanElement;formatter:(value:number)=>string};
type SlotNodes={button:HTMLButtonElement;icon:HTMLSpanElement};
type BagNodes=SlotNodes;
const panelNames:PanelName[]=['character','inventory'];
const write=(node:HTMLElement,value:unknown)=>{const text=String(value);if(node.textContent!==text)node.textContent=text;};
const emptyDraft=():Attributes=>({strength:0,dexterity:0,vitality:0,energy:0});
const total=(points:Partial<Attributes>|undefined)=>STAT_KEYS.reduce((sum,key)=>sum+(points?.[key]||0),0);
const displayNumber=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});
const displayRegen=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:3});
const format=(value:number)=>displayNumber.format(value);
const percent=(value:number)=>`${format(Math.round(value*1000)/10)}%`;
const clampRatio=(value:number,max:number)=>Math.max(0,Math.min(1,max?value/max:1));

export function bindInterface(game:NetworkGame,toast:(message:string)=>void,clearInput:()=>void){
  let inventoryKey='',statsKey='',draft=emptyDraft(),draftOwner='',pending:{revision:number;classId:ClassId;sentAt:number}|null=null,statusMessage='',lastPanel:PanelName='character';
  const compact=matchMedia('(max-width: 900px)'),panels={character:$('character-panel'),inventory:$('inventory-panel')};
  const statNodes=new Map<StatKey,StatNodes>(),derivedNodes=new Map<DerivedStat,DerivedNodes>(),slotNodes=new Map<EquipmentSlot,SlotNodes>(),bagNodes:BagNodes[]=[];
  const isPanelOpen=()=>!panels.character.hidden||!panels.inventory.hidden;
  const canEdit=()=>game.connected&&!game.player.dead;
  const canReset=()=>canEdit()&&safe(game.player)&&!game.player.attack&&(game.player.combatUntil||0)<=(game.serverTime||0);
  function syncPanels(){
    const open=isPanelOpen();document.body.classList.toggle('panel-open',open);
    $('character-toggle').setAttribute('aria-expanded',String(!panels.character.hidden));$('inventory-toggle').setAttribute('aria-expanded',String(!panels.inventory.hidden));
  }
  function openPanel(name:PanelName){
    if(panels[name].hidden)clearInput();
    lastPanel=name;if(compact.matches)Object.values(panels).forEach(panel=>{panel.hidden=true;});
    panels[name].hidden=false;syncPanels();update();$('scene').focus({preventScroll:true});
  }
  function closePanel(name:PanelName){panels[name].hidden=true;interactions.hideTooltip();syncPanels();if(!isPanelOpen())$('scene').focus({preventScroll:true});}
  function togglePanel(name:PanelName){if(panels[name].hidden)openPanel(name);else closePanel(name);}
  for(const name of panelNames){
    $(name+'-toggle').onclick=()=>togglePanel(name);$(name+'-close').onclick=()=>closePanel(name);
  }
  document.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach(button=>{button.onclick=()=>{const name=button.dataset.panel;if(name==='character'||name==='inventory')openPanel(name);};});
  compact.addEventListener('change',()=>{if(compact.matches&&isPanelOpen())openPanel(lastPanel);});
  function clearDraft(message=''){draft=emptyDraft();pending=null;statusMessage=message;statsKey='';$('reset-confirm').hidden=true;}
  for(const key of STAT_KEYS){
    const row=document.createElement('div');row.className='stat-row';
    const icon=document.createElement('span');icon.className='stat-icon';icon.innerHTML=itemIcon(key);
    const label=document.createElement('div'),name=document.createElement('span'),description=document.createElement('small'),value=document.createElement('div');
    name.className='stat-name';name.textContent=STAT_DEFINITIONS[key].name;description.className='stat-description';label.append(name,description);value.className='stat-value';
    const number=document.createElement('span'),gain=document.createElement('small');gain.hidden=true;value.append(number,gain);
    const minus=document.createElement('button'),plus=document.createElement('button');
    for(const [button,amount] of [[minus,-1],[plus,1]] as const){
      button.type='button';button.className='stat-step';button.textContent=amount<0?'−':'+';
      button.setAttribute('aria-label',`${amount<0?'Убрать':'Добавить'} очко: ${STAT_DEFINITIONS[key].name}`);
      button.onclick=()=>{
        const available=(game.player.unspentPoints||0)-total(draft);
        if(pending||!canEdit()||(amount<0?draft[key]<=0:available<=0))return;
        draft[key]+=amount;statusMessage='';statsKey='';updateStats();
      };
    }
    row.append(icon,label,value,minus,plus);$('stat-rows').append(row);statNodes.set(key,{row,description,number,gain,value,minus,plus});
  }
  const derivedDefinitions:[DerivedStat,string,(value:number)=>string][]=[
    ['attack','Урон',format],['attackSpeed','Ускорение атак',percent],['armor','Защита',format],['hitChance','Шанс попадания',percent],['damageReduction','Снижение урона',percent],
    ['maxHp','Здоровье',format],['hpRegen','Реген. HP',value=>`${displayRegen.format(value)} / с`],['maxMana','Мана',format],['manaRegen','Реген. маны',value=>`${displayRegen.format(value)} / с`]
  ];
  for(const [key,label,formatter] of derivedDefinitions){
    const cell=document.createElement('div'),term=document.createElement('dt'),value=document.createElement('dd');cell.className='derived-stat';term.textContent=label;
    if(key==='hpRegen')cell.title='Вне боя действует показанная скорость восстановления HP. В бою здоровье восстанавливается в 3 раза медленнее.';
    const before=document.createElement('span'),arrow=document.createElement('span'),after=document.createElement('span');arrow.className='arrow';arrow.textContent='→';after.className='after';value.append(before,arrow,after);cell.append(term,value);$('derived-stats').append(cell);derivedNodes.set(key,{before,arrow,after,formatter});
  }
  $('stat-cancel').onclick=()=>{if(!pending){clearDraft();updateStats();}};
  function sendStatCommand(type:'allocateStats'|'resetStats',extra?:{points:Attributes}){
    if(pending||!(type==='resetStats'?canReset():canEdit()))return;
    pending={revision:game.player.statRevision,classId:game.player.classId,sentAt:performance.now()};statusMessage='';
    if(type==='allocateStats'){if(!extra){pending=null;return;}game.send({type,revision:pending.revision,points:extra.points});}
    else game.send({type,revision:pending.revision});statsKey='';$('reset-confirm').hidden=true;updateStats();
  }
  $('stat-apply').onclick=()=>{if(total(draft)>0)sendStatCommand('allocateStats',{points:{...draft}});};
  $('reset-stats').onclick=()=>{$('reset-confirm').hidden=false;$('reset-confirm-yes').focus({preventScroll:true});};
  $('reset-confirm-no').onclick=()=>{$('reset-confirm').hidden=true;$('reset-stats').focus({preventScroll:true});};
  $('reset-confirm-yes').onclick=()=>sendStatCommand('resetStats');
  $('claim-items').onclick=()=>{if(canReset())game.send({type:'claim'});};


  $('equipment-figure').innerHTML=heroSilhouette;
  for(const [slot,info] of Object.entries(EQUIPMENT_SLOTS) as [EquipmentSlot,typeof EQUIPMENT_SLOTS[EquipmentSlot]][]){
    const button=document.createElement('button'),icon=document.createElement('span'),caption=document.createElement('small');
    button.type='button';button.className='equipment-slot';button.dataset.slot=slot;caption.className='slot-caption';caption.textContent=info.name;
    button.append(icon,caption);
    $('equipment-slots').append(button);slotNodes.set(slot,{button,icon});
  }
  function ensureBagCells(count:number){
    while(bagNodes.length<count){const button=document.createElement('button'),icon=document.createElement('span');button.type='button';button.className='bag-cell empty';button.append(icon);$('bag-items').append(button);bagNodes.push({button,icon});}
    while(bagNodes.length>count){bagNodes.pop()!.button.remove();}
  }
  function renderBagExpand(){
    const grid=$('bag-items'),cap=game.player.bagCapacity,plus=grid.querySelector<HTMLButtonElement>('.bag-expand');
    if(cap>=MAX_BAG_CAPACITY){plus?.remove();return;}
    const button=plus??document.createElement('button');
    if(!plus){button.type='button';button.className='bag-cell bag-expand';button.innerHTML='<span>+</span>';grid.append(button);
      button.onclick=()=>{if(!game.connected||game.player.dead)return;if(game.player.gold<BAG_SLOT_PRICE){toast(`Нужно ${BAG_SLOT_PRICE} золота`);return;}game.send({type:'buyBagSlot'});};}
    button.title=`Купить ячейку за ${BAG_SLOT_PRICE} золота`;button.setAttribute('aria-label',button.title);
    button.disabled=!game.connected||!!game.player.dead||game.player.gold<BAG_SLOT_PRICE;grid.append(button);
  }
  const interactions=bindInventoryInteractions(game,toast,()=>{panels.character.hidden=true;openPanel('inventory');});
  function setIcon(element:HTMLElement,slot:EquipmentSlot,classId:ClassId,item?:Item,weapon:WeaponId='sword'){const key=item?'art:'+itemArtKey(item,classId,weapon):slot+':'+classId;if(element.dataset.icon!==key){element.innerHTML=item?itemArtwork(item,classId,weapon):itemIcon(slot,classId);element.dataset.icon=key;}}
  game.onStatus=(status,message)=>{
    write($('connection'),status==='online'?`Онлайн · ${game.onlinePlayers.length}`:message);
    $('connection').classList.toggle('offline',status!=='online');
    if(status!=='online'){clearInput();if(pending||total(draft))clearDraft(status==='error'?message:'Соединение потеряно. Распределение не отправлялось повторно.');}
  };
  game.onChat=(entries,replace=false)=>{
    if(replace)$('chat-lines').replaceChildren();
    for(const entry of entries){const row=document.createElement('p'),name=document.createElement('b');name.textContent=entry.name+': ';row.append(name,document.createTextNode(entry.text));$('chat-lines').append(row);}
    while($('chat-lines').children.length>40)$('chat-lines').firstChild?.remove();$('chat-lines').scrollTop=$('chat-lines').scrollHeight;
  };
  $('chat-form').onsubmit=e=>{e.preventDefault();const text=$('chat-input').value.trim();if(text&&game.connected){game.send({type:'chat',text});$('chat-input').value='';$('scene').focus();}};
  $('chat-input').onfocus=clearInput;
  addEventListener('keydown',event=>{
    if(event.metaKey||event.ctrlKey||event.altKey||event.repeat||!game.connected)return;
    if(event.code==='Escape'&&isPanelOpen()){event.preventDefault();Object.values(panels).forEach(panel=>{panel.hidden=true;});syncPanels();$('scene').focus();return;}
    if(['INPUT','SELECT','TEXTAREA'].includes((document.activeElement?.tagName||'')))return;
    if(event.code==='KeyI'){event.preventDefault();togglePanel('inventory');}
    if(event.code==='KeyC'){event.preventDefault();togglePanel('character');}
    if(event.code==='Enter'&&!isPanelOpen()&&(document.activeElement?.tagName||'')!=='BUTTON'){event.preventDefault();$('chat-input').focus();}
  });
  const accounts=bindAccountInterface(game,clearInput);
  const join=accounts.join;
  function updateStats(){
    const p=game.player,c=CLASSES[p.classId];if(!c)return;
    const owner=`${game.id}:${p.classId}:${p.statRevision}`;
    if(owner!==draftOwner){clearDraft(draftOwner?'Характеристики обновлены.':'');draftOwner=owner;}
    if(pending&&performance.now()-pending.sentAt>8000)clearDraft('Ответ задержался. Проверьте значения перед повторным распределением.');
    if(panels.character.hidden)return;
    const editable=canEdit(),resettable=canReset();
    const key=JSON.stringify([p.classId,p.name,p.level,p.xp,p.xpNeeded,p.allocatedStats,p.statRevision,p.equipment,p.items,p.unspentPoints,editable,resettable,draft,pending,statusMessage]);
    if(key===statsKey)return;statsKey=key;
    const current=characterStats(p),proposed:Attributes={...p.allocatedStats};
    for(const stat of STAT_KEYS)proposed[stat]+=draft[stat];
    const preview=characterStats({...p,allocatedStats:proposed}),spent=total(draft),progression=CLASS_PROGRESSION[p.classId];
    const maxed=p.level>=MAX_LEVEL;
    write($('character-name'),p.name);write($('character-class'),c.name);write($('character-level'),p.level);setIcon($('class-emblem'),'weapon',p.classId);
    write($('character-xp'),maxed?'Максимальный уровень':`${p.xp} / ${p.xpNeeded} опыта`);$('character-xp-fill').style.transform=`scaleX(${maxed?1:clampRatio(p.xp,p.xpNeeded)})`;
    write($('class-role'),progression.description);write($('stat-points'),Math.max(0,(p.unspentPoints||0)-spent));
    for(const stat of STAT_KEYS){
      const nodes=statNodes.get(stat)!;write(nodes.description,progression.statDescriptions[stat]);write(nodes.number,preview.attributes[stat]);write(nodes.gain,`+${draft[stat]}`);nodes.gain.hidden=!draft[stat];nodes.value.classList.toggle('changed',draft[stat]>0);
      nodes.plus.disabled=!editable||!!pending||spent>=(p.unspentPoints||0);nodes.minus.disabled=!editable||!!pending||!draft[stat];
      nodes.row.title=`${STAT_DEFINITIONS[stat].name}: ${current.attributes[stat]}${draft[stat]?` → ${preview.attributes[stat]}`:''}. ${progression.statDescriptions[stat]}`;
    }
    for(const [stat,nodes] of derivedNodes){
      const before=nodes.formatter(current[stat]),after=nodes.formatter(preview[stat]),changed=before!==after;
      write(nodes.before,before);write(nodes.after,after);nodes.before.className=changed?'before':'';nodes.arrow.hidden=!changed;nodes.after.hidden=!changed;
    }
    write($('preview-label'),spent?'После распределения':'С учётом вещей');
    $('stat-apply').disabled=!editable||!!pending||!spent;$('stat-cancel').disabled=!!pending||!spent;write($('stat-apply'),pending?'Применяем…':spent?`Применить · ${spent}`:'Применить');
    const message=pending?'Ждём подтверждения сервера…':!game.connected?'Нет соединения. Ожидаем общий мир.':!editable?'Распределение недоступно, пока герой погиб.':statusMessage|| (spent?'Зелёным показаны будущие значения.':p.unspentPoints>0?'Выберите статы и примените очки.':'Следующий уровень принесёт 5 очков.');
    write($('stat-status'),message);$('stat-status').classList.toggle('pending',!!pending);
    $('reset-stats').disabled=!resettable||!!pending||!total(p.allocatedStats);$('reset-confirm-yes').disabled=!resettable||!!pending;
  }
  function updateInventory(){
    if(panels.inventory.hidden)return;
    const p=game.player,c=CLASSES[p.classId];if(!c)return;
    const editable=canEdit(),layout=p.bag??[],usage=backpackUsage(p),capacity=p.bagCapacity,key=JSON.stringify([p.items,p.pendingItems,p.equipment,p.stash,p.consumableInventory,p.bag,p.weapon,p.classId,p.level,p.gold,p.bagCapacity,editable,canReset()]);if(key===inventoryKey)return;inventoryKey=key;
    write($('hero-details'),`${c.name} · уровень ${p.level} · 6 слотов снаряжения`);write($('inventory-gold'),`${p.gold} золота`);write($('inventory-status'),editable?'Снаряжение можно менять и в бою':!game.connected?'Нет соединения':'Герой погиб');
    for(const [slot,nodes] of slotNodes){
      const item=p.items.find(value=>value.id===p.equipment[slot]);nodes.button.className=`equipment-slot${item?' rarity-'+(item.rarity||0):' empty'}`;
      nodes.button.dataset.itemId=item?.id||'';nodes.button.setAttribute('aria-label',`${EQUIPMENT_SLOTS[slot].name}: ${item?itemDisplayName(item.name)+' · '+itemClassName(itemShownClass(item))+' · '+itemBonus(item):'Пусто'}`);setIcon(nodes.icon,slot,item?.classId||p.classId,item,p.weapon);
      paintItemClass(nodes.button,item,p.classId);
    }
    write($('bag-count'),`${usage} / ${capacity}`);
    const overflowIds=bagOccupants(p).filter(id=>!layout.includes(id));
    ensureBagCells(Math.max(capacity,layout.length+overflowIds.length));
    bagNodes.forEach((nodes,index)=>{
      const occupant=index<layout.length?layout[index]:overflowIds[index-layout.length],item=occupant?p.items.find(value=>value.id===occupant):undefined,stack=occupant&&!item?p.consumableInventory.find(value=>value.id===occupant):undefined,definition=stack&&consumableDefinition(stack.definitionId);
      nodes.button.dataset.itemId=item?.id||'';nodes.button.dataset.consumableId=stack?.id||'';nodes.button.dataset.consumableDefinition=stack?.definitionId||'';nodes.button.dataset.bagIndex=String(index);
      nodes.button.className=`bag-cell${item?' rarity-'+(item.rarity||0):stack?' consumable-cell':' empty'}`;
      nodes.button.setAttribute('aria-label',item?`${itemDisplayName(item.name)} · ${itemClassName(itemShownClass(item))}, ${itemBonus(item)}`:stack?`${definition?.name||'Зелье'}, ${stack.quantity} шт. Перетащите на Q или W`:`Пустая ячейка ${index+1}`);nodes.button.disabled=false;
      if(item){nodes.icon.hidden=false;setIcon(nodes.icon,item.slot,item.classId||p.classId,item);paintItemClass(nodes.button,item,p.classId);}else if(stack&&definition){paintItemClass(nodes.button,undefined,p.classId);const tier=consumableTier(definition.id);nodes.icon.hidden=false;nodes.icon.dataset.icon='';nodes.icon.innerHTML=`<span class="potion-icon consumable-tier-${tier.rank}"></span><b class="stack-count"></b>`;nodes.icon.querySelector('.potion-icon')!.innerHTML=consumableArtwork(definition);nodes.icon.querySelector('.stack-count')!.textContent=String(stack.quantity);}else{paintItemClass(nodes.button,undefined,p.classId);nodes.icon.hidden=true;nodes.icon.dataset.icon='';}
    });
    renderBagExpand();
    $('claim-items').hidden=!p.pendingItems?.length;write($('claim-items'),`Забрать ожидающие вещи · ${p.pendingItems?.length||0}`);$('claim-items').disabled=!canReset()||usage>=capacity;
  }
  function onEvent(event:WorldEvent){
    interactions.onEvent(event);
    if(event.type!=='statResult')return;
    const message=event.message||(event.ok?'Характеристики сохранены.':'Не удалось применить статы.');clearDraft(message);toast(message);updateStats();
  }
  function update(){
    const p=game.player,c=CLASSES[p.classId];if(!c)return;
    const maxed=p.level>=MAX_LEVEL;
    write($('hero-name'),`${p.name} · ${c.name} ${p.level}`);write($('hud-xp-text'),maxed?'Макс. уровень':`${p.xp} / ${p.xpNeeded} XP`);
    $('hud-experience').setAttribute('aria-valuemax',String(maxed?1:p.xpNeeded));$('hud-experience').setAttribute('aria-valuenow',String(maxed?1:p.xp));
    write($('mana-text'),`${Math.floor(p.mana||0)} / ${p.maxMana||0}`);$('mana-fill').style.height=`${clampRatio(p.mana,p.maxMana)*100}%`;
    $('mana-orb').setAttribute('aria-valuemax',String(p.maxMana||0));$('mana-orb').setAttribute('aria-valuenow',String(Math.floor(p.mana||0)));$('hud-xp-fill').style.transform=`scaleX(${maxed?1:clampRatio(p.xp,p.xpNeeded)})`;
    for(const [index,buttonId] of (['special','skill-secondary','skill-tertiary','skill-quaternary','skill-mouse'] as const).entries()){
      const button=$(buttonId),skillId=p.skillBuild?.slots[index]??null,base=skillId?SKILLS[skillId]:undefined,skill=base?effectiveSkill(p,base.id):undefined,rawRemaining=skill?p.skillCooldowns?.[skill.id]??0:0,remaining=Number.isFinite(rawRemaining)?Math.max(0,rawRemaining):0;
      if(button.dataset.skill!==(skill?.id||'')){button.querySelector('.skill-sigil')!.innerHTML=skill?actionIcon(skill.id):'';button.dataset.skill=skill?.id||'';}
      write(button.querySelector('kbd')!,index===4?'ПКМ':index+1);button.style.setProperty('--cooldown',`${skill&&skill.cooldown>0?Math.min(1,remaining/skill.cooldown)*100:0}%`);
      write(button.querySelector('.skill-name')!,skill?.name||'Пустой слот');write(button.querySelector('.skill-meta')!,skill?(remaining>0?`${remaining.toFixed(1)}с`:`${skill.manaCost} маны`):'Книга · K');
      button.disabled=!skill||!game.connected||!!p.dead||!!p.attack||safe(p)||remaining>0||p.mana<skill.manaCost;
      button.title=skill?`${skill.name} · ${index===4?'ПКМ':index+1} · ${skill.manaCost} маны${skill.cooldown>0?` · откат ${skill.cooldown}с`:''}\n${skill.description}`:`Слот ${index===4?'ПКМ':index+1} пуст · откройте книгу навыков клавишей K`;
      button.setAttribute('aria-label',button.title);
    }
    if($('attack').dataset.classId!==p.classId){$('attack').dataset.classId=p.classId;$('attack').querySelector('.attack-icon')!.innerHTML=actionIcon(p.classId);}
    for(const [id,selector,key] of [['potion','.potion-icon','potion'],['mana-potion','.potion-icon','mana-potion'],['character-toggle','.shortcut-icon','character'],['inventory-toggle','.shortcut-icon','inventory']]){const icon=$(id).querySelector(selector)!;if(!icon.childElementCount)icon.innerHTML=actionIcon(key);}
    write($('unspent-badge'),p.unspentPoints||0);$('unspent-badge').hidden=!p.unspentPoints;$('character-toggle').title=`Характеристики · C${p.unspentPoints?` · ${p.unspentPoints} свободных очков`:''}`;
    $('connection').title=!game.connected?'Восстанавливаем соединение…':!game.save?.ok?'Ошибка сохранения — оставьте игру открытой':game.save?.at?'Прогресс сохранён на сервере':'Сохраняем героя…';
    updateStats();updateInventory();interactions.update();
  }
  return {join,update,isPanelOpen,onEvent};
}
