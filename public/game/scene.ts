import {bindAfkSettings} from './afk-settings-ui.js';
import {bindTargetPresentation} from './target-presentation.js';
import {SHOP} from './shop.js';
import * as T from './vendor/three.module.js';
import {mesh} from './models.js';
import {loadWarrior} from './character.js';
import {createMob,loadMobAssets,type MobAssets} from './mobs.js';
import {createEnvironment} from './environment.js';
import {assignedConsumable,consumableQuantity} from './consumables.js';
import {actionIcon} from './action-icons.js';
import {createWorldInteractions} from './world-interactions.js';
import {drawWorldMapBackdrop} from './minimap-world.js';
import {WORLD_CLEARINGS,boundsForPosition,locationAt,sameLocation} from './world-layout.js';
import {SNOW_PASSAGES} from './snow.js';
import {createSnowEnvironment} from './snow-environment.js';
import {PORTALS} from './stadium.js';
import {createStadiumEnvironment} from './stadium-environment.js';
import {angleDelta,gaitProfile} from './motion.js';
import {CAMERA,WEAPONS,mobConfig,safe,AFK_SPOTS,afkSpotAt} from './location.js';

import {NetworkGame} from './network.js';
import {bindInterface} from './interface.js';
import {bindResponsiveChat} from './responsive-chat.js';
import {skillsForClass} from './skills.js';
import {createSkillEffects} from './skill-effects.js';
import {createSkillProjectile,updateSkillProjectile,disposeSkillProjectile} from './skill-projectiles.js';
import {classFor} from '../rules.js';
import {Benchmark,stressEnabled} from './benchmark.js';
import {heldMouseInput} from './mouse-input.js';
import {element as $,errorMessage} from './ui-types.js';
import type {Point,PublicPlayer,PublicMob,WeaponId} from '../../shared/types.js';
type Warrior=Awaited<ReturnType<typeof loadWarrior>>;
type MobModel=ReturnType<typeof createMob> & {pickMeshes:T.Mesh[]};
type RemoteWarrior=Warrior & {label:HTMLDivElement};
type VisualHero=Pick<PublicPlayer,'id'|'x'|'z'|'yaw'|'gait'|'runBlend'|'moveBlend'|'dead'|'weapon'|'classId'|'hurt'|'attack'|'appearance'>;
interface FloatingNumber {element:HTMLSpanElement;x:number;z:number;y:number;life:number}
interface Particle {mesh:T.Mesh<T.IcosahedronGeometry,T.MeshBasicMaterial>;v:T.Vector3;life:number}
interface HeldMouse {x:number;y:number;active:boolean;point:T.Vector3|null;held:boolean;attacking:boolean;pointerId:number|null;pickPending:boolean}

let benchmark:Benchmark|undefined,skillEffects:ReturnType<typeof createSkillEffects>|undefined,worldInteractions:Awaited<ReturnType<typeof createWorldInteractions>>|undefined;
const canvas=$('scene');
let renderer:T.WebGLRenderer,scene:T.Scene,camera:T.OrthographicCamera,sun:T.DirectionalLight,world:ReturnType<typeof createEnvironment>,warrior:Warrior,game:NetworkGame,ready=false,last=0,time=0,accumulator=0;
let afkSettings:ReturnType<typeof bindAfkSettings>|undefined;
let selectedEntity:{kind:'vendor'|'player';id:string}|null=null,updateTarget:ReturnType<typeof bindTargetPresentation>|undefined;
let width=innerWidth,height=innerHeight,selected:number|null=null,pendingWeapon:WeaponId|null=null;
let noticeTimer:ReturnType<typeof setTimeout>|undefined=undefined,lastSafeToast=0,uiTimer=0,frames:number[]=[],frameCounter=0,paused=false;
let snow:ReturnType<typeof createSnowEnvironment>,forestRegion:T.Scene,stadiumRegion:T.Scene;
let mobAssets:MobAssets,stadium:ReturnType<typeof createStadiumEnvironment>;
let targetZoom=1,interfaceUI:ReturnType<typeof bindInterface>;
const remoteModels=new Map<string,RemoteWarrior>(),loadingPlayers=new Set<string>(),visualHeroes=new Map<string,VisualHero>(),visualMobs=new Map<number,PublicMob>(),shots=new Map<string,T.Group>();
const ZOOM={min:.7,max:1.9,sensitivity:.0015};
const keys=new Set<string>(),models=new Map<number,MobModel>(),particles:Particle[]=[],floats:FloatingNumber[]=[];
const raycaster=new T.Raycaster(),ndc=new T.Vector2(),groundPlane=new T.Plane(new T.Vector3(0,1,0),0),cameraTarget=new T.Vector3(.5,.3,2);
const mouse:HeldMouse={x:0,y:0,active:false,point:null,held:false,attacking:false,pointerId:null,pickPending:false};
// Five metres cover the full animated actor and its shadow beyond the viewport.
// Keep pose bookkeeping current, but sample/draw only groups near the camera.
const actorFrustum=new T.Frustum(),actorProjection=new T.Matrix4(),actorBounds=new T.Sphere(new T.Vector3(),5);
function actorVisible(p:Point){actorBounds.center.set(p.x,1,p.z);return actorFrustum.intersectsSphere(actorBounds);}
const marker=new T.Group();
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
const mini=$('minimap'),map=mini.getContext('2d')!;
const lootGeometry=new T.IcosahedronGeometry(.11,0),lootMaterial=new T.MeshStandardMaterial({color:'#e5b258',emissive:'#8a5a1e',emissiveIntensity:.3,metalness:.65,roughness:.35});

