import {DUNGEONS} from './dungeons.js';
import {LATE_REGIONS} from './late-world.js';
import type {NetworkGame} from './network.js';
import type {ClassId,LocationId,OnlinePlayer} from '../../shared/types.js';

const classNames:Record<ClassId,string>={warrior:'Воин',archer:'Лучник',mage:'Маг'};
const locationNames:Record<LocationId,string>={
  forest:'Пепельная опушка',snow:'Снежный предел',wasteland:'Пепельные пустоши',stadium:'Стадиум',
  ...Object.fromEntries(LATE_REGIONS.map(region=>[region.id,region.name])),
  ...Object.fromEntries(DUNGEONS.map(dungeon=>[dungeon.id,dungeon.name])),
} as Record<LocationId,string>;

const node=<K extends keyof HTMLElementTagNameMap>(tag:K,className='',text='')=>{const element=document.createElement(tag);element.className=className;element.textContent=text;return element;};

export function bindOnlineRoster(game:NetworkGame){
  const toggle=document.getElementById('connection');
  if(!(toggle instanceof HTMLButtonElement))throw new Error('Online roster requires #connection button');
  toggle.setAttribute('aria-controls','online-roster');toggle.setAttribute('aria-expanded','false');
  const panel=node('aside','online-roster-panel');panel.id='online-roster';panel.hidden=true;panel.setAttribute('aria-label','Игроки онлайн');
  const heading=node('div','online-roster-heading'),titles=node('div'),eyebrow=node('p','online-roster-eyebrow','ОБЩИЙ МИР'),title=node('h2','','Игроки онлайн');titles.append(eyebrow,title);
  const close=node('button','online-roster-close','×');close.type='button';close.setAttribute('aria-label','Закрыть список игроков');heading.append(titles,close);
  const scroll=node('div','online-roster-scroll'),table=document.createElement('table'),caption=document.createElement('caption'),head=document.createElement('thead'),body=document.createElement('tbody');caption.textContent='Подключённые герои во всех регионах';
  const header=document.createElement('tr');for(const label of ['Герой','Класс','Уровень','Локация'])header.append(node('th','',label));head.append(header);table.append(caption,head,body);scroll.append(table);panel.append(heading,scroll);document.body.append(panel);
  let signature='';
  const open=()=>{update();panel.hidden=false;toggle.setAttribute('aria-expanded','true');close.focus({preventScroll:true});};
  const shut=()=>{panel.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.focus({preventScroll:true});};
  const render=(players:OnlinePlayer[])=>{
    const visible=game.connected?players:[];
    const key=JSON.stringify([game.connected,game.id,visible]);if(key===signature)return;signature=key;body.replaceChildren();
    const ordered=[...visible].sort((left,right)=>right.level-left.level||left.name.localeCompare(right.name,'ru'));
    if(!ordered.length){const row=document.createElement('tr'),cell=node('td','online-roster-empty',game.connected?'Сейчас в мире никого нет.':'Список обновится после подключения.');cell.colSpan=4;row.append(cell);body.append(row);return;}
    for(const player of ordered){const row=document.createElement('tr'),hero=node('td','online-roster-name',player.name);if(player.id===game.id)hero.append(node('small','online-roster-self','Вы'));row.append(hero,node('td','',classNames[player.classId]),node('td','',String(player.level)),node('td','',locationNames[player.location]));body.append(row);}
  };
  toggle.addEventListener('click',()=>panel.hidden?open():shut());close.addEventListener('click',shut);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){event.preventDefault();shut();}},true);
  function update(){render(game.onlinePlayers);}
  update();return {update};
}
