import {ConnectionError,type NetworkGame} from './network.js';
import {readReloadResume} from './client-reload.js';
import {itemIcon} from './item-icons.js';
import {errorMessage} from './ui-types.js';
import type {ClassId} from '../../shared/types.js';

interface CharacterSummary {id:string;name:string;classId:ClassId;level:number}
interface AccountState {configured:boolean;account:{id:string;email:string;name:string}|null;characters:CharacterSummary[];maxCharacters:number}
const classes:Record<ClassId,{name:string;description:string}>={
  warrior:{name:'Воин',description:'Меч и броня. Сражается в ближнем бою.'},
  archer:{name:'Лучник',description:'Лук и точность. Поражает врагов на расстоянии.'},
  mage:{name:'Маг',description:'Посох и стихии. Обрушивает заклинания на группы врагов.'}
};
const node=<T extends HTMLElement=HTMLElement>(id:string)=>{
  const element=document.getElementById(id);if(!element)throw new Error(`Missing account interface: ${id}`);return element as T;
};
const NOTICE='frontier-account-notice';
function savedNotice(){try{const text=sessionStorage.getItem(NOTICE)||'';sessionStorage.removeItem(NOTICE);return text;}catch{return '';}}
function saveNotice(text:string){try{sessionStorage.setItem(NOTICE,text);}catch{/* Cookies remain the only authentication state. */}}
async function request<T>(path:string,body?:unknown):Promise<T>{
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...(body!==undefined?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  if(!response.ok){const error=await response.json().catch(()=>null) as {error?:string;text?:string}|null;throw new ConnectionError(error?.error||'request_failed',error?.text||'Не удалось связаться с сервером. Попробуйте ещё раз.');}
  return (response.status===204?undefined:await response.json()) as T;
}

/** Account cookies are HttpOnly. This module never stores credentials or hero access keys. */
export function bindAccountInterface(game:NetworkGame,clearInput:()=>void){
  const panel=node('join-panel'),roster=node('character-roster'),form=node<HTMLFormElement>('join-form'),play=node<HTMLButtonElement>('character-play');
  let state:AccountState|null=null,selected='',busy=false,entered=false,resolveEntry:(()=>void)|null=null;
  const error=node('join-error'),status=node('account-status'),retry=node<HTMLButtonElement>('account-retry');
  function setBusy(value:boolean){
    busy=value;panel.setAttribute('aria-busy',String(value));
    panel.querySelectorAll<HTMLButtonElement>('button').forEach(button=>{button.disabled=value;});
    play.disabled=value||!selected;node<HTMLInputElement>('join-name').disabled=value;node<HTMLSelectElement>('join-class').disabled=value;
  }
  function select(id:string){
    selected=id;const character=state?.characters.find(hero=>hero.id===id);
    for(const button of roster.querySelectorAll<HTMLButtonElement>('[data-hero-id]'))button.setAttribute('aria-pressed',String(button.dataset.heroId===id));
    node('selected-character').textContent=character?`${character.name} · ${classes[character.classId].name} · уровень ${character.level}`:'Выберите героя или создайте нового';
    play.disabled=busy||!character;form.hidden=true;node('character-enter').hidden=false;
  }
  function create(){
    if(busy||!state||state.characters.length>=5)return;
    select('');form.hidden=false;node('character-enter').hidden=true;node<HTMLInputElement>('join-name').focus();
  }
  function render(){
    if(!state)return;
    node('account-login').hidden=!!state.account;node('account-roster').hidden=!state.account;
    node('google-signin').hidden=!state.configured;node('account-unconfigured').hidden=state.configured;
    node('account-title').textContent=state.account?'Кого зовёт дорога?':'Ваша история начинается здесь';
    status.textContent=state.account?'Герои этого аккаунта':'Войдите, чтобы продолжить';
    if(!state.account){selected='';return;}
    node('account-identity').textContent=state.account.email||state.account.name;
    node('character-count').textContent=`${state.characters.length} / 5`;
    roster.replaceChildren();
    for(let index=0;index<5;index++){
      const hero=state.characters[index],button=document.createElement('button');button.type='button';button.className='character-card';
      const emblem=document.createElement('span');emblem.className='character-emblem';emblem.setAttribute('aria-hidden','true');
      const label=document.createElement('strong'),detail=document.createElement('small');
      if(hero){
        button.dataset.heroId=hero.id;button.dataset.class=hero.classId;button.setAttribute('aria-pressed','false');
        emblem.innerHTML=itemIcon('weapon',hero.classId);label.textContent=hero.name;detail.textContent=`${classes[hero.classId].name} · ур. ${hero.level}`;
        button.onclick=()=>{if(!busy){error.textContent='';select(hero.id);}};
      }else{
        button.classList.add('empty');emblem.textContent='+';label.textContent='Создать героя';detail.textContent=`Место ${index+1}`;button.onclick=create;
      }
      button.append(emblem,label,detail);roster.append(button);
    }
    select(state.characters.some(hero=>hero.id===selected)?selected:'');
  }
  async function refresh(message=''){
    setBusy(true);error.textContent=message;retry.hidden=true;status.textContent='Загружаем аккаунт…';
    try{state=await request<AccountState>('/api/account');render();}
    catch(failure){status.textContent='Сервер недоступен';error.textContent=errorMessage(failure);retry.hidden=false;}
    finally{setBusy(false);}
  }
  async function logout(fromGame=false){
    if(busy)return;
    setBusy(true);
    try{await request<void>('/auth/logout',{});clearInput();game.disconnect();location.reload();}
    catch(failure){(fromGame?node('account-menu-error'):error).textContent=errorMessage(failure);setBusy(false);}
  }
  node<HTMLButtonElement>('account-logout').onclick=()=>void logout();
  node<HTMLButtonElement>('game-logout').onclick=()=>void logout(true);
  node<HTMLButtonElement>('account-characters').onclick=()=>{clearInput();game.disconnect();location.reload();};
  node<HTMLDetailsElement>('account-menu').addEventListener('toggle',()=>{if(node<HTMLDetailsElement>('account-menu').open)clearInput();});
  node<HTMLButtonElement>('create-cancel').onclick=()=>select('');
  node<HTMLSelectElement>('join-class').onchange=()=>{node('class-description').textContent=classes[node<HTMLSelectElement>('join-class').value as ClassId].description;};
  retry.onclick=()=>void refresh();
  form.onsubmit=async event=>{
    event.preventDefault();if(busy)return;setBusy(true);error.textContent='';
    try{
      const result=await request<{character:CharacterSummary}>('/api/characters',{name:node<HTMLInputElement>('join-name').value.trim(),classId:node<HTMLSelectElement>('join-class').value});
      selected=result.character.id;node<HTMLInputElement>('join-name').value='';await refresh();
    }catch(failure){error.textContent=errorMessage(failure);if(failure instanceof ConnectionError&&failure.code==='auth_required')await refresh(errorMessage(failure));}
    finally{setBusy(false);}
  };
  async function enterHero(heroId:string,label:string){
    selected=heroId;setBusy(true);error.textContent='';status.textContent=label;
    try{
      await game.connect({heroId});entered=true;panel.hidden=true;node('account-menu').hidden=false;resolveEntry?.();resolveEntry=null;return true;
    }catch(failure){
      game.disconnect();status.textContent='Выберите героя';error.textContent=errorMessage(failure);
      if(failure instanceof ConnectionError&&failure.code==='auth_required')await refresh(errorMessage(failure));
      return false;
    }finally{setBusy(false);}
  }
  play.onclick=async()=>{if(!busy&&selected)await enterHero(selected,'Подключаемся к миру…');};
  game.onTerminal=(_code,message)=>{
    if(!entered)return;
    clearInput();saveNotice(message);game.disconnect();location.reload();
  };
  async function join(){
    panel.hidden=false;
    // Remove obsolete local guest access values; they are never sent to the server.
    try{for(const storage of [localStorage,sessionStorage]){
      for(let index=storage.length-1;index>=0;index--){const key=storage.key(index);if(key?.startsWith('frontier-token:'))storage.removeItem(key);}storage.removeItem('frontier-name');
    }}catch{/* Storage may be unavailable in private browsing. */}
    const params=new URLSearchParams(location.search),oauthError=params.get('auth_error');
    const message=savedNotice()||(oauthError?'Вход через Google не завершён. Попробуйте снова.':'');
    if(oauthError){params.delete('auth_error');history.replaceState(null,'',`${location.pathname}${params.size?'?'+params.toString():''}${location.hash}`);}
    const entry=new Promise<void>(resolve=>{resolveEntry=resolve;});
    await refresh(message);
    try{
      const resume=readReloadResume(sessionStorage);
      if(resume&&state?.characters.some(hero=>hero.id===resume.heroId))await enterHero(resume.heroId,'Восстанавливаем героя после обновления мира…');
    }catch{/* Private mode may block sessionStorage; the player can still choose a hero. */}
    return entry;
  }
  return {join};
}
