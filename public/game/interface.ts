import {skillsForClass} from './skills.js';
import {actionIcon} from './action-icons.js';
import {bindInventoryInteractions} from './inventory-interactions.js';
import {sellPrice} from './shop.js';
import {renderItemRolls} from './item-details.js';
import {CLASSES,EQUIPMENT_SLOTS,BAG_CAPACITY,backpackItems,canEquip,itemBonus,STAT_KEYS,STAT_DEFINITIONS,CLASS_PROGRESSION,characterStats} from '../rules.js';
import {safe} from './location.js';
import {itemIcon,itemArtwork,itemArtKey,heroSilhouette} from './item-icons.js';
import {element as $,errorMessage} from './ui-types.js';
import type {NetworkGame} from './network.js';
import type {Attributes,ClassId,EquipmentSlot,StatKey,WorldEvent,Item,WeaponId} from '../../shared/types.js';
type PanelName='character'|'inventory';
type StatNodes={row:HTMLDivElement;description:HTMLElement;number:HTMLSpanElement;gain:HTMLElement;value:HTMLDivElement;minus:HTMLButtonElement;plus:HTMLButtonElement};
type DerivedStat='attack'|'armor'|'hitChance'|'damageReduction'|'maxHp'|'hpRegen'|'maxMana'|'manaRegen'|'attackSpeed';
type DerivedNodes={before:HTMLSpanElement;arrow:HTMLSpanElement;after:HTMLSpanElement;formatter:(value:number)=>string};
type SlotNodes={button:HTMLButtonElement;icon:HTMLSpanElement};
type BagNodes=SlotNodes;
const panelNames:PanelName[]=['character','inventory'];
const classId=(value:string):ClassId=>value==='archer'||value==='mage'?value:'warrior';
const write=(node:HTMLElement,value:unknown)=>{const text=String(value);if(node.textContent!==text)node.textContent=text;};
const emptyDraft=():Attributes=>({strength:0,dexterity:0,vitality:0,energy:0});
const total=(points:Partial<Attributes>|undefined)=>STAT_KEYS.reduce((sum,key)=>sum+(points?.[key]||0),0);
const displayNumber=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});
const displayRegen=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:3});
const format=(value:number)=>displayNumber.format(value);
const percent=(value:number)=>`${format(Math.round(value*1000)/10)}%`;
const clampRatio=(value:number,max:number)=>Math.max(0,Math.min(1,max?value/max:1));
const rarityNames=['Обычный предмет','Необычный предмет','Редкий предмет'];

