import * as T from './vendor/three.module.js';
import {loadWarrior} from './character.js';
import {mesh} from './models.js';
import {itemArtwork} from './item-icons.js';
import {itemDisplayName} from './equipment-items.js';
import {itemClassName,itemShownClass,itemWrongClass} from '../rules.js';
import {SHOP} from './shop.js';
import {sameLocation} from './world-layout.js';
import {PERSONAL_CHEST,insideHouse} from './camp-layout.js';
import type {createCampHouse} from './camp-house.js';
type InteractionKind='loot'|'vendor'|'portal'|'chest'|'travel';
import type {NetworkGame} from './network.js';
import type {GroundDrop} from '../../shared/types.js';
import type {WarriorPose} from './render-types.js';

export async function createWorldInteractions(scene:T.Scene,game:NetworkGame,choose:(kind:InteractionKind,id:string)=>void,portals:readonly {portal:{id:string;name:string;x:number;z:number};object:T.Group;kind?:'travel'}[]=[],campHouse?:ReturnType<typeof createCampHouse>) {
  const layer=document.createElement('div');layer.className='world-interaction-layer';layer.setAttribute('aria-label','Добыча, торговец и порталы');document.body.append(layer);
  const vendor=await loadWarrior('mage');vendor.root.position.set(SHOP.x,0,SHOP.z);vendor.root.rotation.y=.4;scene.add(vendor.root);
  const idle:WarriorPose={classId:'mage',weapon:'sword',dead:0,attack:null,hurt:0,gait:0,moveBlend:0,runBlend:0,appearance:{weapon:null,armor:'acolyte-armor',helmet:null,boots:'acolyte-boots'}};
  const vendorMeshes:T.Object3D[]=[];vendor.root.traverse(object=>{if(object instanceof T.Mesh)vendorMeshes.push(object);});
  const vendorLabel=document.createElement('button');vendorLabel.type='button';vendorLabel.className='vendor-world-label';vendorLabel.innerHTML='<span>Торговец</span><small>Снаряжение · ЛКМ</small>';vendorLabel.onclick=()=>choose('vendor',SHOP.id);layer.append(vendorLabel);
  const chestLabel=document.createElement('button');chestLabel.type='button';chestLabel.className='vendor-world-label chest-world-label';chestLabel.innerHTML='<span>Личный сундук</span><small>Хранилище · ЛКМ</small>';chestLabel.onclick=()=>choose('chest',PERSONAL_CHEST.id);layer.append(chestLabel);
  const portalLabels=portals.map(entry=>{
    const label=document.createElement('button');label.type='button';label.className='vendor-world-label portal-world-label';
    const title=document.createElement('span');title.textContent=entry.portal.name;
    const hint=document.createElement('small');hint.textContent=entry.kind==='travel'?'Выбор места · за золото · ЛКМ':'minLevel' in entry.portal?'Проход · ЛКМ или идите вперёд':'Портал · ЛКМ';label.append(title,hint);
    label.setAttribute('aria-label',`${entry.kind==='travel'?'Телепорт':'minLevel' in entry.portal?'Проход':'Портал'}: ${entry.portal.name}`);label.onclick=()=>choose(entry.kind??'portal',entry.portal.id);layer.append(label);
    return {...entry,label};
  });
  const drops=new Map<string,{model:T.Group;label:HTMLButtonElement}>();
  const floor=new T.MeshStandardMaterial({color:'#9b895e',roughness:.95});
  const stall=new T.Group();stall.position.set(SHOP.x+1.2,0,SHOP.z-.8);scene.add(stall);
  mesh(stall,new T.BoxGeometry(.95,.55,.6),floor,0,.28,0);
  mesh(stall,new T.BoxGeometry(1.04,.08,.68),new T.MeshStandardMaterial({color:'#3c4c3f'}),0,.6,0);
  for(const x of [-.34,0,.34])mesh(stall,new T.CylinderGeometry(.10,.11,.18,8),new T.MeshStandardMaterial({color:x===0?'#a77a42':'#66795b',metalness:.35,roughness:.55}),x,.72,0);
  const goldMaterial=new T.MeshStandardMaterial({color:'#e5b258',emissive:'#885619',emissiveIntensity:.22,metalness:.7,roughness:.4});
  function add(drop:GroundDrop){
    const model=new T.Group();model.position.set(drop.x,.05,drop.z);
    if(drop.kind==='gold'){
      for(let i=0;i<4;i++){const coin=mesh(model,new T.CylinderGeometry(.12,.12,.045,8),goldMaterial,(i%2)*.17-.09,.035+Math.floor(i/2)*.03,(i%3)*.09-.08);coin.rotation.z=i*.12;}
    }else{
      const material=new T.MeshStandardMaterial({color:'#889d93',metalness:.35,roughness:.65});
      if(drop.item?.slot==='weapon'){
        const blade=mesh(model,new T.BoxGeometry(.075,.04,.75),material,0,.1,0);blade.rotation.y=.6;
        const grip=mesh(model,new T.BoxGeometry(.25,.05,.06),goldMaterial,-.16,.12,-.24);grip.rotation.y=.6;
      }else{
        const bundle=mesh(model,new T.BoxGeometry(.35,.14,.28),new T.MeshStandardMaterial({color:drop.item?.slot==='armor'?'#70857c':'#948567'}),0,.13,0);bundle.rotation.y=.4;
        mesh(model,new T.BoxGeometry(.045,.15,.3),new T.MeshStandardMaterial({color:'#4e4c34'}),0,.14,0).rotation.y=.4;
      }
      const color=drop.item?.rarity===4?'#c58aeb':drop.item?.rarity===3?'#e3b84f':drop.item?.rarity===2?'#79b9e0':drop.item?.rarity===1?'#84be70':'#d6d9d5';
      const ring=mesh(model,new T.RingGeometry(.23,.28,24),new T.MeshBasicMaterial({color,transparent:true,opacity:.6,side:T.DoubleSide,depthWrite:false}),0,.01,0);ring.rotation.x=-Math.PI/2;ring.castShadow=false;
    }
    const label=document.createElement('button');label.type='button';label.className=`ground-loot-label ${drop.kind==='gold'?'gold':`rarity-${drop.item?.rarity||0}`}`;
    if(drop.item){
      const icon=document.createElement('span');icon.className='ground-loot-icon';icon.innerHTML=itemArtwork(drop.item,drop.item.classId||game.player.classId);label.append(icon);
      const text=document.createElement('span');text.className='ground-loot-text';
      const name=document.createElement('span');name.className='ground-loot-name';name.textContent=itemDisplayName(drop.item.name);
      const klass=document.createElement('small');klass.className='ground-loot-class';klass.textContent=itemClassName(itemShownClass(drop.item));
      if(itemWrongClass(game.player,drop.item)){label.classList.add('wrong-class');klass.textContent=`${itemClassName(itemShownClass(drop.item))} · нельзя надеть`;}
      text.append(name,klass);label.append(text);label.setAttribute('aria-label',`Подобрать: ${name.textContent} · ${klass.textContent}`);
    }else{
      const name=document.createElement('span');name.textContent=`${drop.amount||0} золота`;label.append(name);label.setAttribute('aria-label',`Подобрать: ${name.textContent}`);
    }
    label.onclick=()=>choose('loot',drop.id);layer.append(label);
    scene.add(model);drops.set(drop.id,{model,label});
  }
  const screen=new T.Vector3();
  function positionLabel(label:HTMLElement,x:number,y:number,z:number,camera:T.Camera,width:number,height:number){
    screen.set(x,y,z).project(camera);
    const visible=sameLocation({x,z},game.player)&&screen.z>=-1&&screen.z<=1&&Math.abs(screen.x)<1.05&&Math.abs(screen.y)<1.05&&Math.hypot(x-game.player.x,z-game.player.z)<23;
    label.hidden=!visible;if(visible)label.style.transform=`translate(${(screen.x*.5+.5)*width}px,${(-screen.y*.5+.5)*height}px) translate(-50%,-100%)`;
    return visible;
  }
  function update(dt:number,camera:T.Camera,width:number,height:number,enabled:boolean){
    layer.hidden=!enabled;
    vendor.root.visible=Math.hypot(game.player.x-SHOP.x,game.player.z-SHOP.z)<25;
    vendor.animate(dt,idle,vendor.root.visible);positionLabel(vendorLabel,SHOP.x,2.2,SHOP.z,camera,width,height);
    for(const {portal,label} of portalLabels){positionLabel(label,portal.x,3.15,portal.z,camera,width,height);label.classList.toggle('targeted',game.player.interactionTarget?.id===portal.id);}
    if(campHouse&&insideHouse(game.player,.38)){positionLabel(chestLabel,PERSONAL_CHEST.x,1.35,PERSONAL_CHEST.z,camera,width,height);chestLabel.classList.toggle('targeted',game.player.interactionTarget?.id===PERSONAL_CHEST.id);}else chestLabel.hidden=true;
    const active=new Set(game.groundLoot.map(drop=>drop.id));
    for(const [id,value] of drops)if(!active.has(id)){value.model.removeFromParent();value.label.remove();value.model.traverse(object=>{if(object instanceof T.Mesh){object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];for(const material of materials)if(material!==goldMaterial)material.dispose();}});drops.delete(id);}
    for(const drop of game.groundLoot){if(!drops.has(drop.id))add(drop);const value=drops.get(drop.id)!;value.model.visible=positionLabel(value.label,drop.x,.55,drop.z,camera,width,height);value.label.classList.toggle('targeted',game.player.interactionTarget?.id===drop.id);}
  }
  function pick(raycaster:T.Raycaster):{kind:InteractionKind;id:string}|null{
    let closest=Infinity,result:{kind:InteractionKind;id:string}|null=null;
    for(const [id,value] of drops){if(!value.model.visible)continue;const hit=raycaster.intersectObject(value.model,true)[0];if(hit&&hit.distance<closest){closest=hit.distance;result={kind:'loot',id};}}
    if(vendor.root.visible){const hit=raycaster.intersectObjects(vendorMeshes,false)[0];if(hit&&hit.distance<closest){closest=hit.distance;result={kind:'vendor',id:SHOP.id};}}
    for(const {portal,object,kind} of portals){if(!sameLocation(portal,game.player))continue;const hit=raycaster.intersectObject(object,true)[0];if(hit&&hit.distance<closest){closest=hit.distance;result={kind:kind??'portal',id:portal.id};}}
    if(campHouse&&insideHouse(game.player,.38)){const hit=raycaster.intersectObjects(campHouse.pickMeshes,false)[0];if(hit&&hit.distance<closest)result={kind:'chest',id:PERSONAL_CHEST.id};}
    return result;
  }
  return {update,pick};
}
