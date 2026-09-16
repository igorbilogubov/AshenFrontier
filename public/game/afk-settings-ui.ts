import {AFK_PICKUP_RARITIES,afkCombatRadius,defaultAfkPreferences,parseAfkPreferences} from './afk-preferences.js';
import {equippedSkills} from './skill-builds.js';
import {AFK_PICKUP_RANGE} from './loot-rules.js';
import type {NetworkGame} from './network.js';
import type {AfkPreferences,ClassId,SkillId,WorldEvent} from '../../shared/types.js';

type PendingSave={value:AfkPreferences;sentAt:number};
const rarityLabels=['Белые','Зелёные','Синие','Жёлтые','Сетовые'];
const clone=(value:AfkPreferences):AfkPreferences=>JSON.parse(JSON.stringify(value)) as AfkPreferences;
const same=(a:AfkPreferences|null,b:AfkPreferences|null)=>!!a&&!!b&&JSON.stringify(a)===JSON.stringify(b);
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,Math.round(value)));
const defaults=defaultAfkPreferences;
const validPreferences=parseAfkPreferences;

export function bindAfkSettings(game:NetworkGame,toast:(message:string)=>void){
  const toggle=document.createElement('button');toggle.id='afk-settings-toggle';toggle.type='button';toggle.title='Настройки автоохоты';toggle.setAttribute('aria-label','Настройки автоохоты');toggle.setAttribute('aria-controls','afk-settings-panel');toggle.setAttribute('aria-expanded','false');toggle.textContent='⚙';
  document.querySelector('.auxiliary-controls')?.insertBefore(toggle,document.getElementById('movement'));
  const panel=document.createElement('aside');panel.id='afk-settings-panel';panel.className='afk-settings-panel';panel.hidden=true;panel.setAttribute('aria-label','Настройки автоохоты');
  panel.innerHTML=`<div class="afk-settings-heading"><div><p class="eyebrow">НАСТРОЙКИ</p><h2>Автоохота</h2></div><button class="afk-settings-close" type="button" aria-label="Закрыть настройки автоохоты">×</button></div>
    <div class="afk-settings-scroll">
      <section><h3>Добыча</h3><label class="afk-check"><input id="afk-pickup-gold" type="checkbox"> Подбирать своё золото</label><div class="afk-rarities" role="group" aria-label="Какие свои вещи подбирать">${rarityLabels.map((label,index)=>`<label class="rarity-filter-${index}"><input id="afk-rarity-${index}" type="checkbox"> ${label}</label>`).join('')}</div><small>Своя добыча в радиусе ${AFK_PICKUP_RANGE} м по выбранным фильтрам, без схода с места. При полном рюкзаке вещи остаются на земле.</small></section>
      <section><h3>Зелья</h3><div class="afk-threshold"><label><input id="afk-hp-enabled" type="checkbox"> HP ниже</label><input id="afk-hp-threshold" type="number" min="5" max="95" step="1" inputmode="numeric" aria-label="Порог здоровья в процентах"><span>%</span></div><div class="afk-threshold"><label><input id="afk-mp-enabled" type="checkbox"> MP ниже</label><input id="afk-mp-threshold" type="number" min="5" max="95" step="1" inputmode="numeric" aria-label="Порог маны в процентах"><span>%</span></div></section>
      <section><h3>Приоритет навыков</h3><p class="afk-help">Отметьте нужные навыки и поменяйте их порядок.</p><div id="afk-skill-order" class="afk-skill-order"></div><label class="afk-check"><input id="afk-basic-attack" type="checkbox"> Обычный удар, если навыки недоступны</label></section>
      <section><h3>Радиус атак</h3><div class="afk-radius"><input id="afk-radius" type="range" min="25" max="100" step="1" aria-label="Радиус атак в процентах"><output id="afk-radius-value" for="afk-radius">100%</output></div><small id="afk-range-hint"></small></section>
    </div><div class="afk-settings-footer"><p id="afk-settings-status" role="status" aria-live="polite"></p><button id="afk-settings-save" type="button">Сохранить</button></div>`;
  document.body.append(panel);
  const field=<T extends HTMLElement>(id:string)=>panel.querySelector<T>('#'+id)!;
  const check=(id:string)=>field<HTMLInputElement>(id);
  const orderNode=field<HTMLDivElement>('afk-skill-order'),statusNode=field<HTMLParagraphElement>('afk-settings-status'),saveButton=field<HTMLButtonElement>('afk-settings-save');
  let owner='',draft:AfkPreferences|null=null,baseline:AfkPreferences|null=null,lastServer:AfkPreferences|null=null,pending:PendingSave|null=null,unconfirmed=false,status='',renderKey='';
  const isOpen=()=>!panel.hidden;
  function setStatus(message:string){status=message;statusNode.textContent=message;}
  function close(){panel.hidden=true;toggle.setAttribute('aria-expanded','false');}
  function open(){
    update();panel.hidden=false;toggle.setAttribute('aria-expanded','true');render(true);
  }
  toggle.onclick=()=>{if(isOpen())close();else open();};
  panel.querySelector<HTMLButtonElement>('.afk-settings-close')!.onclick=close;
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&isOpen()){event.preventDefault();event.stopPropagation();close();}},true);
  function setDirty(){
    const active=document.activeElement instanceof HTMLInputElement||document.activeElement instanceof HTMLButtonElement?document.activeElement:null;
    const skill=active&&orderNode.contains(active)?active.dataset.skill||active.dataset.move:null;
    const direction=active?.dataset.direction;
    unconfirmed=false;setStatus('Изменения не сохранены');render();
    if(skill){const replacement=direction?Array.from(orderNode.querySelectorAll<HTMLButtonElement>('button[data-move]')).find(button=>button.dataset.move===skill&&button.dataset.direction===direction):Array.from(orderNode.querySelectorAll<HTMLInputElement>('input[data-skill]')).find(input=>input.dataset.skill===skill);replacement?.focus({preventScroll:true});}
  }
  function renderSkills(classId:ClassId){
    if(!draft)return;
    const available=equippedSkills(game.player).filter(skill=>skill.classId===classId&&skill.kind!=='mobility'),allowed=new Set(available.map(skill=>skill.id));
    draft.skillOrder=draft.skillOrder.filter(id=>allowed.has(id));
    const selected=new Set(draft.skillOrder),ordered=[...draft.skillOrder,...available.map(skill=>skill.id).filter(id=>!selected.has(id))];
    orderNode.replaceChildren();
    if(!ordered.length){
      const empty=document.createElement('p');empty.className='afk-skills-empty';empty.textContent='Для автоохоты пока нет назначенных неподвижных навыков. Назначьте их в книге навыков (K).';orderNode.append(empty);return;
    }
    ordered.forEach(id=>{
      const skill=available.find(item=>item.id===id)!;const row=document.createElement('div');row.className='afk-skill-row';
      const label=document.createElement('label'),checkbox=document.createElement('input'),name=document.createElement('span');checkbox.type='checkbox';checkbox.checked=selected.has(id);checkbox.dataset.skill=id;name.className='afk-skill-name';name.textContent=`${game.player.skillBuild.slots.indexOf(id)+1} · ${skill.name}`;label.append(checkbox,name);
      const actions=document.createElement('span');actions.className='afk-order-actions';
      for(const [direction,caption] of [[-1,'Выше'],[1,'Ниже']] as const){const button=document.createElement('button');button.type='button';button.textContent=direction<0?'↑':'↓';button.title=`${caption}: ${skill.name}`;button.setAttribute('aria-label',button.title);button.dataset.move=id;button.dataset.direction=String(direction);const index=draft!.skillOrder.indexOf(id);button.disabled=index<0||index+direction<0||index+direction>=draft!.skillOrder.length;actions.append(button);}
      row.append(label,actions);orderNode.append(row);
    });
  }
  function render(force=false){
    if(!draft)return;
    const key=JSON.stringify([owner,draft,baseline,pending?.value,unconfirmed,status,game.connected,game.player.skillBuild]);if(!force&&key===renderKey)return;renderKey=key;
    check('afk-pickup-gold').checked=draft.pickupGold;
    for(let rarity=0;rarity<rarityLabels.length;rarity++)check('afk-rarity-'+rarity).checked=draft.pickupRarities.includes(rarity);
    check('afk-hp-enabled').checked=draft.hpPotion.enabled;check('afk-mp-enabled').checked=draft.manaPotion.enabled;
    if(document.activeElement!==check('afk-hp-threshold'))check('afk-hp-threshold').value=String(draft.hpPotion.belowPercent);
    if(document.activeElement!==check('afk-mp-threshold'))check('afk-mp-threshold').value=String(draft.manaPotion.belowPercent);
    check('afk-hp-threshold').disabled=!draft.hpPotion.enabled;check('afk-mp-threshold').disabled=!draft.manaPotion.enabled;
    check('afk-basic-attack').checked=draft.basicAttackFallback;
    check('afk-radius').value=String(draft.radiusPercent);field<HTMLOutputElement>('afk-radius-value').value=`${draft.radiusPercent}%`;
    field<HTMLElement>('afk-range-hint').textContent=`Выбор целей до ${afkCombatRadius(draft,game.player.range).toFixed(1)} м от места включения. Дальность зависит от выбранных атак; герой не преследует мобов.`;
    renderSkills(game.player.classId);
    saveButton.disabled=!game.connected||!!pending||same(draft,baseline)&&!unconfirmed;
    saveButton.textContent=pending?'Сохраняем…':'Сохранить';statusNode.textContent=status;
  }
  panel.addEventListener('change',event=>{
    if(!draft)return;const target=event.target;if(!(target instanceof HTMLInputElement))return;
    if(target.id==='afk-pickup-gold')draft.pickupGold=target.checked;
    else if(target.id.startsWith('afk-rarity-'))draft.pickupRarities=AFK_PICKUP_RARITIES.filter(index=>check('afk-rarity-'+index).checked);
    else if(target.id==='afk-hp-enabled')draft.hpPotion.enabled=target.checked;
    else if(target.id==='afk-mp-enabled')draft.manaPotion.enabled=target.checked;
    else if(target.id==='afk-hp-threshold')draft.hpPotion.belowPercent=clamp(Number(target.value)||draft.hpPotion.belowPercent,5,95);
    else if(target.id==='afk-mp-threshold')draft.manaPotion.belowPercent=clamp(Number(target.value)||draft.manaPotion.belowPercent,5,95);
    else if(target.id==='afk-basic-attack')draft.basicAttackFallback=target.checked;
    else if(target.id==='afk-radius')draft.radiusPercent=clamp(Number(target.value),25,100);
    else if(target.dataset.skill){const id=target.dataset.skill as SkillId;draft.skillOrder=target.checked?[...draft.skillOrder,id]:draft.skillOrder.filter(value=>value!==id);}
    else return;
    setDirty();
  });
  panel.addEventListener('input',event=>{
    const target=event.target;if(!draft||!(target instanceof HTMLInputElement)||!target.value)return;
    const value=Number(target.value);if(!Number.isInteger(value))return;
    if(target.id==='afk-radius'){draft.radiusPercent=clamp(value,25,100);}
    else if(value>=5&&value<=95&&target.id==='afk-hp-threshold')draft.hpPotion.belowPercent=value;
    else if(value>=5&&value<=95&&target.id==='afk-mp-threshold')draft.manaPotion.belowPercent=value;
    else return;
    setDirty();
  });
  orderNode.addEventListener('click',event=>{
    if(!draft)return;const target=event.target;if(!(target instanceof HTMLButtonElement)||!target.dataset.move)return;
    const index=draft.skillOrder.indexOf(target.dataset.move as SkillId),next=index+Number(target.dataset.direction);if(index<0||next<0||next>=draft.skillOrder.length)return;
    [draft.skillOrder[index],draft.skillOrder[next]]=[draft.skillOrder[next],draft.skillOrder[index]];setDirty();
  });
  saveButton.onclick=()=>{
    if(!draft||!game.connected||pending)return;
    const value=clone(draft);pending={value,sentAt:performance.now()};unconfirmed=false;setStatus('Ждём подтверждение сервера…');render();
    game.send({type:'afkPreferences',preferences:value});
  };
  function snapshot():AfkPreferences|null{return validPreferences(game.player.afkPreferences,game.player.classId);}
  function update(){
    const identity=`${game.player.id}:${game.player.classId}`,server=snapshot();
    if(identity!==owner){owner=identity;baseline=server||defaults(game.player.classId);draft=clone(baseline);lastServer=server;pending=null;unconfirmed=false;setStatus(server?'':'Настройки загрузятся после подключения.');renderKey='';}
    else if(server&&!same(server,lastServer)){
      lastServer=server;
      if(!pending&&same(draft,baseline)){baseline=server;draft=clone(server);}
      else baseline=server;
      renderKey='';
    }
    if(pending&&performance.now()-pending.sentAt>8000){
      const matched=server&&same(server,pending.value);pending=null;unconfirmed=!!matched;
      if(matched){baseline=server;setStatus('Состояние сервера совпадает, но ответ не получен. Можно повторить сохранение.');}
      else setStatus('Ответ сервера не получен. Повторите сохранение.');
      renderKey='';
    }
    if(isOpen())render();
  }
  function onEvent(event:WorldEvent){
    const result=event as unknown as {type:string;ok?:boolean;message?:string;owner?:string};if(result.type!=='preferencesSaved'||result.owner&&result.owner!==game.player.id)return;
    if(!pending){if(unconfirmed&&result.ok){unconfirmed=false;setStatus('Настройки сохранены');renderKey='';render();}return;}
    const value=pending.value;pending=null;unconfirmed=false;
    if(result.ok){baseline=value;setStatus(same(draft,value)?'Настройки сохранены':'Предыдущие изменения сохранены; новые ещё нет.');toast('Настройки автоохоты сохранены');}
    else {unconfirmed=true;setStatus(result.message||'Сервер отклонил настройки. Проверьте значения и повторите.');}
    renderKey='';render();
  }
  return {update,onEvent,isOpen};
}
