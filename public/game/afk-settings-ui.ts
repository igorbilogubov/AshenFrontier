import {skillsForClass} from './skills.js';
import type {NetworkGame} from './network.js';
import type {ClassId,ClientMessage,SkillId,WorldEvent} from '../../shared/types.js';

/** The server owns this persistent contract; the panel keeps a draft between snapshots. */
interface AfkPreferences {
  pickupGold:boolean;
  pickupRarities:number[];
  hpPotion:{enabled:boolean;belowPercent:number};
  manaPotion:{enabled:boolean;belowPercent:number};
  skillOrder:SkillId[];
  basicAttackFallback:boolean;
  radiusPercent:number;
}
type PendingSave={value:AfkPreferences;sentAt:number};
const rarityLabels=['Белые','Зелёные','Синие'];
const clone=(value:AfkPreferences):AfkPreferences=>JSON.parse(JSON.stringify(value)) as AfkPreferences;
const same=(a:AfkPreferences|null,b:AfkPreferences|null)=>!!a&&!!b&&JSON.stringify(a)===JSON.stringify(b);
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,Math.round(value)));
const allSkills=(classId:ClassId)=>skillsForClass(classId).map(skill=>skill.id);
const defaults=(classId:ClassId):AfkPreferences=>({pickupGold:true,pickupRarities:[0,1,2],hpPotion:{enabled:true,belowPercent:35},manaPotion:{enabled:true,belowPercent:25},skillOrder:allSkills(classId).slice(0,2),basicAttackFallback:true,radiusPercent:100});
function validPreferences(value:unknown,classId:ClassId):AfkPreferences|null {
  if(!value||typeof value!=='object')return null;
  const source=value as Partial<AfkPreferences>,skills=allSkills(classId),hp=source.hpPotion,mp=source.manaPotion;
  if(typeof source.pickupGold!=='boolean'||!Array.isArray(source.pickupRarities)||!hp||typeof hp.enabled!=='boolean'||!Number.isFinite(hp.belowPercent)||!mp||typeof mp.enabled!=='boolean'||!Number.isFinite(mp.belowPercent)||!Array.isArray(source.skillOrder)||typeof source.basicAttackFallback!=='boolean'||!Number.isFinite(source.radiusPercent))return null;
  const rarities=[...new Set(source.pickupRarities.filter((value):value is number=>Number.isInteger(value)&&value>=0&&value<=2))].sort(),order=[...new Set(source.skillOrder.filter((value):value is SkillId=>skills.includes(value as SkillId)))];
  return {pickupGold:source.pickupGold,pickupRarities:rarities,hpPotion:{enabled:hp.enabled,belowPercent:clamp(hp.belowPercent,5,95)},manaPotion:{enabled:mp.enabled,belowPercent:clamp(mp.belowPercent,5,95)},skillOrder:order,basicAttackFallback:source.basicAttackFallback,radiusPercent:clamp(source.radiusPercent as number,25,100)};
}

