import {actionIcon} from './action-icons.js';
import type {NetworkGame} from './network.js';
import {SKILLS,skillsForClass,type SkillDefinition} from './skills.js';
import {TALENTS,defaultSkillBuild,effectiveSkill,parseSkillBuild,talentBranches,talentPoints,talentSpent,type TalentDefinition} from './skill-builds.js';
import type {ClassId,SkillBuild,SkillId,WorldEvent} from '../../shared/types.js';

type PendingBuild={kind:'apply'|'save'|'load';sentAt:number;build?:SkillBuild;index?:0|1|2};
type Page='skills'|'talents';
const slots=['1','2','3','4','ПКМ'] as const;
const presetNames=['Охота','Босс','PvP'] as const;
const kindLabels:Record<SkillDefinition['kind'],string>={attack:'Атака',mobility:'Движение',defense:'Защита',support:'Поддержка',control:'Контроль',channel:'Канал'};
const clone=(build:SkillBuild):SkillBuild=>({slots:[...build.slots],talents:{...build.talents}});
const same=(a:SkillBuild|undefined,b:SkillBuild|undefined)=>!!a&&!!b&&JSON.stringify(a)===JSON.stringify(b);
const field=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const fixed=(value:number,digits=1)=>Number.isInteger(value)?String(value):value.toFixed(digits).replace('.',',');