function toast(message:string){$('notice').textContent=message;$('notice').classList.add('visible');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').classList.remove('visible'),2400);}
function fitCamera(){
  width=innerWidth;height=innerHeight;if(!renderer)return;
  renderer.setPixelRatio(benchmark?.variant==='low-resolution'?.75:Math.min(devicePixelRatio||1,1.25));renderer.setSize(width,height,false);
  const half=7.1;camera.left=-half*width/height;camera.right=half*width/height;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();
}
function updateCamera(dt:number){
  if(camera.zoom!==targetZoom){
    const next=camera.zoom+(targetZoom-camera.zoom)*(1-Math.exp(-12*dt));
    camera.zoom=Math.abs(next-targetZoom)<.0001?targetZoom:next;
    camera.updateProjectionMatrix();
  }
  const hero=game.player,follow=new T.Vector3(hero.x,.3,hero.z);cameraTarget.lerp(follow,1-Math.exp(-7*dt));
  const d=28,ce=Math.cos(CAMERA.elevation);
  camera.position.set(cameraTarget.x+Math.sin(CAMERA.azimuth)*ce*d,cameraTarget.y+Math.sin(CAMERA.elevation)*d,cameraTarget.z+Math.cos(CAMERA.azimuth)*ce*d);
  camera.lookAt(cameraTarget);camera.updateMatrixWorld();actorFrustum.setFromProjectionMatrix(actorProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  sun.position.set(hero.x-8,15,hero.z+7);sun.target.position.set(hero.x,0,hero.z);
}
function pickGround(){
  if(!mouse.active)return null;ndc.set(mouse.x/width*2-1,1-mouse.y/height*2);raycaster.setFromCamera(ndc,camera);
  return raycaster.ray.intersectPlane(groundPlane,new T.Vector3());
}
function pickMob(){
  const objects:T.Mesh[]=[];for(const mob of game.mobs){const model=models.get(mob.id);if(!model||!model.root.visible||mob.state==='dead')continue;objects.push(...model.pickMeshes);}
  const direct:unknown=raycaster.intersectObjects(objects,false)[0]?.object.userData.mob;if(typeof direct==='number')return direct;
  // Slimmer legs and a tapered muzzle should not demand pixel-perfect clicks.
  const box=new T.Box3(),point=new T.Vector3();let nearest=Infinity,id:number|null=null;
  for(const mob of game.mobs){
    const model=models.get(mob.id);if(!model||!model.root.visible||mob.state==='dead')continue;
    box.setFromObject(model.pickRoot).expandByScalar(.12);
    if(raycaster.ray.intersectBox(box,point)){const d=point.distanceToSquared(raycaster.ray.origin);if(d<nearest){nearest=d;id=mob.id;}}
  }
  return id;
}
function selectedMob(){return selected===null?null:game.mobs.find(mob=>mob.id===selected);}
function toggleRun(){
  if(!ready||game.player.dead)return;
  game.toggleRun(); // The movement button updates when the server confirms the mode.
}
function chooseWeapon(id:unknown){
  if(!ready||(id!=='sword'&&id!=='axe')||game.player.dead)return;pendingWeapon=null;
  if(game.player.items.some(item=>item.id===game.player.equipment.weapon&&item.definitionId)){toast('Вид оружия определяется надетым предметом');return;}
  if(id===game.player.weapon)return;if(game.player.attack){pendingWeapon=id;return;}
  game.weapon(id);toast(WEAPONS[id].name);updateUI();
}
function combatAim(point:Point|null=null){
  // A ray through an elevated animal meets the ground behind it in isometric
  // view. Aim at the picked animal's feet instead of that projected ground.
  let mob=selectedMob();
  if(mouse.active){mouse.point=pickGround();const id=pickMob();mob=id===null?null:game.mobs.find(m=>m.id===id);if(id!==null){selected=id;selectedEntity=null;}}
  const target=mob&&mob.state!=='dead'?{x:mob.x,z:mob.z}:point||mouse.point;
  return {targetId:mob?.id,target:target?{x:target.x,z:target.z}:undefined,yaw:target?Math.atan2(target.x-game.player.x,target.z-game.player.z):game.player.yaw};
}
function attackAt(point:Point|null=null){
  if(!ready)return;const aim=combatAim(point);game.attack(aim.yaw,false,aim.targetId);
}
function toggleAfk(){if(!ready)return;releaseMovement();game.setAfk(!game.player.afk);}
function cancelAfk(){if(game?.player.afk)game.setAfk(false);}
function castSkill(slot:number){
  if(!ready||!game.connected||game.player.dead||game.player.attack)return;const skill=skillsForClass(game.player.classId)[slot],aim=combatAim();
  if(skill&&(game.player.skillCooldowns?.[skill.id]||0)<=0&&game.player.mana>=skill.manaCost)game.skill(skill.id,aim.yaw,{targetId:aim.targetId,target:aim.target});
}
function releaseMovement(){
  const id=mouse.pointerId,wasHeld=mouse.held||mouse.attacking;
  mouse.held=false;mouse.attacking=false;mouse.pointerId=null;mouse.pickPending=false;
  if(id!==null&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
  if(wasHeld)game?.stopInput();
}
function clearInput(){keys.clear();releaseMovement();mouse.active=false;mouse.point=null;game?.stopInput();if(game?.connected&&game.player.interactionTarget)game.send({type:'cancelInteraction'});}
function chooseInteraction(kind:'loot'|'vendor'|'portal'|'chest',id:string){
  if(!ready||!game.connected||game.player.dead)return;
  if(kind==='vendor'){selected=null;selectedEntity={kind:'vendor',id};}
  releaseMovement();keys.clear();cancelAfk();game.send(kind==='loot'?{type:'pickup',id}:kind==='portal'?{type:'portal',portalId:id}:{type:'interact',npcId:id});
}
function returnToCamp(){
  if(!ready)return;
  if(!safe(game.player)&&game.mobs.some(m=>['chase','windup','recover'].includes(m.state)&&distance(m,game.player)<8)){toast('Сначала оторвитесь от врагов');return;}
  clearInput();game.returnToCamp();selected=null;
}
function number(event:Point & {amount?:number},kind=''){const element=document.createElement('span');element.className='damage-number '+kind;element.textContent=kind==='miss'?'Промах':(kind==='heal'?'+':kind==='loot'?'+':'')+String(event.amount);$('world-ui').append(element);floats.push({element,x:event.x,z:event.z,y:kind==='hurt'?2.2:1.5,life:.95});}
function resetLocationView(){
  clearInput();selected=null;selectedEntity=null;pendingWeapon=null;visualHeroes.clear();visualMobs.clear();
  cameraTarget.set(game.player.x,.3,game.player.z);updateCamera(0);
  for(const model of shots.values())disposeSkillProjectile(model);shots.clear();skillEffects?.clear();
  for(const particle of particles){particle.mesh.removeFromParent();particle.mesh.material.dispose();}particles.length=0;
  for(const floating of floats)floating.element.remove();floats.length=0;
}
function processEvents(){
  let gainedLevel=null;
  for(const event of game.events.splice(0)){
    interfaceUI.onEvent?.(event);afkSettings?.onEvent(event);
    if(event.type==='skillImpact')skillEffects?.impact(event);
    if(event.type==='notice')toast(event.text);
    if(event.type==='item')toast(`Получено: ${event.name}${event.pending?' · ожидает в рюкзаке':''}`);
    if(event.type==='level')gainedLevel=event.level;
    if(event.type==='miss')number(event,'miss');
    if(event.type==='hit'){
      number(event);for(let i=0;i<6;i++){const p=mesh(scene,lootGeometry,new T.MeshBasicMaterial({color:i%2?'#edc387':'#e6a17e'}),event.x,.7,event.z);p.castShadow=false;particles.push({mesh:p,v:new T.Vector3((Math.random()-.5)*3,1+Math.random()*2,(Math.random()-.5)*3),life:.25+Math.random()*.18});}
    }
    if(event.type==='hurt')number(event,'hurt');
    if(event.type==='heal')number(event,'heal');
    if(event.type==='loot')number(event,'loot');
    if(event.type==='kill'){toast(`${event.name} повержен · +${event.xp} опыта`);}
    if(event.type==='safe'&&time-lastSafeToast>1.5){lastSafeToast=time;toast(locationAt(game.player)==='snow'?'Укрытие у перевала. Дальше начинается снежная охота':locationAt(game.player)==='stadium'?'Безопасная площадка. Пройдите в один из четырёх загонов':'Лагерь безопасен. Выйдите на лесную тропу');}
    if(event.type==='death'){clearInput();pendingWeapon=null;selected=null;}
    if(event.type==='portal'){resetLocationView();toast(event.location==='snow'?'Снежный предел · восемь охотничьих спотов':event.location==='stadium'?'Стадиум · четыре загона для охоты':'Пепельная опушка');}
    if(event.type==='camp'){resetLocationView();toast('У костра восстанавливаются здоровье, мана и зелья');}
    if(event.type==='quest')toast('Опушка очищена! Награда: 50 золота');
  }
  // Kill/loot events arrive in the same snapshot: keep level progression visible.
  if(gainedLevel!==null)toast(`Новый уровень: ${gainedLevel} · доступны очки характеристик · C`);
}
function tick(dt:number){
  processEvents();
  if(!game.connected){processEvents();return;}
  const hero=game.player;
  if(hero.afk){game.update(dt,{x:0,z:0,aim:null});processEvents();return;}
  const input=heldMouseInput(hero,mouse.point,{held:mouse.held});
  const heldSkill=['Digit1','Digit2','Digit3','Digit4'].findIndex(code=>keys.has(code));
  if(heldSkill>=0&&!safe(hero)){input.x=input.z=0;castSkill(heldSkill);}
  else if((keys.has('Space')||mouse.attacking)&&!safe(hero)){input.x=input.z=0;attackAt();}
  game.update(dt,input);
  if(pendingWeapon&&!hero.attack)chooseWeapon(pendingWeapon);
  processEvents();
}
function mapPosition(p:Point){const BOUNDS=boundsForPosition(game.player);return {x:10+(p.x-BOUNDS.minX)/(BOUNDS.maxX-BOUNDS.minX)*(mini.width-20),y:8+(p.z-BOUNDS.minZ)/(BOUNDS.maxZ-BOUNDS.minZ)*(mini.height-16)};}
function drawMap(){
  drawWorldMapBackdrop(map,mini.width,mini.height,game.player);
  const BOUNDS=boundsForPosition(game.player);
  for(const spot of AFK_SPOTS){if(!sameLocation(spot,game.player))continue;const p=mapPosition(spot);map.strokeStyle='#82a497';map.lineWidth=1.2;map.beginPath();map.ellipse(p.x,p.y,spot.radius/(BOUNDS.maxX-BOUNDS.minX)*(mini.width-20),spot.radius/(BOUNDS.maxZ-BOUNDS.minZ)*(mini.height-16),0,0,Math.PI*2);map.stroke();}
  if(game.player.afk){const p=mapPosition(game.player.afk.anchor??game.player),radius=game.player.afkRadius??0;map.strokeStyle='#dfc98a';map.lineWidth=1.5;map.beginPath();map.ellipse(p.x,p.y,radius/(BOUNDS.maxX-BOUNDS.minX)*(mini.width-20),radius/(BOUNDS.maxZ-BOUNDS.minZ)*(mini.height-16),0,0,Math.PI*2);map.stroke();}
  for(const portal of [...PORTALS,...SNOW_PASSAGES]){if(!sameLocation(portal,game.player))continue;const p=mapPosition(portal);map.strokeStyle='#86dfe4';map.lineWidth=2;map.strokeRect(p.x-3,p.y-3,6,6);}
  for(const m of game.mobs){if(m.state==='dead')continue;const p=mapPosition(m);map.fillStyle=m.eliteId?'#edba70':'#c27461';map.beginPath();map.arc(p.x,p.y,m.eliteId?3:2.2,0,Math.PI*2);map.fill();}
  for(const other of game.players){if(other.id===game.id)continue;const p=mapPosition(other);map.fillStyle='#80cddd';map.beginPath();map.arc(p.x,p.y,2.8,0,Math.PI*2);map.fill();}
  const p=mapPosition(game.player);map.fillStyle='#f4e5bb';map.beginPath();map.arc(p.x,p.y,3,0,Math.PI*2);map.fill();map.strokeStyle='#eff3d0';map.beginPath();map.moveTo(p.x,p.y);map.lineTo(p.x+Math.sin(game.player.yaw)*7,p.y+Math.cos(game.player.yaw)*7);map.stroke();
}
function updateUI(){
  const hero=game.player,camp=safe(hero),mob=selectedMob(),inStadium=locationAt(hero)==='stadium',inSnow=locationAt(hero)==='snow';
  $('location-name').textContent=inSnow?'Снежный предел':inStadium?'Стадиум':'Пепельная опушка';
  $('map-legend').innerHTML=inSnow?'<span>ПЕРЕВАЛ</span><span>◯ СПОТЫ</span><span>ЛЕДНИК</span>':inStadium?'<span>I · ВОЛКИ</span><span>II · КАБАНЫ</span><span>III · ВОЖАКИ</span><span>IV · МЕДВЕДИ</span>':'<span>ЛАГЕРЬ</span><span>◯ СПОТЫ</span><span>РУИНЫ</span>';
  mini.setAttribute('aria-label',inSnow?'Снежный предел: перевал на западе, восемь спотов и ледник на востоке.':inStadium?'Стадиум: четыре загона на севере, безопасная площадка и портал на юге.':'Карта Пепельной опушки: лагерь, пять спотов и руины.');
  $('forest-quest').hidden=inStadium||inSnow;$('stadium-guide').hidden=!inStadium;document.getElementById('snow-guide')!.hidden=!inSnow;
  const spot=afkSpotAt(hero);
  const clearing=WORLD_CLEARINGS.find(field=>Math.hypot(hero.x-field.x,hero.z-field.z)<field.radius);
  $('zone-state').textContent=camp?(inSnow?'Укрытие у перевала':inStadium?'Безопасная площадка':'Безопасный лагерь'):spot?spot.name:inSnow?'Снежный предел · опасная зона':inStadium?'Стадиум · входы в загоны':Math.hypot(hero.x-25,hero.z+1.2)<6?'Старые руины · вожак':clearing?`${clearing.id==='camp'?'Окраина лагеря':clearing.name} · опасная зона`:'Пепельная опушка · опасная зона';
  const afk=$('afk-toggle');afk.disabled=!game.connected||!!hero.dead;afk.setAttribute('aria-pressed',String(!!hero.afk));afk.title=hero.afk?`Остановить автоохоту · F. Радиус атак: ${(hero.afkRadius??0).toFixed(1)} м.`:'Включить автоохоту здесь · F. Герой остаётся на месте; в безопасной зоне ждёт.';
  $('afk-status').textContent=hero.afk?(camp?'Автоохота · ожидание':'Автоохота включена'):'Автоохота';$('zone-state').classList.toggle('safe',camp);
  $('hp-text').textContent=`${Math.ceil(hero.hp)} / ${Math.ceil(hero.maxHp)}`;$('hp-fill').style.height=`${Math.max(0,Math.min(1,hero.hp/hero.maxHp||0))*100}%`;
  $('hp-orb').setAttribute('aria-valuemax',String(hero.maxHp));$('hp-orb').setAttribute('aria-valuenow',String(Math.ceil(hero.hp)));
  for(const [slot,id,countId] of [['q','potion','potions'],['w','mana-potion','mana-potions']] as const){
    const button=$(id) as HTMLButtonElement,definition=assignedConsumable(hero,slot),count=definition?consumableQuantity(hero,definition.id):0;
    $(countId).textContent=String(count);button.classList.toggle('quick-empty',!definition);button.classList.toggle('quick-unavailable',!game.connected||!!hero.dead||!definition||count===0||!!(definition?.kind==='mana'?hero.manaPotionCooldown:hero.potionCooldown)||!!definition&&(definition.kind==='mana'?hero.mana>=hero.maxMana:hero.hp>=hero.maxHp));
    const art=button.querySelector<HTMLElement>('.potion-icon')!;const iconKey=definition?definition.kind==='mana'?'mana-potion':'potion':'empty';if(art.dataset.icon!==iconKey){art.innerHTML=definition?actionIcon(iconKey):'<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M25 8h14v13c0 5 13 14 13 24 0 18-40 18-40 0 0-10 13-19 13-24Z" fill="none" stroke="#a8afa5" stroke-width="3" stroke-dasharray="4 3"/><path d="M23 6h18v9H23Z" fill="none" stroke="#a8afa5" stroke-width="3"/></svg>';art.dataset.icon=iconKey;}
    button.querySelector('.action-name')!.textContent=definition?definition.kind==='hp'?'HP':'MP':'Пусто';
    button.querySelector('small')!.textContent=definition?definition.name:'Зелье';
    button.title=definition?`${definition.name} · ${count} шт. · восстановить ${definition.restore} ${definition.kind==='hp'?'HP':'MP'} · ${slot.toUpperCase()} · перетащите другое зелье для замены`:`${slot.toUpperCase()}: пустой слот · перетащите зелье из рюкзака`;
    button.setAttribute('aria-label',button.title);
  }
  $('movement-label').textContent=hero.running?'Бег':'Ходьба';$('movement').setAttribute('aria-pressed',String(hero.running));$('movement').disabled=!!hero.dead;
  $('movement').title=hero.running?'Перейти на ходьбу · Shift':'Перейти на бег · Shift';
  $('attack').disabled=!!hero.dead;$('reset').disabled=!!hero.dead;
  $('death-screen').hidden=!hero.dead;$('hurt-vignette').style.opacity=String(hero.hurt*.9);
  $('kills-goal').innerHTML=`Победите существ: <b>${Math.min(5,hero.questKills)} / 5</b>`;$('kills-goal').classList.toggle('done',hero.questKills>=5);$('boss-goal').classList.toggle('done',hero.boss);$('camp-goal').classList.toggle('done',hero.questClaimed);
  $('quest-hint').textContent=hero.questClaimed?'Задание выполнено. Можно продолжить охоту.':hero.questKills>=5&&hero.boss?'Возвращайтесь в безопасный лагерь.':hero.questKills>=5?'Вожак ждёт у руин, дальше по тропе.':'Идите по тропе направо, за указатель.';
  if(selectedEntity?.kind==='vendor'){
    if(sameLocation(SHOP,hero)&&distance(SHOP,hero)<23)updateTarget?.({kind:'vendor',id:SHOP.id,name:SHOP.name,subtitle:'Снаряжение и припасы',x:SHOP.x,z:SHOP.z});else{selectedEntity=null;updateTarget?.(null);}
  }else if(selectedEntity?.kind==='player'){
    const other=game.players.find(p=>p.id===selectedEntity?.id);if(other&&other.connected&&sameLocation(other,hero)&&distance(other,hero)<23)updateTarget?.({kind:'player',...other});else{selectedEntity=null;updateTarget?.(null);}
  }else updateTarget?.(mob&&mob.state!=='dead'&&distance(mob,hero)<23?{kind:'mob',type:mob.type,eliteId:mob.eliteId,name:mobConfig(mob).name,x:mob.x,z:mob.z,hp:mob.hp,maxHp:mobConfig(mob).hp}:null);
  for(const button of document.querySelectorAll<HTMLButtonElement>('[data-weapon]')){const active=button.dataset.weapon===hero.weapon;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));button.disabled=!!hero.dead||!!hero.items.find(item=>item.id===hero.equipment.weapon&&item.definitionId);}
  $('cooldown').style.transform=`scaleX(${hero.attack?1-hero.attack.age/hero.attack.duration:0})`;
  interfaceUI.update();afkSettings?.update();drawMap();
}
function visualActor(source:VisualHero,dt:number){
  let v=visualHeroes.get(source.id);
  if(!v){v={...source};visualHeroes.set(source.id,v);}
  const before={x:v.x,z:v.z},x=v.x,z=v.z,yaw=v.yaw,gait=v.gait||0;
  Object.assign(v,source);
  const snap=distance({x,z},source)>3,blend=1-Math.exp(-22*dt);
  v.x=snap?source.x:x+(source.x-x)*blend;v.z=snap?source.z:z+(source.z-z)*blend;v.yaw=yaw+angleDelta(yaw,source.yaw)*blend;
  v.gait=snap?source.gait:gait+distance(before,v)/gaitProfile(v.runBlend).stride*Math.PI*2;
  if(source.attack)v.attack={...source.attack,age:Math.min(source.attack.duration,source.attack.age+Math.min(.1,(performance.now()-game.receivedAt)/1000))};
  return v;
}
function renderPlayers(dt:number){
  const present=new Set<string>();
  for(const p of game.players){
    if(p.id===game.id)continue;present.add(p.id);
    if(!remoteModels.has(p.id)&&!loadingPlayers.has(p.id)){
      loadingPlayers.add(p.id);loadWarrior(p.classId).then(model=>{
        loadingPlayers.delete(p.id);if(!game.players.some(other=>other.id===p.id))return;
        scene.add(model.root);model.root.position.set(p.x,0,p.z);
        const label=document.createElement('div');label.className='player-label';$('world-ui').append(label);remoteModels.set(p.id,Object.assign(model,{label}));
      }).catch(error=>console.error(error));
    }
    const model=remoteModels.get(p.id);if(!model)continue;
    const v=visualActor(p,dt);model.root.position.set(v.x,0,v.z);model.root.rotation.y=v.yaw;model.root.visible=actorVisible(v);model.animate(dt,v,model.root.visible&&!benchmark?.freezeAnimations);
    if(!model.root.visible||benchmark?.variant==='no-labels'){model.label.hidden=true;continue;}
    const projected=new T.Vector3(v.x,2.45,v.z).project(camera);
    model.label.textContent=`${p.name} · ${classFor(p.classId).name} ${p.level} · ${Math.ceil(p.hp)}/${p.maxHp}${p.connected?'':' · нет связи'}`;
    model.label.style.transform=`translate(${(projected.x*.5+.5)*width}px,${(-projected.y*.5+.5)*height}px) translate(-50%,-100%)`;
    model.label.hidden=Math.abs(projected.x)>1.2||Math.abs(projected.y)>1.2;
  }
  for(const [id,model] of remoteModels)if(!present.has(id)){model.root.removeFromParent();model.label.remove();model.mixer.stopAllAction();model.disposeExtras();const skeletons=new Set<T.Skeleton>();model.model.traverse(o=>{if(o instanceof T.SkinnedMesh)skeletons.add(o.skeleton);if(o instanceof T.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});for(const skeleton of skeletons)skeleton.dispose();remoteModels.delete(id);visualHeroes.delete(id);}
}
function renderShots(){
  const ids=new Set(game.projectiles.map(p=>p.id));
  for(const [id,model] of shots)if(!ids.has(id)){disposeSkillProjectile(model);shots.delete(id);}
  for(const p of game.projectiles){
    let model=shots.get(p.id);
    if(!model){model=createSkillProjectile(p);scene.add(model);shots.set(p.id,model);}
    const lead=Math.min(.075,(performance.now()-game.receivedAt)/1000,p.remaining/p.speed)*p.speed;
    model.position.set(p.x+Math.sin(p.yaw)*lead,1.05,p.z+Math.cos(p.yaw)*lead);model.rotation.y=p.yaw;
    updateSkillProjectile(model,p,time);
  }
}
function ensureMobModel(mob:PublicMob){
  let model=models.get(mob.id);
  if(!model){
    model=Object.assign(createMob(mob.type,mobAssets,mob.eliteId),{pickMeshes:[] as T.Mesh[]});
    model.pickRoot.traverse(object=>{if(object instanceof T.Mesh){object.userData.mob=mob.id;model!.pickMeshes.push(object);}});
    models.set(mob.id,model);scene.add(model.root);
  }
  return model;
}
function render(dt:number){
  if(!sameLocation(cameraTarget,game.player))resetLocationView();
  const hero=visualActor(game.player,dt);time+=dt;updateCamera(dt);mouse.point=pickGround();
  if(benchmark?.variant==='picking'){mouse.active=true;mouse.x=width*.5+Math.sin(time*2)*width*.18;mouse.y=height*.5;mouse.point=pickGround();pickMob();}
  if(mouse.held&&mouse.pickPending&&mouse.point){const picked=pickMob();if(picked!==null){selected=picked;selectedEntity=null;}mouse.pickPending=false;}
  warrior.root.position.set(hero.x,0,hero.z);warrior.root.rotation.set(0,hero.yaw,0);
  benchmark?.mark('camera-picking');
  warrior.animate(dt,hero,!benchmark?.freezeAnimations);
  marker.position.set(hero.x,.03,hero.z);marker.rotation.y=hero.yaw;marker.visible=!hero.dead;
  const region=locationAt(hero);document.body.classList.toggle('snow-region',region==='snow');forestRegion.visible=region==='forest';stadiumRegion.visible=region==='stadium';
  world.marker.visible=false;if(forestRegion.visible)world.animate(time);if(stadiumRegion.visible)stadium.animate(time);snow.animate(time,hero,region==='snow');
  const sky=region==='snow'?'#859eac':'#485b58';(scene.background as T.Color).set(sky);if(scene.fog instanceof T.FogExp2){scene.fog.color.set(sky);scene.fog.density=region==='snow'?.009:.014;}sun.color.set(region==='snow'?'#e2f0ff':'#ffe4bc');
  world.campHouse.update(game.player);renderPlayers(dt);renderShots();skillEffects?.update(dt);skillEffects?.slowMobs(game.mobs);
  const presentMobIds=new Set(game.mobs.map(mob=>mob.id));
  for(const [id,model] of models)if(!presentMobIds.has(id)){model.root.visible=false;visualMobs.delete(id);}
  for(const mob of game.mobs){
    let v=visualMobs.get(mob.id);if(!v){v={...mob};visualMobs.set(mob.id,v);}
    const x=v.x,z=v.z,yaw=v.yaw,blend=1-Math.exp(-18*dt);Object.assign(v,mob);
    if(Math.hypot(x-mob.x,z-mob.z)<3){v.x=x+(mob.x-x)*blend;v.z=z+(mob.z-z)*blend;}
    v.yaw=yaw+angleDelta(yaw,mob.yaw)*blend;
    const lag=Math.min(.1,(performance.now()-game.receivedAt)/1000);v.age+=lag;if(v.state==='windup')v.timer=Math.max(0,v.timer-lag);v.flash=Math.max(0,v.flash-lag);
    const model=ensureMobModel(mob);if(model){model.root.visible=actorVisible(v);model.animate(v,time,false,camera,model.root.visible&&!benchmark?.freezeAnimations);}
  }
  benchmark?.mark('actors');
  worldInteractions?.update(dt,camera,width,height,ready&&game.connected&&!game.player.dead);
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.v.y-=8*dt;p.mesh.position.addScaledVector(p.v,dt);if(p.life<=0){p.mesh.removeFromParent();p.mesh.material.dispose();particles.splice(i,1);}}
  for(let i=floats.length-1;i>=0;i--){const f=floats[i];f.life-=dt;f.y+=dt*.6;const p=new T.Vector3(f.x,f.y,f.z).project(camera);f.element.style.transform=`translate(${(p.x*.5+.5)*width}px,${(-p.y*.5+.5)*height}px)`;f.element.style.opacity=String(Math.min(1,f.life*4));if(f.life<=0){f.element.remove();floats.splice(i,1);}}
  uiTimer+=dt;if(uiTimer>.1){uiTimer=0;updateUI();}
  benchmark?.mark('effects-ui');benchmark?.gpuBegin();
  if(benchmark?.variant==='no-render'){renderer.info.reset();renderer.clear();}else renderer.render(scene,camera);benchmark?.end();
}
function loop(timestamp:number){
  if(!ready)return;const elapsed=last?(timestamp-last)/1000:1/60;last=timestamp;if(paused)return;
  benchmark?.begin(timestamp);
  if(benchmark?.variant==='scheduler'){renderer.info.reset();benchmark.end();return;}
  const dt=Math.min(elapsed,.15);accumulator+=dt;
  while(accumulator>=1/60){tick(1/60);accumulator-=1/60;}
  benchmark?.mark('simulation');render(dt);frames.push(elapsed);if(frames.length>90)frames.shift();if(++frameCounter%30===0)$('performance').textContent=`${Math.round(frames.length/frames.reduce((a,b)=>a+b,0))} FPS`;
}
async function start(){
  try{
    renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
    scene=new T.Scene();scene.background=new T.Color('#485b58');scene.fog=new T.FogExp2('#485b58',.014);
    camera=new T.OrthographicCamera(-10,10,7.1,-7.1,.1,100);fitCamera();scene.add(new T.HemisphereLight('#c4d7e0','#514a38',1.75));
    sun=new T.DirectionalLight('#ffe4bc',2.8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.radius=3.5;Object.assign(sun.shadow.camera,{left:-13,right:13,top:13,bottom:-13,near:.5,far:60});sun.shadow.normalBias=.035;sun.shadow.bias=-.00015;scene.add(sun,sun.target);
    const rim=new T.DirectionalLight('#b5d1e0',1.6);rim.position.set(4,7,-10);scene.add(rim);
    // Broad sky reflections keep the metal readable without hard mirror highlights.
    const lightRoom=new T.Scene();lightRoom.background=new T.Color('#839493');
    const lightPanels=[];
    for(const [x,y,z,w,h,d,color] of [[0,5,0,8,.1,8,'#e0e9e9'],[-5,1,2,.1,5,6,'#c5b798'],[4,2,-3,.1,6,5,'#a8bdc7']] as const){
      const panel=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshBasicMaterial({color,side:T.DoubleSide}));panel.position.set(x,y,z);lightRoom.add(panel);lightPanels.push(panel);
    }
    const pmrem=new T.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(lightRoom,.08).texture;scene.environmentIntensity=.38;pmrem.dispose();for(const p of lightPanels){p.geometry.dispose();p.material.dispose();}

    forestRegion=new T.Scene();stadiumRegion=new T.Scene();scene.add(forestRegion,stadiumRegion);world=createEnvironment(forestRegion);stadium=createStadiumEnvironment(stadiumRegion);snow=createSnowEnvironment(scene);updateTarget=bindTargetPresentation(scene);skillEffects=createSkillEffects(scene);game=new NetworkGame();interfaceUI=bindInterface(game,toast,clearInput);afkSettings=bindAfkSettings(game,toast);bindResponsiveChat();
    $('load-progress').textContent='Загружаем персонажа и обитателей леса…';
    mobAssets=await loadMobAssets();
    $('load-progress').textContent='Подключаем героя к общему миру…';const stressMode=await stressEnabled();if(stressMode){const response=await fetch('/api/stress-session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok)throw new Error('Не удалось открыть изолированную FPS-сессию');const data=await response.json() as {character:{id:string}};await game.connect({heroId:data.character.id});}else await interfaceUI.join();
    warrior=await loadWarrior(game.player.classId);scene.add(warrior.root);
    worldInteractions=await createWorldInteractions(scene,game,chooseInteraction,[...stadium.portals,...snow.passages],world.campHouse);
    for(const mob of game.mobs)ensureMobModel(mob);
    const ring=mesh(marker,new T.RingGeometry(.43,.451,40),new T.MeshBasicMaterial({color:'#dac593',transparent:true,opacity:.62,side:T.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.castShadow=false;ring.receiveShadow=false;scene.add(marker);
    $('load-progress').textContent='Загружаем материалы леса…';await world.ready;ready=true;if(stressMode){const link=document.createElement('link');link.rel='stylesheet';link.href='/game/benchmark.css';document.head.append(link);benchmark=new Benchmark({renderer,scene,camera,game,modelsReady:()=>remoteModels.size===game.players.length-1&&loadingPlayers.size===0,setVariant:variant=>{renderer.shadowMap.enabled=variant!=='no-shadows';fitCamera();world.setTreesVisible?.(variant!=='no-trees');}});}
    cameraTarget.set(game.player.x,.3,game.player.z);render(1/60);$('load-progress').textContent='Готовим свет и тени…';await renderer.compileAsync(scene,camera);$('loading').hidden=true;canvas.focus({preventScroll:true});updateUI();renderer.setAnimationLoop(loop);
  }catch(error){console.error(error);ready=false;$('loading').hidden=false;$('loading').querySelector('h2')!.textContent='Локацию не удалось открыть';$('load-progress').textContent=errorMessage(error);$('retry').hidden=false;}
}
canvas.addEventListener('pointermove',event=>{
  if(mouse.pointerId!==null&&event.pointerId!==mouse.pointerId)return;
  mouse.x=event.clientX;mouse.y=event.clientY;mouse.active=true;
  if(mouse.held||mouse.attacking){
    // Capture guarantees release outside the canvas, but UI is never a steering surface.
    if(!(event.buttons&(mouse.attacking?2:1))||document.elementFromPoint(event.clientX,event.clientY)!==canvas){releaseMovement();mouse.active=false;mouse.point=null;return;}
    if(mouse.held)mouse.pickPending=true;
  }
});
canvas.addEventListener('pointerleave',()=>{releaseMovement();mouse.active=false;mouse.point=null;});
canvas.addEventListener('pointerdown',event=>{
  if(!ready||!game.connected||game.player.dead||event.isPrimary===false)return;
  if(event.button!==0&&event.button!==2)return;
  event.preventDefault();cancelAfk();canvas.focus({preventScroll:true});mouse.x=event.clientX;mouse.y=event.clientY;mouse.active=true;mouse.point=pickGround();
  if(event.button===2){mouse.held=false;mouse.attacking=true;mouse.pointerId=event.pointerId;canvas.setPointerCapture(event.pointerId);game.stopInput();attackAt();return;}
  const interaction=worldInteractions?.pick(raycaster);if(interaction){chooseInteraction(interaction.kind,interaction.id);return;}
  let pickedPlayer:string|null=null,nearest=Infinity;
  for(const [id,model] of remoteModels){if(!model.root.visible)continue;const hit=raycaster.intersectObject(model.root,true)[0];if(hit&&hit.distance<nearest){nearest=hit.distance;pickedPlayer=id;}}
  if(pickedPlayer){selected=null;selectedEntity={kind:'player',id:pickedPlayer};releaseMovement();updateUI();return;}
  if(game.player.interactionTarget)game.send({type:'cancelInteraction'});
  mouse.held=true;mouse.attacking=false;mouse.pointerId=event.pointerId;canvas.setPointerCapture(event.pointerId);
  selected=mouse.point?pickMob():null;selectedEntity=null;mouse.pickPending=false;
});
addEventListener('pointerup',event=>{if(event.pointerId===mouse.pointerId&&!(event.buttons&(mouse.attacking?2:1)))releaseMovement();});
addEventListener('pointercancel',event=>{if(event.pointerId===mouse.pointerId)clearInput();});
canvas.addEventListener('lostpointercapture',event=>{if(event.pointerId===mouse.pointerId)clearInput();});
// Inventory, HUD and overlays belong to the game as much as the canvas.
document.addEventListener('contextmenu',event=>event.preventDefault(),{capture:true});
canvas.addEventListener('wheel',event=>{
  if(!ready||event.ctrlKey||event.metaKey)return;
  event.preventDefault();
  const unit=event.deltaMode===1?16:event.deltaMode===2?height:1;
  const delta=T.MathUtils.clamp(event.deltaY*unit,-160,160);
  targetZoom=T.MathUtils.clamp(targetZoom*Math.exp(-delta*ZOOM.sensitivity),ZOOM.min,ZOOM.max);
},{passive:false});
addEventListener('keydown',event=>{
  if(event.defaultPrevented||!ready||event.metaKey||event.ctrlKey||event.altKey||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName||''))return;
  if(document.activeElement?.tagName==='BUTTON'&&['Space','Enter'].includes(event.code))return;
  if(['Space','Digit1','Digit2','Digit3','Digit4'].includes(event.code)){event.preventDefault();keys.add(event.code);}if(event.repeat)return;
  if(['ShiftLeft','ShiftRight'].includes(event.code)&&(document.activeElement===canvas||document.activeElement===document.body))toggleRun();
  if(event.code==='Space')attackAt();
  const skillIndex=['Digit1','Digit2','Digit3','Digit4'].indexOf(event.code);if(skillIndex>=0)castSkill(skillIndex);
  if(event.code==='KeyQ'){event.preventDefault();drink('q');}if(event.code==='KeyW'){event.preventDefault();drink('w');}
  if(event.code==='KeyF')toggleAfk();if(event.code==='Escape'&&!interfaceUI?.isPanelOpen()){cancelAfk();clearInput();}
});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',clearInput);document.addEventListener('visibilitychange',()=>{paused=document.hidden;if(paused)clearInput();last=0;accumulator=0;});addEventListener('resize',fitCamera);
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();ready=false;clearInput();$('loading').hidden=false;$('loading').querySelector('h2')!.textContent='3D-изображение приостановлено';$('load-progress').textContent='Нажмите «Повторить», чтобы открыть локацию снова.';$('retry').hidden=false;});
for(const b of document.querySelectorAll<HTMLButtonElement>('[data-weapon]'))b.addEventListener('click',()=>{chooseWeapon(b.dataset.weapon);canvas.focus({preventScroll:true});});
for(const [index,id] of ['special','skill-secondary','skill-tertiary','skill-quaternary'].entries())$(id).addEventListener('click',()=>{castSkill(index);canvas.focus({preventScroll:true});});
$('afk-toggle').addEventListener('click',()=>{toggleAfk();canvas.focus({preventScroll:true});});
$('movement').addEventListener('click',()=>{toggleRun();canvas.focus({preventScroll:true});});
function drink(slot:'q'|'w'){if(!$(slot==='q'?'potion':'mana-potion').classList.contains('quick-unavailable'))game.useConsumable(slot);}
$('attack').addEventListener('click',()=>{attackAt();canvas.focus({preventScroll:true});});$('potion').addEventListener('click',()=>{drink('q');canvas.focus({preventScroll:true});});$('mana-potion').addEventListener('click',()=>{drink('w');canvas.focus({preventScroll:true});});$('reset').addEventListener('click',()=>{returnToCamp();canvas.focus({preventScroll:true});});$('retry').addEventListener('click',()=>location.reload());
start();