export function bindAfkSettings(game:NetworkGame,toast:(message:string)=>void){
  const toggle=document.createElement('button');toggle.id='afk-settings-toggle';toggle.type='button';toggle.title='Настройки автоохоты';toggle.setAttribute('aria-label','Настройки автоохоты');toggle.setAttribute('aria-controls','afk-settings-panel');toggle.setAttribute('aria-expanded','false');toggle.textContent='⚙';
  document.querySelector('.auxiliary-controls')?.insertBefore(toggle,document.getElementById('movement'));
  const panel=document.createElement('aside');panel.id='afk-settings-panel';panel.className='afk-settings-panel';panel.hidden=true;panel.setAttribute('aria-label','Настройки автоохоты');
  panel.innerHTML=`<div class="afk-settings-heading"><div><p class="eyebrow">НАСТРОЙКИ</p><h2>Автоохота</h2></div><button class="afk-settings-close" type="button" aria-label="Закрыть настройки автоохоты">×</button></div>
    <div class="afk-settings-scroll">
      <section><h3>Добыча</h3><label class="afk-check"><input id="afk-pickup-gold" type="checkbox"> Подбирать своё золото</label><div class="afk-rarities" role="group" aria-label="Какие свои вещи подбирать"><label><input id="afk-rarity-0" type="checkbox"> Белые</label><label><input id="afk-rarity-1" type="checkbox"> Зелёные</label><label><input id="afk-rarity-2" type="checkbox"> Синие</label></div><small>Только своя добыча в радиусе охоты; при полном рюкзаке вещи остаются на земле.</small></section>
      <section><h3>Зелья</h3><div class="afk-threshold"><label><input id="afk-hp-enabled" type="checkbox"> HP ниже</label><input id="afk-hp-threshold" type="number" min="5" max="95" step="1" inputmode="numeric" aria-label="Порог здоровья в процентах"><span>%</span></div><div class="afk-threshold"><label><input id="afk-mp-enabled" type="checkbox"> MP ниже</label><input id="afk-mp-threshold" type="number" min="5" max="95" step="1" inputmode="numeric" aria-label="Порог маны в процентах"><span>%</span></div></section>
      <section><h3>Приоритет навыков</h3><p class="afk-help">Отметьте нужные навыки и поменяйте их порядок.</p><div id="afk-skill-order" class="afk-skill-order"></div><label class="afk-check"><input id="afk-basic-attack" type="checkbox"> Обычный удар, если навыки недоступны</label></section>
      <section><h3>Радиус охоты</h3><div class="afk-radius"><input id="afk-radius" type="range" min="25" max="100" step="1" aria-label="Радиус охоты в процентах"><output id="afk-radius-value" for="afk-radius">100%</output></div><small>Доля разрешённого расстояния от спота. 100% — полный радиус.</small></section>
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
    for(const id of ['character','inventory']){const other=document.getElementById(id+'-panel');if(other&&!other.hasAttribute('hidden'))document.getElementById(id+'-close')?.click();}
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
    const selected=new Set(draft.skillOrder),available=skillsForClass(classId),ordered=[...draft.skillOrder,...available.map(skill=>skill.id).filter(id=>!selected.has(id))];
    orderNode.replaceChildren();
    ordered.forEach(id=>{
      const skill=available.find(item=>item.id===id)!;const row=document.createElement('div');row.className='afk-skill-row';
      const label=document.createElement('label'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=selected.has(id);checkbox.dataset.skill=id;label.append(checkbox,document.createTextNode(`${skill.slot} · ${skill.name}`));
      const actions=document.createElement('span');actions.className='afk-order-actions';
      for(const [direction,caption] of [[-1,'Выше'],[1,'Ниже']] as const){const button=document.createElement('button');button.type='button';button.textContent=direction<0?'↑':'↓';button.title=`${caption}: ${skill.name}`;button.setAttribute('aria-label',button.title);button.dataset.move=id;button.dataset.direction=String(direction);const index=draft!.skillOrder.indexOf(id);button.disabled=index<0||index+direction<0||index+direction>=draft!.skillOrder.length;actions.append(button);}
      row.append(label,actions);orderNode.append(row);
    });
  }
  function render(force=false){
    if(!draft)return;
    const key=JSON.stringify([owner,draft,baseline,pending?.value,unconfirmed,status,game.connected]);if(!force&&key===renderKey)return;renderKey=key;
    check('afk-pickup-gold').checked=draft.pickupGold;
    for(let rarity=0;rarity<rarityLabels.length;rarity++)check('afk-rarity-'+rarity).checked=draft.pickupRarities.includes(rarity);
    check('afk-hp-enabled').checked=draft.hpPotion.enabled;check('afk-mp-enabled').checked=draft.manaPotion.enabled;
    check('afk-hp-threshold').value=String(draft.hpPotion.belowPercent);check('afk-mp-threshold').value=String(draft.manaPotion.belowPercent);
    check('afk-hp-threshold').disabled=!draft.hpPotion.enabled;check('afk-mp-threshold').disabled=!draft.manaPotion.enabled;
    check('afk-basic-attack').checked=draft.basicAttackFallback;
    check('afk-radius').value=String(draft.radiusPercent);field<HTMLOutputElement>('afk-radius-value').value=`${draft.radiusPercent}%`;
    renderSkills(game.player.classId);
    saveButton.disabled=!game.connected||!!pending||same(draft,baseline)&&!unconfirmed;
    saveButton.textContent=pending?'Сохраняем…':'Сохранить';statusNode.textContent=status;
  }
  panel.addEventListener('change',event=>{
    if(!draft)return;const target=event.target;if(!(target instanceof HTMLInputElement))return;
    if(target.id==='afk-pickup-gold')draft.pickupGold=target.checked;
    else if(target.id.startsWith('afk-rarity-'))draft.pickupRarities=[0,1,2].filter(index=>check('afk-rarity-'+index).checked);
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
  panel.addEventListener('input',event=>{const target=event.target;if(target instanceof HTMLInputElement&&target.id==='afk-radius')field<HTMLOutputElement>('afk-radius-value').value=`${target.value}%`;});
  orderNode.addEventListener('click',event=>{
    if(!draft)return;const target=event.target;if(!(target instanceof HTMLButtonElement)||!target.dataset.move)return;
    const index=draft.skillOrder.indexOf(target.dataset.move as SkillId),next=index+Number(target.dataset.direction);if(index<0||next<0||next>=draft.skillOrder.length)return;
    [draft.skillOrder[index],draft.skillOrder[next]]=[draft.skillOrder[next],draft.skillOrder[index]];setDirty();
  });
  saveButton.onclick=()=>{
    if(!draft||!game.connected||pending)return;
    const value=clone(draft);pending={value,sentAt:performance.now()};unconfirmed=false;setStatus('Ждём подтверждение сервера…');render();
    game.send({type:'afkPreferences',preferences:value} as unknown as ClientMessage);
  };
  function snapshot():AfkPreferences|null{return validPreferences((game.player as typeof game.player & {afkPreferences?:unknown}).afkPreferences,game.player.classId);}
  function update(){
    const identity=`${game.player.id}:${game.player.classId}`,server=snapshot();
    if(identity!==owner){owner=identity;baseline=server||defaults(game.player.classId);draft=clone(baseline);lastServer=server;pending=null;unconfirmed=false;setStatus(server?'':'Настройки загрузятся после подключения.');renderKey='';}
    else if(server&&!same(server,lastServer)){
      lastServer=server;
      if(!pending&&same(draft,baseline)){baseline=server;draft=clone(server);if(!unconfirmed)setStatus('');}
      else baseline=server;
      renderKey='';
    }
    if(pending&&performance.now()-pending.sentAt>8000){
      const matched=server&&same(server,pending.value);pending=null;unconfirmed=!!matched;
      if(matched){baseline=server;setStatus('Состояние сервера совпадает, но ответ не получен. Можно повторить сохранение.');}
      else setStatus('Ответ сервера не получен. Повторите сохранение.');
      renderKey='';
    }
    if(isOpen()&&(document.getElementById('character-panel')?.hidden===false||document.getElementById('inventory-panel')?.hidden===false))close();
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