export function bindSkillbook(game:NetworkGame,toast:(message:string)=>void){
  const panel=field<HTMLElement>('skillbook-panel'),toggle=field<HTMLButtonElement>('skillbook-toggle'),tooltip=field<HTMLElement>('skillbook-tooltip');
  const catalog=field<HTMLElement>('skillbook-catalog'),slotList=field<HTMLElement>('skillbook-slots'),branchesNode=field<HTMLElement>('talent-branches');
  const statusNode=field<HTMLElement>('skillbook-status'),applyButton=field<HTMLButtonElement>('skillbook-apply'),discardButton=field<HTMLButtonElement>('skillbook-discard'),resetButton=field<HTMLButtonElement>('skillbook-reset');
  let owner='',serverRevision=-1,baseline:SkillBuild|undefined,draft:SkillBuild|undefined,pending:PendingBuild|null=null,status='',error=false,selectedSkill:SkillId|null=null,page:Page='skills',renderKey='';
  const isOpen=()=>!panel.hidden;
  const classTalents=(classId:ClassId)=>TALENTS.filter(talent=>talent.classId===classId);
  const canChange=()=>game.connected&&!game.player.dead;
  const currentBuild=()=>parseSkillBuild(game.player.skillBuild,game.player.classId,game.player.level)??defaultSkillBuild(game.player.classId,game.player.level);
  function setStatus(message:string,isError=false){status=message;error=isError;renderKey='';}
  function setPage(next:Page){page=next;field<HTMLButtonElement>('skillbook-skills-tab').setAttribute('aria-selected',String(next==='skills'));field<HTMLButtonElement>('skillbook-talents-tab').setAttribute('aria-selected',String(next==='talents'));field<HTMLElement>('skillbook-skills').hidden=next!=='skills';field<HTMLElement>('skillbook-talents').hidden=next!=='talents';renderKey='';render();}
  function open(){sync();panel.hidden=false;toggle.setAttribute('aria-expanded','true');render(true);}
  function close(){panel.hidden=true;toggle.setAttribute('aria-expanded','false');hideTooltip();}
  toggle.onclick=()=>isOpen()?close():open();field<HTMLButtonElement>('skillbook-close').onclick=close;
  field<HTMLButtonElement>('skillbook-skills-tab').onclick=()=>setPage('skills');field<HTMLButtonElement>('skillbook-talents-tab').onclick=()=>setPage('talents');
  document.addEventListener('keydown',event=>{
    if(event.metaKey||event.ctrlKey||event.altKey||event.repeat||['INPUT','SELECT','TEXTAREA'].includes((document.activeElement?.tagName||'')))return;
    if(event.code==='KeyK'){event.preventDefault();isOpen()?close():open();}
    else if(event.code==='Escape'&&isOpen()){event.preventDefault();event.stopPropagation();close();}
  },true);

  function sync(){
    const identity=`${game.player.id}:${game.player.classId}`;
    const server=currentBuild(),revision=Number.isInteger(game.player.buildRevision)?game.player.buildRevision:0;
    if(identity!==owner){owner=identity;baseline=clone(server);draft=clone(server);serverRevision=revision;pending=null;selectedSkill=null;status='';error=false;renderKey='';return;}
    if(revision!==serverRevision||!same(server,baseline)){
      const wasClean=same(draft,baseline),accepted=!!pending&&pending.kind!=='save';
      baseline=clone(server);serverRevision=revision;
      if(wasClean||accepted)draft=clone(server);
      if(accepted)pending=null;
      renderKey='';
    }
    if(pending&&performance.now()-pending.sentAt>8000){pending=null;setStatus('Ответ сервера задержался. Сверьте сборку перед повтором.',true);}
  }
  function dirty(){return !same(draft,baseline);}
  function assign(skillId:SkillId,index:number){
    if(!draft)return;const skill=SKILLS[skillId];
    if(skill.classId!==game.player.classId||skill.unlockLevel>game.player.level){setStatus(`«${skill.name}» откроется на ${skill.unlockLevel} уровне.`,true);return;}
    const previous=draft.slots.indexOf(skillId);if(previous>=0)draft.slots[previous]=null;
    draft.slots[index]=skillId;selectedSkill=null;setStatus('Боевой набор изменён. Примените сборку.');renderKey='';render();
  }
  function removeSlot(index:number){if(!draft||!draft.slots[index])return;draft.slots[index]=null;setStatus('Слот освобождён. Примените сборку.');renderKey='';render();}
  function branchSpent(branch:string){if(!draft)return 0;return classTalents(game.player.classId).filter(t=>t.branch===branch&&!t.keystone).reduce((sum,t)=>sum+(draft!.talents[t.id]??0),0);}
  function otherKeystone(id:string){if(!draft)return false;return classTalents(game.player.classId).some(t=>t.keystone&&t.id!==id&&(draft!.talents[t.id]??0)>0);}
  function changeTalent(definition:TalentDefinition,amount:-1|1){
    if(!draft)return;const rank=draft.talents[definition.id]??0,total=talentSpent(draft),budget=talentPoints(game.player.level);
    if(amount>0){
      if(game.player.level<10){setStatus('Таланты откроются на 10 уровне.',true);return;}
      if(rank>=definition.maxRank){setStatus('Достигнут максимальный ранг этого таланта.',true);return;}
      if(total>=budget){setStatus('Все доступные очки талантов уже распределены.',true);return;}
      if(definition.keystone&&branchSpent(definition.branch)<8){setStatus('Для итогового таланта вложите 8 очков в малые таланты ветки.',true);return;}
      if(definition.keystone&&otherKeystone(definition.id)){setStatus('Активным может быть только один итоговый талант.',true);return;}
    }else if(rank<=0)return;
    const next=rank+amount;if(next)draft.talents[definition.id]=next;else delete draft.talents[definition.id];
    if(amount<0&&!definition.keystone&&branchSpent(definition.branch)<8){for(const talent of classTalents(game.player.classId))if(talent.branch===definition.branch&&talent.keystone)delete draft.talents[talent.id];}
    setStatus('Таланты изменены. Эффективные параметры навыков обновлены в подсказках.');renderKey='';render();
  }

  function renderSlots(){
    if(!draft)return;slotList.replaceChildren();
    draft.slots.forEach((id,index)=>{
      const skill=id?effectiveSkill({...game.player,skillBuild:draft},id):null,button=document.createElement('div');button.className='skill-slot'+(skill?'':' empty');button.dataset.slot=slots[index];button.dataset.index=String(index);
      const art=document.createElement('span');art.className='skill-slot-art';if(skill)art.innerHTML=actionIcon(skill.id);
      const copy=document.createElement('span'),name=document.createElement('strong'),meta=document.createElement('small'),main=document.createElement('button');main.type='button';main.className='skill-slot-main';name.textContent=skill?.name||'Пустой слот';meta.textContent=skill?`${fixed(skill.manaCost)} MP${skill.cooldown?` · ${fixed(skill.cooldown)} с`:''}`:'Выберите навык';copy.append(name,meta);main.append(art,copy);button.append(main);
      if(skill){const remove=document.createElement('button');remove.type='button';remove.className='slot-remove';remove.textContent='×';remove.setAttribute('aria-label',`Убрать ${skill.name} из слота ${slots[index]}`);remove.onclick=event=>{event.stopPropagation();removeSlot(index);};button.append(remove);button.draggable=true;button.dataset.skill=skill.id;button.addEventListener('dragstart',event=>event.dataTransfer?.setData('text/skill-id',skill.id));}
      main.onclick=()=>{if(selectedSkill)assign(selectedSkill,index);else if(id){selectedSkill=id;setStatus(`Выбран «${skill!.name}». Укажите новый слот.`);renderKey='';render();}};
      button.addEventListener('dragover',event=>{event.preventDefault();button.classList.add('drag-over');});button.addEventListener('dragleave',()=>button.classList.remove('drag-over'));
      button.addEventListener('drop',event=>{event.preventDefault();button.classList.remove('drag-over');const id=event.dataTransfer?.getData('text/skill-id') as SkillId;if(id&&Object.hasOwn(SKILLS,id))assign(id,index);});
      if(skill)bindTooltip(button,()=>skill);slotList.append(button);
    });
  }
  function renderCatalog(){
    if(!draft)return;catalog.replaceChildren();
    for(const base of skillsForClass(game.player.classId)){
      const skill=effectiveSkill({...game.player,skillBuild:draft},base.id),locked=base.unlockLevel>game.player.level,equipped=draft.slots.includes(base.id),card=document.createElement('button');card.type='button';card.className=`skill-card${locked?' locked':''}${equipped?' equipped':''}${selectedSkill===base.id?' selected':''}`;card.dataset.skill=base.id;card.setAttribute('role','listitem');card.disabled=false;card.draggable=!locked;
      const head=document.createElement('div');head.className='skill-card-head';const art=document.createElement('span');art.className='skill-card-art';art.innerHTML=actionIcon(base.id);const kind=document.createElement('span');kind.className='skill-kind';kind.textContent=kindLabels[base.kind];head.append(art,kind);
      const name=document.createElement('h4');name.textContent=base.name;const description=document.createElement('p');description.textContent=base.description;const meta=document.createElement('div');meta.className='skill-card-meta';meta.innerHTML=`<span>${fixed(skill.manaCost)} MP</span><span>${skill.cooldown?fixed(skill.cooldown)+' с':'без КД'}</span>`;card.append(head,name,description,meta);
      if(equipped){const mark=document.createElement('span');mark.className='skill-equipped-mark';mark.textContent=slots[draft.slots.indexOf(base.id)];card.append(mark);}
      if(locked){const lock=document.createElement('span');lock.className='skill-card-lock';lock.textContent=`Откроется на уровне ${base.unlockLevel}`;card.append(lock);}
      card.onclick=()=>{if(locked){setStatus(`«${base.name}» откроется на ${base.unlockLevel} уровне.`,true);render();return;}selectedSkill=selectedSkill===base.id?null:base.id;setStatus(selectedSkill?`Выбран «${base.name}». Нажмите нужный слот 1–4 или ПКМ.`:'Выбор навыка снят.');renderKey='';render();};
      card.addEventListener('dragstart',event=>{if(!locked)event.dataTransfer?.setData('text/skill-id',base.id);});bindTooltip(card,()=>skill,locked?`Требуется ${base.unlockLevel} уровень.`:'');catalog.append(card);
    }
  }
  function renderTalents(){
    if(!draft)return;branchesNode.replaceChildren();
    for(const branch of talentBranches(game.player.classId)){
      const section=document.createElement('section');section.className='talent-branch';const heading=document.createElement('div');heading.className='talent-branch-heading';const name=document.createElement('h3');name.textContent=branch.name;const count=document.createElement('span');count.textContent=`${branchSpent(branch.id)} очков`;heading.append(name,count);section.append(heading);
      for(const definition of classTalents(game.player.classId).filter(t=>t.branch===branch.id)){
        const rank=draft.talents[definition.id]??0,node=document.createElement('div');node.className=`talent-node${definition.keystone?' keystone':''}${rank?' invested':''}${rank===definition.maxRank?' capped':''}`;
        const rune=document.createElement('span');rune.className='talent-rune';rune.innerHTML=`<i>${definition.keystone?'✦':String(classTalents(game.player.classId).filter(t=>t.branch===branch.id&&!t.keystone).indexOf(definition)+1)}</i>`;
        const copyNode=document.createElement('span');copyNode.className='talent-copy';const title=document.createElement('strong');title.textContent=definition.name;const text=document.createElement('small');text.textContent=definition.description;copyNode.append(title,text);
        const controls=document.createElement('span');controls.className='talent-rank';const minus=document.createElement('button'),plus=document.createElement('button');minus.type=plus.type='button';minus.textContent='−';plus.textContent='+';minus.disabled=!rank||!!pending;plus.disabled=!!pending||rank>=definition.maxRank||game.player.level<10||talentSpent(draft)>=talentPoints(game.player.level)||(definition.keystone&&(branchSpent(definition.branch)<8||otherKeystone(definition.id)));minus.setAttribute('aria-label',`Убрать ранг: ${definition.name}`);plus.setAttribute('aria-label',`Добавить ранг: ${definition.name}`);minus.onclick=()=>changeTalent(definition,-1);plus.onclick=()=>changeTalent(definition,1);const number=document.createElement('b');number.textContent=`${rank}/${definition.maxRank}`;controls.append(minus,number,plus);node.append(rune,copyNode,controls);
        if(definition.keystone&&!rank){const reason=document.createElement('small');reason.className='talent-lock';reason.textContent=game.player.level<10?'Таланты откроются на 10 уровне':otherKeystone(definition.id)?'Уже выбран другой итоговый талант':branchSpent(definition.branch)<8?`Нужно ещё ${8-branchSpent(definition.branch)} очк. в ветке`:'Итоговый талант доступен';node.append(reason);}
        bindTooltip(node,()=>definition,definition.keystone?'Итоговый талант ветки. Активным может быть только один.':'');section.append(node);
      }
      branchesNode.append(section);
    }
  }
  function renderPresets(){
    const list=field<HTMLElement>('skillbook-preset-list');list.replaceChildren();const presets=game.player.skillPresets??[null,null,null];
    presetNames.forEach((name,index)=>{const group=document.createElement('span');group.className='preset-group';const load=document.createElement('button'),save=document.createElement('button');load.type=save.type='button';load.className='preset-load'+(presets[index]?'':' empty');save.className='preset-save';load.textContent=name;save.textContent='↓';load.title=presets[index]?`Применить пресет «${name}»`:`Пресет «${name}» ещё не сохранён`;save.title=`Сохранить текущую применённую сборку: «${name}»`;load.disabled=!presets[index]||!game.connected||!!pending;save.disabled=!game.connected||!!pending;
      load.onclick=()=>{if(!presets[index]||pending)return;if(!canChange()){setStatus('Пресет доступен живому герою при подключении к миру.',true);render();return;}pending={kind:'load',index:index as 0|1|2,sentAt:performance.now()};setStatus(`Применяем пресет «${name}»…`);game.send({type:'buildLoadPreset',revision:game.player.buildRevision,index:index as 0|1|2});renderKey='';render();};
      save.onclick=()=>{if(pending)return;if(dirty()){setStatus('Сначала примените изменения, затем сохраните пресет.',true);render();return;}pending={kind:'save',index:index as 0|1|2,sentAt:performance.now()};setStatus(`Сохраняем текущую сборку в пресет «${name}»…`);game.send({type:'buildSavePreset',index:index as 0|1|2});renderKey='';render();};group.append(load,save);list.append(group);});
  }
  function render(force=false){
    sync();if(!draft)return;const usable=canChange(),isDirty=dirty(),spent=talentSpent(draft),available=talentPoints(game.player.level),key=JSON.stringify([page,draft,baseline,game.player.level,game.player.buildRevision,game.player.skillPresets,game.connected,game.player.dead,game.player.afk,pending?.kind,pending?.index,status,error,selectedSkill]);if(!force&&key===renderKey)return;renderKey=key;
    field<HTMLElement>('skillbook-level').textContent=String(game.player.level);field<HTMLElement>('talent-spent').textContent=String(spent);field<HTMLElement>('talent-total').textContent=String(available);field<HTMLElement>('talent-tab-points').textContent=String(Math.max(0,available-spent));
    const next=available>=20?'Все 20 очков открыты':game.player.level<10?'Первое очко на 10 уровне':`Следующее очко на ${10+available*4} уровне`;field<HTMLElement>('talent-next-point').textContent=next;field<HTMLElement>('talent-budget-fill').style.width=`${available?Math.min(100,spent/available*100):0}%`;
    const currentAvailable=Math.max(0,talentPoints(game.player.level)-talentSpent(currentBuild()));field<HTMLElement>('talent-points-badge').textContent=String(currentAvailable);field<HTMLElement>('talent-points-badge').hidden=!currentAvailable;
    const safeState=field<HTMLElement>('skillbook-safe-state');safeState.textContent=usable?(game.player.afk?'Можно применить · автоохота остановится':'Сборку можно применить в бою'):'Применение доступно живому герою при подключении';safeState.classList.toggle('locked',!usable);
    renderSlots();renderCatalog();renderTalents();renderPresets();
    applyButton.disabled=!isDirty||!usable||!!pending;discardButton.disabled=!isDirty||!!pending;resetButton.disabled=!spent||!!pending;
    applyButton.textContent=pending?.kind==='apply'?'Применяем…':'Применить сборку';
    const fallback=pending?'Ждём подтверждения сервера…':status||(!game.connected?'Нет соединения с миром.':!usable?'Применение доступно живому герою.':isDirty?'Есть неприменённые изменения.':game.player.afk?'Открытие книги не выключает автоохоту. Применение сборки её остановит.':'Сборка сохранена на сервере.');statusNode.textContent=fallback;statusNode.classList.toggle('error',error);statusNode.classList.toggle('pending',!!pending);
  }
  function showTooltip(target:HTMLElement,value:SkillDefinition|TalentDefinition,locked=''){
    if('manaCost' in value){
      const rows:[string,string][]=[['Расход',`${fixed(value.manaCost)} MP`],['Перезарядка',value.cooldown?`${fixed(value.cooldown)} с`:'Без отдельной перезарядки'],['Дальность',value.range?`${fixed(value.range)} м`:'На себя']];if(value.radius)rows.push(['Радиус',`${fixed(value.radius)} м`]);if(value.maxTargets)rows.push(['Целей',String(value.maxTargets)]);if(value.effectDuration&&value.effectDuration<1000)rows.push(['Длительность эффекта',`${fixed(value.effectDuration)} с`]);
      tooltip.innerHTML=`<h4>${value.name}</h4><p class="tooltip-kicker">${kindLabels[value.kind]} · с ${value.unlockLevel} уровня</p><p>${value.description}</p>${locked?`<p class="tooltip-lock">${locked}</p>`:''}<dl>${rows.map(([label,data])=>`<dt>${label}</dt><dd>${data}</dd>`).join('')}</dl>`;
    }else tooltip.innerHTML=`<h4>${value.name}</h4><p class="tooltip-kicker">${value.keystone?'Итоговый талант':'Малый талант'} · ${value.maxRank} ${value.maxRank===1?'ранг':'ранга'}</p><p>${value.description}</p>${locked?`<p class="tooltip-lock">${locked}</p>`:''}`;
    tooltip.hidden=false;const rect=target.getBoundingClientRect(),width=285,left=Math.max(8,Math.min(innerWidth-width-8,rect.right+10)),above=rect.top-tooltip.offsetHeight-8;tooltip.style.left=`${left}px`;tooltip.style.top=`${above>8?above:Math.min(innerHeight-tooltip.offsetHeight-8,rect.bottom+8)}px`;
  }
  function hideTooltip(){tooltip.hidden=true;}
  function bindTooltip(target:HTMLElement,getValue:()=>SkillDefinition|TalentDefinition,locked=''){target.addEventListener('mouseenter',()=>showTooltip(target,getValue(),locked));target.addEventListener('mouseleave',hideTooltip);target.addEventListener('focusin',()=>showTooltip(target,getValue(),locked));target.addEventListener('focusout',hideTooltip);}

  applyButton.onclick=()=>{if(!draft||pending||!dirty())return;if(!canChange()){setStatus('Сборка доступна живому герою при подключении к миру.',true);render();return;}const valid=parseSkillBuild(draft,game.player.classId,game.player.level);if(!valid){setStatus('Черновик содержит недоступный навык или неверное распределение талантов.',true);render();return;}pending={kind:'apply',build:clone(valid),sentAt:performance.now()};setStatus('Применяем сборку…');game.send({type:'buildApply',revision:game.player.buildRevision,build:valid});renderKey='';render();};
  discardButton.onclick=()=>{if(!baseline||pending)return;draft=clone(baseline);selectedSkill=null;setStatus('Неприменённые изменения отменены.');renderKey='';render();};
  resetButton.onclick=()=>{if(!draft||pending||!talentSpent(draft))return;draft.talents={};setStatus('Таланты сброшены в черновике. Примените сборку.');renderKey='';render();};
  function onEvent(event:WorldEvent){
    if(event.type!=='buildResult'||event.owner&&event.owner!==game.player.id)return;
    const action=pending?.kind,index=pending?.index;pending=null;
    if(event.ok){if(action==='apply'||action==='load'){baseline=clone(currentBuild());draft=clone(baseline);serverRevision=event.revision;selectedSkill=null;}setStatus(event.message||(action==='save'&&index!==undefined?`Пресет «${presetNames[index]}» сохранён.`:action==='load'&&index!==undefined?`Пресет «${presetNames[index]}» применён.`:'Сборка применена.'));toast(event.message||'Сборка сохранена');}
    else setStatus(event.message||'Сервер отклонил изменение сборки.',true);
    renderKey='';render();
  }
  function update(){sync();const available=Math.max(0,talentPoints(game.player.level)-talentSpent(currentBuild()));field<HTMLElement>('talent-points-badge').textContent=String(available);field<HTMLElement>('talent-points-badge').hidden=!available;if(isOpen())render();}
  return {update,onEvent,isOpen,close};
}
