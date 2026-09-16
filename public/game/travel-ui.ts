import * as T from './vendor/three.module.js';
import {TRAVEL_PORTALS,travelPortalById,travelCost} from './travel.js';
import type {NetworkGame} from './network.js';
import type {WorldEvent,LocationId} from '../../shared/types.js';

const node=<K extends keyof HTMLElementTagNameMap>(tag:K,className='',text='')=>{const value=document.createElement(tag);value.className=className;value.textContent=text;return value;};

/** One destination click sends only identifiers; proximity, level and payment are server owned. */
export function bindTravelPanel(game:NetworkGame){
  const panel=node('aside','travel-panel');panel.hidden=true;panel.id='travel-panel';panel.setAttribute('aria-labelledby','travel-title');
  const heading=node('div','travel-heading'),titles=node('div'),eyebrow=node('p','travel-eyebrow','СЕТЬ ПОРТАЛОВ'),title=node('h2','','Куда отправимся?');title.id='travel-title';titles.append(eyebrow,title);
  const close=node('button','travel-close','×');close.type='button';close.setAttribute('aria-label','Закрыть выбор телепорта');heading.append(titles,close);
  const summary=node('p','travel-summary'),list=node('div','travel-destinations'),hint=node('p','travel-hint','Стоимость списывается при переходе. Прибытие — в безопасную зону у входа.');panel.append(heading,summary,list,hint);document.body.append(panel);
  let sourceId='',signature='',pending=false,sentAt=0;
  const shut=()=>{panel.hidden=true;sourceId='';pending=false;document.getElementById('scene')?.focus({preventScroll:true});};
  close.onclick=shut;
  document.addEventListener('keydown',event=>{if(event.code==='Escape'&&!panel.hidden){event.preventDefault();shut();}},true);
  function update(){
    if(panel.hidden)return;
    if(!game.connected||game.player.dead||game.player.travelPortalId!==sourceId){shut();return;}
    if(pending&&performance.now()-sentAt>5000)pending=false;
    const source=travelPortalById(sourceId);if(!source){shut();return;}
    const player=game.player,key=JSON.stringify([sourceId,player.gold,player.level,pending]);if(key===signature)return;signature=key;
    summary.textContent=`${source.name} · У вас ${player.gold.toLocaleString('ru-RU')} золота`;
    list.replaceChildren();
    for(const destination of TRAVEL_PORTALS){
      const current=destination.id===sourceId,cost=travelCost(source,destination),locked=player.level<destination.minLevel,poor=player.gold<cost;
      const button=node('button','travel-destination');button.type='button';button.dataset.destination=destination.id;
      const glyph=node('span','travel-glyph',destination.location.includes('dungeon')?'▣':'◎'),info=node('span','travel-destination-info'),name=node('strong','',destination.name),detail=node('small','',current?'Вы здесь':locked?`Откроется на ${destination.minLevel} уровне`:`${destination.minLevel} ур. · безопасное прибытие`),price=node('span','travel-price',current?'—':`${cost.toLocaleString('ru-RU')} з.`);
      info.append(name,detail);button.append(glyph,info,price);button.disabled=current||locked||poor||pending;
      button.title=current?'Вы уже здесь':locked?`Нужен уровень ${destination.minLevel}`:poor?'Недостаточно золота':`Телепортироваться: ${destination.name}, ${cost} золота`;
      button.onclick=()=>{if(pending)return;pending=true;sentAt=performance.now();game.send({type:'travel',portalId:sourceId,destinationId:destination.id});signature='';update();};list.append(button);
    }
  }
  function onEvent(event:WorldEvent){
    if(event.type==='travelOpened'){sourceId=event.portalId;signature='';pending=false;panel.hidden=false;update();if(!panel.hidden)close.focus({preventScroll:true});}
    if(event.type==='portal'||event.type==='camp'||event.type==='death')shut();
    if(event.type==='notice'&&pending){pending=false;signature='';update();}
  }
  return {update,onEvent};
}

/** Visible safe boundary and a distinct upright turquoise gate, shared across every location. */
export function createTravelPortals(scene:T.Scene){
  const stone=new T.MeshStandardMaterial({color:'#536563',roughness:.72,metalness:.3});
  const glow=new T.MeshBasicMaterial({color:'#77efd4',transparent:true,opacity:.8,depthWrite:false});
  const veil=new T.MeshBasicMaterial({color:'#65dbc9',transparent:true,opacity:.12,side:T.DoubleSide,depthWrite:false});
  const portals=TRAVEL_PORTALS.map(portal=>{
    const object=new T.Group();object.name=portal.id;object.position.set(portal.x,0,portal.z);scene.add(object);
    const frame=new T.Mesh(new T.TorusGeometry(.92,.13,8,40),stone);frame.position.y=1.18;object.add(frame);
    const light=new T.Mesh(new T.TorusGeometry(.91,.025,6,40),glow);light.position.set(0,1.18,.13);object.add(light);
    const surface=new T.Mesh(new T.CircleGeometry(.81,40),veil);surface.position.y=1.18;object.add(surface);
    const base=new T.Mesh(new T.CylinderGeometry(1.22,1.35,.12,32),stone);base.position.y=.02;base.receiveShadow=true;object.add(base);
    const boundary=new T.Mesh(new T.RingGeometry(portal.safeRadius-.045,portal.safeRadius,64),new T.MeshBasicMaterial({color:'#87dab3',transparent:true,opacity:.38,side:T.DoubleSide,depthWrite:false}));boundary.rotation.x=-Math.PI/2;boundary.position.y=.035;object.add(boundary);
    const runes=new T.Group();runes.position.y=1.18;object.add(runes);
    for(let i=0;i<8;i++){const angle=i*Math.PI/4,rune=new T.Mesh(new T.OctahedronGeometry(.07),glow);rune.position.set(Math.cos(angle)*1.1,Math.sin(angle)*1.1,.06);runes.add(rune);}
    return {portal,object,kind:'travel' as const,runes,surface};
  });
  return {portals,update(location:LocationId,time:number){for(const gate of portals){gate.object.visible=gate.portal.location===location;if(gate.object.visible){gate.runes.rotation.z=time*.13;gate.surface.scale.setScalar(.94+Math.sin(time*2)*.035);}}}};
}
