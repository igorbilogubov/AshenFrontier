import {CLASSES,EQUIPMENT_SLOTS,BAG_CAPACITY,canEquip,itemBonus} from '../rules.js';
import {safe} from './location.js';
const $=id=>document.getElementById(id);
export function bindInterface(game,toast,clearInput){
  let inventoryKey='';
  const toggleInventory=()=>{$('inventory-panel').hidden=!$('inventory-panel').hidden;clearInput();};
  $('inventory-toggle').onclick=toggleInventory;$('inventory-close').onclick=toggleInventory;
  $('change-class').onchange=()=>game.send({type:'class',classId:$('change-class').value});
  $('claim-items').onclick=()=>game.send({type:'claim'});
  $('copy-key').onclick=async()=>{try{await navigator.clipboard.writeText(game.token);toast('Ключ героя скопирован. Храните его как пароль.');}catch{toast('Копирование требует localhost или HTTPS');}};
  game.onStatus=(status,message)=>{
    $('connection').textContent=status==='online'?`${game.players.filter(p=>p.connected).length} в мире`:message;
    $('connection').classList.toggle('offline',status!=='online');
    if(status!=='online'){clearInput();$('save-status').textContent=message;}
  };
  game.onChat=(entries,replace=false)=>{
    if(replace)$('chat-lines').replaceChildren();
    for(const entry of entries){const row=document.createElement('p'),name=document.createElement('b');name.textContent=entry.name+': ';row.append(name,document.createTextNode(entry.text));$('chat-lines').append(row);}
    while($('chat-lines').children.length>40)$('chat-lines').firstChild.remove();$('chat-lines').scrollTop=$('chat-lines').scrollHeight;
  };
  $('chat-form').onsubmit=e=>{e.preventDefault();const text=$('chat-input').value.trim();if(text&&game.connected){game.send({type:'chat',text});$('chat-input').value='';$('scene').focus();}};
  $('chat-input').onfocus=clearInput;
  addEventListener('keydown',e=>{
    if(e.metaKey||e.ctrlKey||e.altKey||e.repeat||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;
    if(e.code==='KeyI'){e.preventDefault();toggleInventory();}
    if(e.code==='Enter'){e.preventDefault();$('chat-input').focus();}
    if(e.code==='Escape'){$('inventory-panel').hidden=true;$('scene').focus();}
  });
  async function join(){
    const stored=game.storage.getItem(game.tokenKey);
    if(stored){try{await game.connect({token:stored});return;}catch(error){$('join-error').textContent=error.message;}}
    $('join-panel').hidden=false;$('join-name').value=localStorage.getItem('frontier-name')||'Странник';
    await new Promise(resolve=>{
      $('join-form').onsubmit=async e=>{
        e.preventDefault();$('join-submit').disabled=true;$('join-error').textContent='';
        try{await game.connect({name:$('join-name').value.trim(),classId:$('join-class').value,token:$('join-key').value.trim()});$('join-panel').hidden=true;resolve();}
        catch(error){$('join-error').textContent=error.message;}
        finally{$('join-submit').disabled=false;}
      };
    });
  }
  function update(){
    const p=game.player,c=CLASSES[p.classId];if(!c)return;
    $('hero-name').textContent=`${p.name} · ${c.name} ${p.level}`;$('xp').textContent=`${p.xp} / ${p.xpNeeded} опыта`;
    const special=$('special');special.textContent=p.specialCooldown>0?`${c.special} ${Math.ceil(p.specialCooldown)}с`:`${c.special} · Q`;special.disabled=!game.connected||!!p.dead||p.specialCooldown>0;
    document.querySelector('.weapon-controls').hidden=p.classId!=='warrior';
    $('save-status').textContent=!game.connected?'Восстанавливаем соединение…':!game.save?.ok?'Ошибка сохранения — оставьте игру открытой':game.save?.at?'Общий мир · прогресс сохранён на сервере':'Общий мир · сохраняем героя…';
    if($('inventory-panel').hidden)return;
    const key=JSON.stringify([p.items,p.pendingItems,p.equipment,p.classId,p.level,p.gold,safe(p),p.dead,game.connected]);if(key===inventoryKey)return;inventoryKey=key;
    const editable=game.connected&&safe(p)&&!p.dead;
    $('hero-details').textContent=`${c.name} · уровень ${p.level} · ${p.gold} золота${editable?'':' · изменение вещей у костра'}`;
    $('change-class').value=p.classId;$('change-class').disabled=!editable;
    $('equipment-slots').replaceChildren();
    for(const [slot,info] of Object.entries(EQUIPMENT_SLOTS)){
      const item=p.items.find(i=>i.id===p.equipment[slot]),cell=document.createElement('div'),label=document.createElement('small'),name=document.createElement('span');
      label.textContent=info.name;name.textContent=item?item.name:'Пусто';cell.append(label,name);$('equipment-slots').append(cell);
    }
    $('bag-count').textContent=`${p.items.length}/${BAG_CAPACITY}`;$('bag-items').replaceChildren();
    for(const item of p.items){
      const row=document.createElement('div');row.className='bag-item';const label=document.createElement('div'),name=document.createElement('b'),description=document.createElement('small');
      name.textContent=item.name;description.textContent=itemBonus(item);label.append(name,description);row.append(label);
      const worn=Object.values(p.equipment).includes(item.id),equip=document.createElement('button');equip.textContent=worn?'Надето':'Надеть';equip.disabled=worn||!editable||!canEquip(p,item);equip.onclick=()=>game.send({type:'equip',id:item.id});row.append(equip);
      if(!item.bound){const sell=document.createElement('button');sell.textContent='Продать';sell.disabled=worn||!editable;sell.onclick=()=>game.send({type:'sell',id:item.id});row.append(sell);}
      $('bag-items').append(row);
    }
    $('claim-items').hidden=!p.pendingItems?.length;$('claim-items').textContent=`Забрать ожидающие вещи (${p.pendingItems?.length||0})`;$('claim-items').disabled=!editable||p.items.length>=BAG_CAPACITY;
  }
  return {join,update};
}