export function bindInterface(game:NetworkGame,toast:(message:string)=>void,clearInput:()=>void){
  let inventoryKey='',statsKey='',selectedItemId:string|null=null,draft=emptyDraft(),draftOwner='',pending:{revision:number;classId:ClassId;sentAt:number}|null=null,statusMessage='',lastPanel:PanelName='character';
  const compact=matchMedia('(max-width: 900px)'),panels={character:$('character-panel'),inventory:$('inventory-panel')};
  const statNodes=new Map<StatKey,StatNodes>(),derivedNodes=new Map<DerivedStat,DerivedNodes>(),slotNodes=new Map<EquipmentSlot,SlotNodes>(),bagNodes:BagNodes[]=[];
  const isPanelOpen=()=>!panels.character.hidden||!panels.inventory.hidden;
  const canEdit=()=>game.connected&&safe(game.player)&&!game.player.dead&&!game.player.attack&&(game.player.combatUntil||0)<=(game.serverTime||0);
  function syncPanels(){
    const open=isPanelOpen();document.body.classList.toggle('panel-open',open);
    $('character-toggle').setAttribute('aria-expanded',String(!panels.character.hidden));$('inventory-toggle').setAttribute('aria-expanded',String(!panels.inventory.hidden));
    if(open)clearInput();
  }
  function openPanel(name:PanelName){
    lastPanel=name;if(compact.matches)Object.values(panels).forEach(panel=>{panel.hidden=true;});
    panels[name].hidden=false;syncPanels();update();$(name+'-close').focus({preventScroll:true});
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
    ['maxHp','Здоровье',format],['hpRegen','HP вне боя',value=>`${displayRegen.format(value)} / с`],['maxMana','Мана',format],['manaRegen','Реген. маны',value=>`${displayRegen.format(value)} / с`]
  ];
  for(const [key,label,formatter] of derivedDefinitions){
    const cell=document.createElement('div'),term=document.createElement('dt'),value=document.createElement('dd');cell.className='derived-stat';term.textContent=label;
    const before=document.createElement('span'),arrow=document.createElement('span'),after=document.createElement('span');arrow.className='arrow';arrow.textContent='→';after.className='after';value.append(before,arrow,after);cell.append(term,value);$('derived-stats').append(cell);derivedNodes.set(key,{before,arrow,after,formatter});
  }
  $('stat-cancel').onclick=()=>{if(!pending){clearDraft();updateStats();}};
  function sendStatCommand(type:'allocateStats'|'resetStats',extra?:{points:Attributes}){
    if(pending||!canEdit())return;
    pending={revision:game.player.statRevision,classId:game.player.classId,sentAt:performance.now()};statusMessage='';
    if(type==='allocateStats'){if(!extra){pending=null;return;}game.send({type,revision:pending.revision,points:extra.points});}
    else game.send({type,revision:pending.revision});statsKey='';$('reset-confirm').hidden=true;updateStats();
  }
  $('stat-apply').onclick=()=>{if(total(draft)>0)sendStatCommand('allocateStats',{points:{...draft}});};
  $('reset-stats').onclick=()=>{$('reset-confirm').hidden=false;$('reset-confirm-yes').focus({preventScroll:true});};
  $('reset-confirm-no').onclick=()=>{$('reset-confirm').hidden=true;$('reset-stats').focus({preventScroll:true});};
  $('reset-confirm-yes').onclick=()=>sendStatCommand('resetStats');
  $('claim-items').onclick=()=>{if(canEdit())game.send({type:'claim'});};
  $('copy-key').onclick=async()=>{try{await navigator.clipboard.writeText(game.token);toast('Ключ героя скопирован. Храните его как пароль.');}catch{toast('Копирование требует localhost или HTTPS');}};

  $('equipment-figure').innerHTML=heroSilhouette;
  for(const [slot,info] of Object.entries(EQUIPMENT_SLOTS) as [EquipmentSlot,typeof EQUIPMENT_SLOTS[EquipmentSlot]][]){
    const button=document.createElement('button'),icon=document.createElement('span'),caption=document.createElement('small');
    button.type='button';button.className='equipment-slot';button.dataset.slot=slot;caption.className='slot-caption';caption.textContent=info.name;
    button.append(icon,caption);button.onclick=()=>{const id=game.player.equipment[slot];if(id){selectedItemId=id;inventoryKey='';updateInventory();$('item-detail').scrollIntoView({block:'nearest'});}};
    $('equipment-slots').append(button);slotNodes.set(slot,{button,icon});
  }
  for(let index=0;index<BAG_CAPACITY;index++){
    const button=document.createElement('button'),icon=document.createElement('span');
    button.type='button';button.className='bag-cell empty';button.append(icon);
    button.onclick=()=>{if(button.dataset.itemId){selectedItemId=button.dataset.itemId;inventoryKey='';updateInventory();$('item-detail').scrollIntoView({block:'nearest'});}};
    $('bag-items').append(button);bagNodes.push({button,icon});
  }
  const selectedItem=()=>game.player.items.find(item=>item.id===selectedItemId);
  $('item-equip').onclick=()=>{const item=selectedItem();if(item&&canEdit()&&canEquip(game.player,item))game.send({type:game.player.equipment[item.slot]===item.id?'unequip':'equip',id:item.id});};
  const interactions=bindInventoryInteractions(game,toast,()=>{panels.character.hidden=true;openPanel('inventory');});
  $('item-sell').onclick=()=>{const item=selectedItem();if(item)interactions.sell(item);};
  function setIcon(element:HTMLElement,slot:EquipmentSlot,classId:ClassId,item?:Item,weapon:WeaponId='sword'){const key=item?'art:'+itemArtKey(item,classId,weapon):slot+':'+classId;if(element.dataset.icon!==key){element.innerHTML=item?itemArtwork(item,classId,weapon):itemIcon(slot,classId);element.dataset.icon=key;}}
  game.onStatus=(status,message)=>{
    write($('connection'),status==='online'?`${game.players.filter(p=>p.connected).length} в мире`:message);
    $('connection').classList.toggle('offline',status!=='online');
    if(status!=='online'){clearInput();if(pending||total(draft))clearDraft(status==='error'?message:'Соединение потеряно. Распределение не отправлялось повторно.');write($('save-status'),message);}
  };
  game.onChat=(entries,replace=false)=>{
    if(replace)$('chat-lines').replaceChildren();
    for(const entry of entries){const row=document.createElement('p'),name=document.createElement('b');name.textContent=entry.name+': ';row.append(name,document.createTextNode(entry.text));$('chat-lines').append(row);}
    while($('chat-lines').children.length>40)$('chat-lines').firstChild?.remove();$('chat-lines').scrollTop=$('chat-lines').scrollHeight;
  };
  $('chat-form').onsubmit=e=>{e.preventDefault();const text=$('chat-input').value.trim();if(text&&game.connected){game.send({type:'chat',text});$('chat-input').value='';$('scene').focus();}};
  $('chat-input').onfocus=clearInput;
  addEventListener('keydown',event=>{
    if(event.metaKey||event.ctrlKey||event.altKey||event.repeat)return;
    if(event.code==='Escape'&&isPanelOpen()){event.preventDefault();Object.values(panels).forEach(panel=>{panel.hidden=true;});syncPanels();$('scene').focus();return;}
    if(['INPUT','SELECT','TEXTAREA'].includes((document.activeElement?.tagName||'')))return;
    if(event.code==='KeyI'){event.preventDefault();togglePanel('inventory');}
    if(event.code==='KeyC'){event.preventDefault();togglePanel('character');}
    if(event.code==='Enter'&&!isPanelOpen()&&(document.activeElement?.tagName||'')!=='BUTTON'){event.preventDefault();$('chat-input').focus();}
  });
  async function join(){
    const stored=game.storage.getItem(game.tokenKey);
    if(stored){try{await game.connect({token:stored});return;}catch(error){$('join-error').textContent=errorMessage(error);}}
    $('join-panel').hidden=false;$('join-name').value=localStorage.getItem('frontier-name')||'Странник';
    await new Promise<void>(resolve=>{
      $('join-form').onsubmit=async event=>{
        event.preventDefault();$('join-submit').disabled=true;$('join-error').textContent='';
        try{await game.connect({name:$('join-name').value.trim(),classId:classId($('join-class').value),token:$('join-key').value.trim()});$('join-panel').hidden=true;resolve();}
        catch(error){$('join-error').textContent=errorMessage(error);}
        finally{$('join-submit').disabled=false;}
      };
    });
  }
  function updateStats(){
    const p=game.player,c=CLASSES[p.classId];if(!c)return;
    const owner=`${game.id}:${p.classId}:${p.statRevision}`;
    if(owner!==draftOwner){clearDraft(draftOwner?'Характеристики обновлены.':'');draftOwner=owner;}
    if(pending&&performance.now()-pending.sentAt>8000)clearDraft('Ответ задержался. Проверьте значения перед повторным распределением.');
    if(panels.character.hidden)return;
    const editable=canEdit();
    const key=JSON.stringify([p.classId,p.name,p.level,p.xp,p.xpNeeded,p.allocatedStats,p.statRevision,p.equipment,p.items,p.unspentPoints,editable,draft,pending,statusMessage]);
    if(key===statsKey)return;statsKey=key;
    const current=characterStats(p),proposed:Attributes={...p.allocatedStats};
    for(const stat of STAT_KEYS)proposed[stat]+=draft[stat];
    const preview=characterStats({...p,allocatedStats:proposed}),spent=total(draft),progression=CLASS_PROGRESSION[p.classId];
    write($('character-name'),p.name);write($('character-class'),c.name);write($('character-level'),p.level);setIcon($('class-emblem'),'weapon',p.classId);
    write($('character-xp'),p.xpNeeded>0?`${p.xp} / ${p.xpNeeded} опыта`:'Максимальный уровень');$('character-xp-fill').style.transform=`scaleX(${clampRatio(p.xp,p.xpNeeded)})`;
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
    const message=pending?'Ждём подтверждения сервера…':!game.connected?'Нет соединения. Ожидаем общий мир.':!editable?'Распределение доступно у костра, вне боя.':statusMessage|| (spent?'Зелёным показаны будущие значения.':p.unspentPoints>0?'Выберите статы и примените очки.':'Следующий уровень принесёт 5 очков.');
    write($('stat-status'),message);$('stat-status').classList.toggle('pending',!!pending);
    $('reset-stats').disabled=!editable||!!pending||!total(p.allocatedStats);$('reset-confirm-yes').disabled=!editable||!!pending;
  }
  function updateInventory(){
    if(panels.inventory.hidden)return;
    const p=game.player,c=CLASSES[p.classId];if(!c)return;
    const editable=canEdit(),wornIds=Object.values(p.equipment),bag=backpackItems(p),key=JSON.stringify([p.items,p.pendingItems,p.equipment,p.weapon,p.classId,p.level,p.gold,editable,interactions.canTrade(),selectedItemId]);if(key===inventoryKey)return;inventoryKey=key;
    if(!p.items.some(item=>item.id===selectedItemId))selectedItemId=p.equipment.weapon||p.items[0]?.id||null;
    write($('hero-details'),`${c.name} · уровень ${p.level} · 6 слотов снаряжения`);write($('inventory-gold'),`${p.gold} золота`);write($('inventory-status'),editable?'Можно менять снаряжение':!game.connected?'Нет соединения':'Изменение у костра, вне боя');
    for(const [slot,nodes] of slotNodes){
      const item=p.items.find(value=>value.id===p.equipment[slot]);nodes.button.className=`equipment-slot${item?' rarity-'+(item.rarity||0):' empty'}${item?.id===selectedItemId?' selected':''}`;
      nodes.button.dataset.itemId=item?.id||'';nodes.button.setAttribute('aria-label',`${EQUIPMENT_SLOTS[slot].name}: ${item?item.name+' · '+itemBonus(item):'Пусто'}`);nodes.button.setAttribute('aria-pressed',String(!!item&&item.id===selectedItemId));setIcon(nodes.icon,slot,item?.classId||p.classId,item,p.weapon);
    }
    write($('bag-count'),`${bag.length} / ${BAG_CAPACITY}`);
    bagNodes.forEach((nodes,index)=>{
      const item=bag[index];nodes.button.dataset.itemId=item?.id||'';nodes.button.className=`bag-cell${item?' rarity-'+(item.rarity||0):' empty'}${item?.id===selectedItemId?' selected':''}`;
      nodes.button.setAttribute('aria-label',item?`${item.name}, ${itemBonus(item)}`:`Пустая ячейка ${index+1}`);nodes.button.setAttribute('aria-pressed',String(!!item&&item.id===selectedItemId));nodes.button.disabled=false;
      if(item){nodes.icon.hidden=false;setIcon(nodes.icon,item.slot,item.classId||p.classId,item);}else nodes.icon.hidden=true;
    });
    const item=selectedItem(),worn=item&&wornIds.includes(item.id);
    if(item){
      setIcon($('item-detail-icon'),item.slot,item.classId||p.classId,item,worn?p.weapon:'sword');$('item-detail-icon').className='item-detail-icon rarity-'+(item.rarity||0);$('item-detail-icon').hidden=false;
      write($('item-rarity'),`${rarityNames[item.rarity]||rarityNames[0]} · ${EQUIPMENT_SLOTS[item.slot].name}`);write($('item-name'),item.name);write($('item-bonus'),item.rolls?'Значения этого экземпляра':itemBonus(item));write($('item-restriction'),item.classId||item.slot==='weapon'?`Класс: ${CLASSES[item.classId||'warrior'].name}`:'Для всех классов');write($('item-worn'),worn?'◆ Надето':item.bound?'Привязано к герою':'Можно продать торговцу');
    }else{
      $('item-detail-icon').hidden=true;write($('item-rarity'),'РЮКЗАК ПУСТ');write($('item-name'),'Впереди первая добыча');write($('item-bonus'),'Предметы можно найти в опушке.');write($('item-restriction'),'');write($('item-worn'),'');
    }
    renderItemRolls($('item-rolls'),item,p.items.find(other=>other.id===p.equipment[item?.slot??'weapon']));
    $('item-equip').disabled=!item||!editable||!canEquip(p,item)||!!worn&&bag.length>=BAG_CAPACITY;$('item-equip').title=worn&&bag.length>=BAG_CAPACITY?'Освободите ячейку рюкзака, чтобы снять вещь.':'';write($('item-equip'),worn?'Снять':'Надеть');
    $('item-sell').disabled=!item||!!worn||!interactions.canTrade()||!!item.bound;write($('item-sell'),item&&!item.bound?`Продать · ${sellPrice(item)} зол.`:'Продать');
    $('claim-items').hidden=!p.pendingItems?.length;write($('claim-items'),`Забрать ожидающие вещи · ${p.pendingItems?.length||0}`);$('claim-items').disabled=!editable||bag.length>=BAG_CAPACITY;
  }
  function onEvent(event:WorldEvent){
    interactions.onEvent(event);
    if(event.type!=='statResult')return;
    const message=event.message||(event.ok?'Характеристики сохранены.':'Не удалось применить статы.');clearDraft(message);toast(message);updateStats();
  }
  function update(){
    const p=game.player,c=CLASSES[p.classId];if(!c)return;
    write($('hero-name'),`${p.name} · ${c.name} ${p.level}`);write($('xp'),p.xpNeeded>0?`${p.xp} / ${p.xpNeeded} XP`:'Макс. уровень');
    write($('mana-text'),`${Math.floor(p.mana||0)} / ${p.maxMana||0}`);$('mana-fill').style.height=`${clampRatio(p.mana,p.maxMana)*100}%`;
    $('mana-orb').setAttribute('aria-valuemax',String(p.maxMana||0));$('mana-orb').setAttribute('aria-valuenow',String(Math.floor(p.mana||0)));$('hud-xp-fill').style.transform=`scaleX(${clampRatio(p.xp,p.xpNeeded)})`;
    for(const [index,skill] of skillsForClass(p.classId).entries()){
      const button=$(index===0?'special':'skill-secondary'),remaining=p.skillCooldowns?.[skill.id]||0;
      if(button.dataset.skill!==skill.id)button.querySelector('.skill-sigil')!.innerHTML=actionIcon(skill.id);
      button.dataset.skill=skill.id;button.style.setProperty('--cooldown',`${Math.min(1,remaining/skill.cooldown)*100}%`);
      write(button.querySelector('.skill-name')!,skill.name);write(button.querySelector('.skill-meta')!,remaining>0?`${remaining.toFixed(1)}с`:`${skill.manaCost} маны`);
      button.disabled=!game.connected||!!p.dead||!!p.attack||safe(p)||remaining>0||p.mana<skill.manaCost;
      button.title=`${skill.name} · ${skill.slot} · ${skill.manaCost} маны · ${skill.cooldown}с\n${skill.description}`;
      button.setAttribute('aria-label',button.title);
    }
    if($('attack').dataset.classId!==p.classId){$('attack').dataset.classId=p.classId;$('attack').querySelector('.attack-icon')!.innerHTML=actionIcon(p.classId);}
    for(const [id,selector,key] of [['potion','.potion-icon','potion'],['character-toggle','.shortcut-icon','character'],['inventory-toggle','.shortcut-icon','inventory']]){const icon=$(id).querySelector(selector)!;if(!icon.childElementCount)icon.innerHTML=actionIcon(key);}
    document.querySelector<HTMLElement>('.weapon-controls')!.hidden=p.classId!=='warrior'||p.items.some(item=>item.id===p.equipment.weapon&&item.definitionId);write($('unspent-badge'),p.unspentPoints||0);$('unspent-badge').hidden=!p.unspentPoints;$('character-toggle').title=`Характеристики · C${p.unspentPoints?` · ${p.unspentPoints} свободных очков`:''}`;
    write($('save-status'),!game.connected?'Восстанавливаем соединение…':!game.save?.ok?'Ошибка сохранения — оставьте игру открытой':game.save?.at?'Общий мир · прогресс сохранён на сервере':'Общий мир · сохраняем героя…');
    updateStats();updateInventory();interactions.update();
  }
  return {join,update,isPanelOpen,onEvent};
}
