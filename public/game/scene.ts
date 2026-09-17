import {createLateWorldEnvironment} from './late-world-environment.js';
import {lateRegionAt} from './late-world.js';
import {createDungeonEnvironment} from './dungeon-environment.js';
import {dungeonAt} from './dungeons.js';
import {createBossEffects} from './boss-effects.js';
import {bindAfkSettings} from './afk-settings-ui.js';
import {bindSkillbook} from './skillbook-ui.js';
import {bindTargetPresentation} from './target-presentation.js';
import {SHOP} from './shop.js';
import * as T from './vendor/three.module.js';
import {mesh} from './models.js';
import {loadWarrior} from './character.js';
import {createMob,loadMobAssets,type MobAssets} from './mobs.js';
import {createEnvironment} from './environment.js';
import {consumableStatus,bindConsumableStatus} from './consumable-status.js';
import {actionIcon} from './action-icons.js';
import {consumableArtwork,consumableTier} from './consumable-ui.js';
import {createWorldInteractions} from './world-interactions.js';
import {drawMinimap,MINIMAP_LEGEND} from './minimap.js';
import {WORLD_CLEARINGS,locationAt,sameLocation} from './world-layout.js';
import {SNOW_PASSAGES} from './snow.js';
import {createSnowEnvironment} from './snow-environment.js';
import {createWastelandEnvironment} from './wasteland-environment.js';
import {WASTELAND_PASSAGES} from './wasteland.js';
import {PORTALS,ALL_PORTALS} from './stadium.js';
import {createStadiumEnvironment} from './stadium-environment.js';
import {angleDelta,gaitProfile} from './motion.js';
import {CAMERA,WEAPONS,mobConfig,safe,afkSpotAt} from './location.js';

import {NetworkGame} from './network.js';
import {bindInterface} from './interface.js';
import {bindOnlineRoster} from './online-roster-ui.js';
import {bindPanelLayout} from './panel-layout.js';
import {bindResponsiveChat} from './responsive-chat.js';
import {SKILLS} from './skills.js';
import {effectiveSkill} from './skill-builds.js';
import {createSkillEffects} from './skill-effects.js';
import {createPersistentSkillEffects} from './persistent-skill-effects.js';
import {createSkillProjectile,updateSkillProjectile,disposeSkillProjectile} from './skill-projectiles.js';
import {classFor} from '../rules.js';
import {Benchmark,stressEnabled} from './benchmark.js';
import {bindTravelPanel,createTravelPortals} from './travel-ui.js';
import {MouseWalk} from './mouse-walk.js';
import {element as $,errorMessage} from './ui-types.js';
import type {Point,PublicPlayer,PublicMob,WeaponId} from '../../shared/types.js';
type Warrior=Awaited<ReturnType<typeof loadWarrior>>;
type MobModel=ReturnType<typeof createMob>;
type RemoteWarrior=Warrior & {label:HTMLDivElement};
type VisualHero=Pick<PublicPlayer,'id'|'x'|'z'|'yaw'|'gait'|'runBlend'|'moveBlend'|'dead'|'weapon'|'classId'|'hurt'|'attack'|'appearance'>;
interface FloatingNumber {element:HTMLSpanElement;x:number;z:number;y:number;life:number}
interface Particle {mesh:T.Mesh<T.IcosahedronGeometry,T.MeshBasicMaterial>;v:T.Vector3;life:number}
interface HeldMouse {x:number;y:number;active:boolean;point:T.Vector3|null;attacking:boolean;casting:boolean;pointerId:number|null;}

let benchmark:Benchmark|undefined,skillEffects:ReturnType<typeof createSkillEffects>|undefined,persistentSkillEffects:ReturnType<typeof createPersistentSkillEffects>|undefined,worldInteractions:Awaited<ReturnType<typeof createWorldInteractions>>|undefined;
const canvas=$('scene');
let renderer:T.WebGLRenderer,scene:T.Scene,camera:T.OrthographicCamera,sun:T.DirectionalLight,world:ReturnType<typeof createEnvironment>,warrior:Warrior,game:NetworkGame,ready=false,last=0,time=0,accumulator=0;
let afkSettings:ReturnType<typeof bindAfkSettings>|undefined,skillbook:ReturnType<typeof bindSkillbook>|undefined;
let selectedEntity:{kind:'vendor'|'player';id:string}|null=null,updateTarget:ReturnType<typeof bindTargetPresentation>|undefined;
let width=innerWidth,height=innerHeight,selected:number|null=null,pendingWeapon:WeaponId|null=null;
let noticeTimer:ReturnType<typeof setTimeout>|undefined=undefined,lastSafeToast=0,uiTimer=0,frames:number[]=[],frameCounter=0,paused=false;
let snow:ReturnType<typeof createSnowEnvironment>,wasteland:ReturnType<typeof createWastelandEnvironment>,forestRegion:T.Scene,stadiumRegion:T.Scene;
let lateWorld:ReturnType<typeof createLateWorldEnvironment>,dungeonWorld:ReturnType<typeof createDungeonEnvironment>,bossEffects:ReturnType<typeof createBossEffects>;
let mobAssets:MobAssets,stadium:ReturnType<typeof createStadiumEnvironment>;
let travelPanel:ReturnType<typeof bindTravelPanel>,travelWorld:ReturnType<typeof createTravelPortals>;
let targetZoom=1,interfaceUI:ReturnType<typeof bindInterface>,onlineRoster:ReturnType<typeof bindOnlineRoster>;
const remoteModels=new Map<string,RemoteWarrior>(),loadingPlayers=new Set<string>(),visualHeroes=new Map<string,VisualHero>(),visualMobs=new Map<number,PublicMob>(),shots=new Map<string,T.Group>();
const ZOOM={min:.7,max:1.9,sensitivity:.0015};
const keys=new Set<string>(),models=new Map<number,MobModel>(),particles:Particle[]=[],floats:FloatingNumber[]=[];
let heldHudSkill:number|null=null,channelSlot:number|null=null,lastChannelPulse=0;
const raycaster=new T.Raycaster(),ndc=new T.Vector2(),groundPlane=new T.Plane(new T.Vector3(0,1,0),0),cameraTarget=new T.Vector3(.5,.3,2),skillOrigin=new T.Vector3();
const mouse:HeldMouse={x:0,y:0,active:false,point:null,attacking:false,casting:false,pointerId:null,};
const mouseWalk=new MouseWalk();
// Five metres cover the full animated actor and its shadow beyond the viewport.
// Keep pose bookkeeping current, but sample/draw only groups near the camera.
const actorFrustum=new T.Frustum(),actorProjection=new T.Matrix4(),actorBounds=new T.Sphere(new T.Vector3(),5);
function actorVisible(p:Point){actorBounds.center.set(p.x,1,p.z);return actorFrustum.intersectsSphere(actorBounds);}
function skillOriginFor(playerId:string){
  const actor=playerId===game.id?warrior:remoteModels.get(playerId);
  const hand=actor?.model.getObjectByName('mixamorigRightHand')||actor?.model.getObjectByName('mixamorig:RightHand');
  return hand?.getWorldPosition(skillOrigin)??null;
}
const marker=new T.Group();
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
const mini=$('minimap'),map=mini.getContext('2d')!;
$('map-legend').replaceChildren(...MINIMAP_LEGEND.map(entry=>{const label=document.createElement('span'),icon=document.createElement('b');icon.textContent=entry.symbol;icon.style.color=entry.color;icon.setAttribute('aria-hidden','true');label.append(icon,entry.label);return label;}));
const potionStatusUpdates={q:bindConsumableStatus($('potion')),w:bindConsumableStatus($('mana-potion'))};
let lootLabelsVisible=true;
try{lootLabelsVisible=localStorage.getItem('ashen-loot-labels')!=='hidden';}catch{}
function updateLootLabels(){
  document.body.classList.toggle('loot-labels-hidden',!lootLabelsVisible);
  $('loot-labels-toggle').setAttribute('aria-pressed',String(lootLabelsVisible));
  $('loot-labels-toggle').title=`${lootLabelsVisible?'Скрыть':'Показать'} названия добычи · Z`;
}
function toggleLootLabels(){lootLabelsVisible=!lootLabelsVisible;updateLootLabels();try{localStorage.setItem('ashen-loot-labels',lootLabelsVisible?'visible':'hidden');}catch{}}
updateLootLabels();bindPanelLayout();
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
  // Creature GLBs use fixed bounds that cover every shipped animation. Picking
  // those bounds avoids raycasting every triangle of a SkinnedMesh while an
  // attack key is held, and keeps slender legs/muzzles easy to target.
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
function attackAt(point:Point|null=null,approach=false){
  if(!ready)return;const aim=combatAim(point),mob=game.mobs.find(value=>value.id===aim.targetId);
  const range=game.player.classId==='warrior'?WEAPONS[game.player.weapon].range:game.player.range;
  const targetId=!approach&&mob&&distance(game.player,mob)>range+mobConfig(mob).radius?undefined:aim.targetId;
  game.attack(aim.yaw,false,targetId,approach);
}
function toggleAfk(){if(!ready)return;releaseMovement();game.setAfk(!game.player.afk);}
function cancelAfk(){if(game?.player.afk)game.setAfk(false);}
function slotSkill(slot:number){const id=game.player.skillBuild?.slots[slot];return id&&SKILLS[id]?.classId===game.player.classId?effectiveSkill(game.player,id):undefined;}
function stopChannel(){if(channelSlot!==null){game?.skillStop();channelSlot=null;lastChannelPulse=0;}}
function castSkill(slot:number,held=false){
  if(!ready||!game.connected||game.player.dead)return;const skill=slotSkill(slot);if(!skill)return;
  if(skill.kind==='channel'){
    if(!held&&channelSlot===null)return;
    if((game.player.skillCooldowns?.[skill.id]||0)>0||game.player.mana<skill.manaCost)return;
    const now=performance.now();if(now-lastChannelPulse<120)return;const aim=combatAim();channelSlot=slot;lastChannelPulse=now;game.skill(skill.id,aim.yaw,{targetId:aim.targetId,target:aim.target});return;
  }
  if(channelSlot!==null)stopChannel();
  if(game.player.attack)return;const aim=combatAim();
  if((game.player.skillCooldowns?.[skill.id]||0)<=0&&game.player.mana>=skill.manaCost)game.skill(skill.id,aim.yaw,{targetId:aim.targetId,target:aim.target});
}
function releaseMovement(){
  const id=mouse.pointerId;
  if(mouseWalk.release())game?.stopInput();
  if(mouse.casting&&channelSlot===4)stopChannel();
  mouse.attacking=false;mouse.casting=false;mouse.pointerId=null;
  if(id!==null&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);

}
function clearInput(){keys.clear();heldHudSkill=null;stopChannel();releaseMovement();mouse.active=false;mouse.point=null;game?.stopInput();if(game?.connected)game.send({type:'cancelInteraction'});}
function chooseInteraction(kind:'loot'|'vendor'|'portal'|'chest'|'travel',id:string){
  if(!ready||!game.connected||game.player.dead)return;
  if(kind==='vendor'){selected=null;selectedEntity={kind:'vendor',id};}
  releaseMovement();keys.clear();cancelAfk();game.send(kind==='loot'?{type:'pickup',id}:kind==='travel'?{type:'travelOpen',portalId:id}:kind==='portal'?{type:'portal',portalId:id}:{type:'interact',npcId:id});
}
function returnToCamp(){
  if(!ready)return;
  clearInput();game.returnToCamp();selected=null;
}
function number(event:Point & {amount?:number},kind=''){const element=document.createElement('span');element.className='damage-number '+kind;element.textContent=kind==='miss'?'Промах':(kind==='heal'?'+':kind==='loot'?'+':'')+String(event.amount);$('world-ui').append(element);floats.push({element,x:event.x,z:event.z,y:kind==='hurt'?2.2:1.5,life:.95});}
function resetLocationView(){
  clearInput();selected=null;selectedEntity=null;pendingWeapon=null;visualHeroes.clear();visualMobs.clear();
  cameraTarget.set(game.player.x,.3,game.player.z);updateCamera(0);
  for(const model of shots.values())disposeSkillProjectile(model);shots.clear();skillEffects?.clear();persistentSkillEffects?.clear();
  for(const particle of particles){particle.mesh.removeFromParent();particle.mesh.material.dispose();}particles.length=0;
  for(const floating of floats)floating.element.remove();floats.length=0;
}
function processEvents(){
  let gainedLevel=null;
  for(const event of game.events.splice(0)){
    interfaceUI.onEvent?.(event);afkSettings?.onEvent(event);skillbook?.onEvent(event);travelPanel?.onEvent(event);
    if(event.type==='skillImpact'&&event.phase!=='end')skillEffects?.impact(event);
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
    if(event.type==='safe'&&time-lastSafeToast>1.5){lastSafeToast=time;const region=locationAt(game.player);toast(region==='wasteland'?'Безопасный пост. Дальше начинаются Пепельные пустоши':region==='snow'?'Укрытие у перевала. Дальше начинается снежная охота':region==='stadium'?'Безопасная площадка. Пройдите в один из загонов':'Лагерь безопасен. Выйдите на лесную тропу');}
    if(event.type==='death'){clearInput();pendingWeapon=null;selected=null;}
    if(event.type==='portal'){resetLocationView();const destination=dungeonAt(game.player)??lateRegionAt(game.player);toast(destination?.name??(event.location==='wasteland'?'Пепельные пустоши · восемь спотов для охоты':event.location==='snow'?'Снежный предел · восемь охотничьих спотов':event.location==='stadium'?'Стадиум · 28 загонов, без добычи':'Пепельная опушка'));}
    if(event.type==='camp'){resetLocationView();toast('У костра восстанавливаются здоровье, мана и зелья');}
    if(event.type==='quest')toast('Опушка очищена! Награда: 50 золота');
  }
  // Kill/loot events arrive in the same snapshot: keep level progression visible.
  if(gainedLevel!==null)toast(`Новый уровень: ${gainedLevel} · доступны очки характеристик · C`);
}
function tick(dt:number){
  processEvents();
  if(!game.connected){releaseMovement();processEvents();return;}
  const hero=game.player;
  if(hero.afk){game.update(dt,{x:0,z:0,aim:null});processEvents();return;}
  let input:{x:number;z:number;aim:number|null}={x:0,z:0,aim:null};
  const keyboardSkill=['Digit1','Digit2','Digit3','Digit4'].findIndex(code=>keys.has(code)),heldSkill=keyboardSkill>=0?keyboardSkill:mouse.casting?4:heldHudSkill;
  if(heldSkill!==null&&heldSkill>=0&&!safe(hero)){input.x=input.z=0;castSkill(heldSkill,true);}
  else if(mouse.attacking&&!safe(hero)){input.x=input.z=0;attackAt();}
  else {
    const walk=mouseWalk.sample(hero,mouse.point,performance.now());
    if(walk.takeover)game.send({type:'cancelInteraction'});
    input=walk.input;
  }
  game.update(dt,input);
  if(pendingWeapon&&!hero.attack)chooseWeapon(pendingWeapon);
  processEvents();
}
function drawMap(){
  map.setTransform(2,0,0,2,0,0);
  drawMinimap(map,mini.width/2,mini.height/2,game);
}
function updateUI(){
  const hero=game.player,camp=safe(hero),mob=selectedMob(),region=locationAt(hero),inStadium=region==='stadium',inSnow=region==='snow',inWasteland=region==='wasteland';
  $('location-name').textContent=inWasteland?'Пепельные пустоши':inSnow?'Снежный предел':inStadium?'Стадиум':'Пепельная опушка';
  mini.setAttribute('aria-label',inWasteland?'Пепельные пустоши: западный пост, восемь спотов и пепельный шпиль на востоке.':inSnow?'Снежный предел: перевал на западе, восемь спотов и ледник на востоке.':inStadium?'Стадиум: семь рядов загонов на севере, безопасная площадка и портал на юге.':'Карта Пепельной опушки: лагерь, пять спотов и руины.');
  $('forest-quest').hidden=region!=='forest';$('stadium-guide').hidden=!inStadium;document.getElementById('snow-guide')!.hidden=!inSnow;document.getElementById('wasteland-guide')!.hidden=!inWasteland;
  const expansion=lateRegionAt(hero),dungeon=dungeonAt(hero);
  if(expansion||dungeon){$('location-name').textContent=(expansion??dungeon)!.name;mini.setAttribute('aria-label',`Карта: ${(expansion??dungeon)!.name}`);}
  $('dungeon-progress').hidden=!dungeon;
  if(dungeon){const p=game.dungeon,guards=p?.guardsRemaining??12;
    $('dungeon-objective').textContent=p?.bossDefeated?'Босс повержен':guards>0?`Стражи: ${12-guards} / 12`:dungeon.bossName;
    $('dungeon-hint').textContent=p?.bossDefeated?`Новый поход через ${Math.ceil(p.resetIn)} с. Оставшиеся герои вернутся ко входу.`:guards>0?'Победите всех стражей, чтобы снять печать с босса.':'Печать снята. Уклоняйтесь от отмеченных атак.';
  }
  const spot=afkSpotAt(hero);
  const clearing=WORLD_CLEARINGS.find(field=>Math.hypot(hero.x-field.x,hero.z-field.z)<field.radius);
  $('zone-state').textContent=camp?(inWasteland?'Безопасный пост':inSnow?'Укрытие у перевала':inStadium?'Безопасная площадка':'Безопасный лагерь'):spot?spot.name:inWasteland?'Пепельные пустоши · опасная зона':inSnow?'Снежный предел · опасная зона':inStadium?'Стадиум · входы в загоны':Math.hypot(hero.x-25,hero.z+1.2)<6?'Старые руины · вожак':clearing?`${clearing.id==='camp'?'Окраина лагеря':clearing.name} · опасная зона`:'Пепельная опушка · опасная зона';
  if(expansion||dungeon)$('zone-state').textContent=camp?'Безопасное укрытие':spot?.name??`${(expansion??dungeon)!.name} · опасная зона`;
  const afk=$('afk-toggle');afk.disabled=!game.connected||!!hero.dead;afk.setAttribute('aria-pressed',String(!!hero.afk));afk.title=hero.afk?`Остановить автоохоту · F. Радиус атак: ${(hero.afkRadius??0).toFixed(1)} м.`:'Включить автоохоту здесь · F. Герой остаётся на месте; в безопасной зоне ждёт.';
  $('afk-status').textContent=hero.afk?(camp?'Автоохота · ожидание':'Автоохота включена'):'Автоохота';$('zone-state').classList.toggle('safe',camp);
  const rate=$('afk-xp-rate'),xpMinute=hero.afk?hero.afkXpMinute??0:0;
  rate.hidden=!hero.afk;rate.textContent=`${xpMinute.toLocaleString('ru-RU')} XP/мин`;
  rate.title='Опыт, полученный за последнюю минуту автоохоты';
  $('hp-text').textContent=`${Math.ceil(hero.hp)} / ${Math.ceil(hero.maxHp)}`;$('hp-fill').style.height=`${Math.max(0,Math.min(1,hero.hp/hero.maxHp||0))*100}%`;
  $('hp-orb').setAttribute('aria-valuemax',String(hero.maxHp));$('hp-orb').setAttribute('aria-valuenow',String(Math.ceil(hero.hp)));
  for(const [slot,id,countId] of [['q','potion','potions'],['w','mana-potion','mana-potions']] as const){
    const button=$(id) as HTMLButtonElement,status=consumableStatus(hero,slot,game.connected),{definition,count}=status;
    potionStatusUpdates[slot](status);
    $(countId).textContent=String(count);button.classList.toggle('quick-empty',!definition);
    const art=button.querySelector<HTMLElement>('.potion-icon')!,tier=definition?consumableTier(definition.id):undefined,iconKey=definition?definition.id:'empty';
    if(art.dataset.icon!==iconKey){art.innerHTML=definition?consumableArtwork(definition):'<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M25 8h14v13c0 5 13 14 13 24 0 18-40 18-40 0 0-10 13-19 13-24Z" fill="none" stroke="#a8afa5" stroke-width="3" stroke-dasharray="4 3"/><path d="M23 6h18v9H23Z" fill="none" stroke="#a8afa5" stroke-width="3"/></svg>';art.dataset.icon=iconKey;}
    button.dataset.consumableTier=tier?.label||'';
    button.querySelector('.action-name')!.textContent=definition?definition.kind==='hp'?'HP':'MP':'Пусто';
    button.querySelector('small')!.textContent=status.label;
    button.title=definition?`${definition.name} · ${count} шт. · восстановить ${definition.restore} ${definition.kind==='hp'?'HP':'MP'} · ${slot.toUpperCase()} · перетащите другое зелье для замены`:`${slot.toUpperCase()}: пустой слот · перетащите зелье из рюкзака`;
    button.title+=` · ${status.label}`;button.setAttribute('aria-label',button.title);
  }
  $('movement-label').textContent=hero.running?'Бег':'Ходьба';$('movement').setAttribute('aria-pressed',String(hero.running));$('movement').disabled=!!hero.dead;
  $('movement').title=hero.running?'Перейти на ходьбу · R':'Перейти на бег · R';
  $('attack').disabled=!!hero.dead;
  const returning=(hero.campReturnRemaining??0)>0,inCombat=!!hero.attack||hero.combatUntil>game.serverTime;
  $('reset').disabled=!game.connected||!!hero.dead||(!returning&&inCombat);
  $('reset').classList.toggle('returning',returning);
  $('reset').style.setProperty('--return-progress',`${Math.max(0,1-(hero.campReturnRemaining??0)/5)*100}%`);
  $('camp-return-label').textContent=returning?`Возврат ${Math.ceil(hero.campReturnRemaining!)} с · отмена`:'В город · 5 с';
  $('reset').title=returning?'Нажмите для отмены. Движение или бой прерывают возврат.':inCombat?'Возврат доступен только вне боя':'Вернуться в город к стартовому костру за 5 секунд. Движение или бой прерывают возврат.';
  $('death-screen').hidden=!hero.dead;$('hurt-vignette').style.opacity=String(hero.hurt*.9);
  $('kills-goal').innerHTML=`Победите существ: <b>${Math.min(5,hero.questKills)} / 5</b>`;$('kills-goal').classList.toggle('done',hero.questKills>=5);$('boss-goal').classList.toggle('done',hero.boss);$('camp-goal').classList.toggle('done',hero.questClaimed);
  $('quest-hint').textContent=hero.questClaimed?'Задание выполнено. Можно продолжить охоту.':hero.questKills>=5&&hero.boss?'Возвращайтесь в безопасный лагерь.':hero.questKills>=5?'Вожак ждёт у руин, дальше по тропе.':'Идите по тропе направо, за указатель.';
  if(selectedEntity?.kind==='vendor'){
    if(sameLocation(SHOP,hero)&&distance(SHOP,hero)<23)updateTarget?.({kind:'vendor',id:SHOP.id,name:SHOP.name,subtitle:'Снаряжение и припасы',x:SHOP.x,z:SHOP.z});else{selectedEntity=null;updateTarget?.(null);}
  }else if(selectedEntity?.kind==='player'){
    const other=game.players.find(p=>p.id===selectedEntity?.id);if(other&&other.connected&&sameLocation(other,hero)&&distance(other,hero)<23)updateTarget?.({kind:'player',...other});else{selectedEntity=null;updateTarget?.(null);}
  }else updateTarget?.(mob&&mob.state!=='dead'&&distance(mob,hero)<23?{kind:'mob',type:mob.type,eliteId:mob.eliteId,...{bossId:mob.bossId,dungeonId:mob.dungeonId},name:mobConfig(mob).name,x:mob.x,z:mob.z,hp:mob.hp,maxHp:mobConfig(mob).hp}:null);
  for(const button of document.querySelectorAll<HTMLButtonElement>('[data-weapon]')){const active=button.dataset.weapon===hero.weapon;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));button.disabled=!!hero.dead||!!hero.items.find(item=>item.id===hero.equipment.weapon&&item.definitionId);}
  $('cooldown').style.transform=`scaleX(${hero.attack?1-hero.attack.age/hero.attack.duration:0})`;
  interfaceUI.update();onlineRoster?.update();afkSettings?.update();skillbook?.update();travelPanel?.update();drawMap();
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
    model=createMob(mob.type,mobAssets,mob.eliteId,mob.dungeonId,mob.bossId);
    models.set(mob.id,model);scene.add(model.root);
  }
  return model;
}
function render(dt:number){
  if(!sameLocation(cameraTarget,game.player))resetLocationView();
  const hero=visualActor(game.player,dt);time+=dt;updateCamera(dt);mouse.point=pickGround();
  if(benchmark?.variant==='picking'){mouse.active=true;mouse.x=width*.5+Math.sin(time*2)*width*.18;mouse.y=height*.5;mouse.point=pickGround();pickMob();}
  warrior.root.position.set(hero.x,0,hero.z);warrior.root.rotation.set(0,hero.yaw,0);
  benchmark?.mark('camera-picking');
  warrior.animate(dt,hero,!benchmark?.freezeAnimations);
  marker.position.set(hero.x,.03,hero.z);marker.rotation.y=hero.yaw;marker.visible=!hero.dead;
  const region=locationAt(hero);document.body.classList.toggle('snow-region',region==='snow');document.body.classList.toggle('wasteland-region',region==='wasteland');forestRegion.visible=region==='forest';stadiumRegion.visible=region==='stadium';
  world.marker.visible=false;if(forestRegion.visible)world.animate(time);if(stadiumRegion.visible)stadium.animate(time);snow.animate(time,hero,region==='snow');wasteland.animate(time,hero,region==='wasteland');lateWorld.updateRegion(region);lateWorld.update(dt);dungeonWorld.update(region,time,game.dungeon?.guardsRemaining??0);bossEffects.sync(game.mobs);travelWorld?.update(region,time);
  const sky=dungeonAt(hero)?'#1e252b':lateRegionAt(hero)?'#455052':region==='snow'?'#859eac':region==='wasteland'?'#9a775e':'#485b58';(scene.background as T.Color).set(sky);if(scene.fog instanceof T.FogExp2){scene.fog.color.set(sky);scene.fog.density=region==='snow'?.009:region==='wasteland'?.012:.014;}sun.intensity=dungeonAt(hero)?1.0:2.8;sun.color.set(region==='snow'?'#e2f0ff':region==='wasteland'?'#ffe0b0':'#ffe4bc');
  world.campHouse.update(game.player);renderPlayers(dt);renderShots();skillEffects?.update(dt);skillEffects?.slowMobs(game.mobs);persistentSkillEffects?.sync(game.players,game.mobs,game.skillZones,time);
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

    forestRegion=new T.Scene();stadiumRegion=new T.Scene();scene.add(forestRegion,stadiumRegion);world=createEnvironment(forestRegion);stadium=createStadiumEnvironment(stadiumRegion);snow=createSnowEnvironment(scene);wasteland=createWastelandEnvironment(scene);lateWorld=createLateWorldEnvironment(scene);dungeonWorld=createDungeonEnvironment(scene);bossEffects=createBossEffects(scene);updateTarget=bindTargetPresentation(scene);skillEffects=createSkillEffects(scene);persistentSkillEffects=createPersistentSkillEffects(scene,skillOriginFor);game=new NetworkGame();interfaceUI=bindInterface(game,toast,clearInput);onlineRoster=bindOnlineRoster(game);afkSettings=bindAfkSettings(game,toast);skillbook=bindSkillbook(game,toast);bindResponsiveChat();travelPanel=bindTravelPanel(game);travelWorld=createTravelPortals(scene);
    $('load-progress').textContent='Загружаем персонажа и обитателей леса…';
    mobAssets=await loadMobAssets();
    $('load-progress').textContent='Подключаем героя к общему миру…';const stressMode=await stressEnabled();if(stressMode){const response=await fetch('/api/stress-session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok)throw new Error('Не удалось открыть изолированную FPS-сессию');const data=await response.json() as {character:{id:string}};await game.connect({heroId:data.character.id});}else await interfaceUI.join();
    warrior=await loadWarrior(game.player.classId);scene.add(warrior.root);
    worldInteractions=await createWorldInteractions(scene,game,chooseInteraction,[...stadium.portals,...snow.passages,...wasteland.passages,...dungeonWorld.portals,...travelWorld.portals],world.campHouse);
    for(const mob of game.mobs)ensureMobModel(mob);
    const ring=mesh(marker,new T.RingGeometry(.43,.451,40),new T.MeshBasicMaterial({color:'#dac593',transparent:true,opacity:.62,side:T.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.castShadow=false;ring.receiveShadow=false;scene.add(marker);
    $('load-progress').textContent='Загружаем материалы леса…';await world.ready;ready=true;if(stressMode){const link=document.createElement('link');link.rel='stylesheet';link.href='/game/benchmark.css';document.head.append(link);benchmark=new Benchmark({renderer,scene,camera,game,modelsReady:()=>remoteModels.size===game.players.length-1&&loadingPlayers.size===0,setVariant:variant=>{renderer.shadowMap.enabled=variant!=='no-shadows';fitCamera();world.setTreesVisible?.(variant!=='no-trees');}});}
    cameraTarget.set(game.player.x,.3,game.player.z);render(1/60);$('load-progress').textContent='Готовим свет и тени…';await renderer.compileAsync(scene,camera);$('loading').hidden=true;canvas.focus({preventScroll:true});updateUI();renderer.setAnimationLoop(loop);
  }catch(error){console.error(error);ready=false;$('loading').hidden=false;$('loading').querySelector('h2')!.textContent='Локацию не удалось открыть';$('load-progress').textContent=errorMessage(error);$('retry').hidden=false;}
}
canvas.addEventListener('pointermove',event=>{
  if(mouse.pointerId!==null&&event.pointerId!==mouse.pointerId)return;
  mouse.x=event.clientX;mouse.y=event.clientY;mouse.active=true;
  if((mouseWalk.pressed||mouse.attacking||mouse.casting)&&(!(event.buttons&(mouse.casting?2:1))||document.elementFromPoint(event.clientX,event.clientY)!==canvas))releaseMovement();
});
canvas.addEventListener('pointerleave',()=>{releaseMovement();mouse.active=false;mouse.point=null;});
canvas.addEventListener('pointerdown',event=>{
  if(!ready||!game.connected||game.player.dead||event.isPrimary===false||![0,2].includes(event.button))return;
  event.preventDefault();releaseMovement();cancelAfk();canvas.focus({preventScroll:true});mouse.x=event.clientX;mouse.y=event.clientY;mouse.active=true;mouse.point=pickGround();
  game.send({type:'cancelInteraction'});
  if(event.button===2){if(!slotSkill(4)){toast('Назначьте навык на ПКМ в книге навыков · K');return;}mouse.casting=true;mouse.pointerId=event.pointerId;canvas.setPointerCapture(event.pointerId);castSkill(4,true);return;}
  if(event.shiftKey){mouse.attacking=true;mouse.pointerId=event.pointerId;canvas.setPointerCapture(event.pointerId);attackAt();return;}
  const interaction=worldInteractions?.pick(raycaster);if(interaction){chooseInteraction(interaction.kind,interaction.id);return;}
  const picked=pickMob();if(picked!==null){selected=picked;selectedEntity=null;attackAt(null,true);return;}
  let pickedPlayer:string|null=null,nearest=Infinity;
  for(const [id,model] of remoteModels){if(!model.root.visible)continue;const hit=raycaster.intersectObject(model.root,true)[0];if(hit&&hit.distance<nearest){nearest=hit.distance;pickedPlayer=id;}}
  if(pickedPlayer){selected=null;selectedEntity={kind:'player',id:pickedPlayer};updateUI();return;}
  selected=null;selectedEntity=null;
  if(mouse.point){
    mouseWalk.press(performance.now());mouse.pointerId=event.pointerId;canvas.setPointerCapture(event.pointerId);
    game.send({type:'moveTo',target:{x:mouse.point.x,z:mouse.point.z}});
  }
});
addEventListener('pointerup',event=>{if(event.pointerId===mouse.pointerId)releaseMovement();});
addEventListener('pointercancel',event=>{if(event.pointerId===mouse.pointerId)clearInput();});
canvas.addEventListener('lostpointercapture',event=>{if(event.pointerId===mouse.pointerId)releaseMovement();});
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
  if(event.code==='KeyR')toggleRun();
  if(event.code==='Space'){releaseMovement();cancelAfk();game.send({type:'pickupNearest'});}
  const skillIndex=['Digit1','Digit2','Digit3','Digit4'].indexOf(event.code);if(skillIndex>=0)castSkill(skillIndex,true);
  if(event.code==='KeyQ'){event.preventDefault();drink('q');}if(event.code==='KeyW'){event.preventDefault();drink('w');}
  if(event.code==='KeyZ'){event.preventDefault();toggleLootLabels();}
  if(event.code==='KeyF')toggleAfk();if(event.code==='Escape'&&!interfaceUI?.isPanelOpen()){cancelAfk();clearInput();}
});
addEventListener('keyup',event=>{keys.delete(event.code);const slot=['Digit1','Digit2','Digit3','Digit4'].indexOf(event.code);if(slot>=0&&channelSlot===slot)stopChannel();});addEventListener('blur',clearInput);document.addEventListener('visibilitychange',()=>{paused=document.hidden;if(paused)clearInput();last=0;accumulator=0;});addEventListener('resize',fitCamera);
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();ready=false;clearInput();$('loading').hidden=false;$('loading').querySelector('h2')!.textContent='3D-изображение приостановлено';$('load-progress').textContent='Нажмите «Повторить», чтобы открыть локацию снова.';$('retry').hidden=false;});
for(const b of document.querySelectorAll<HTMLButtonElement>('[data-weapon]'))b.addEventListener('click',()=>{chooseWeapon(b.dataset.weapon);canvas.focus({preventScroll:true});});
for(const [index,id] of ['special','skill-secondary','skill-tertiary','skill-quaternary','skill-mouse'].entries()){
  const button=$(id);button.addEventListener('click',()=>{if(slotSkill(index)?.kind!=='channel')castSkill(index);canvas.focus({preventScroll:true});});
  button.addEventListener('pointerdown',event=>{if(slotSkill(index)?.kind!=='channel'||event.button!==0)return;event.preventDefault();heldHudSkill=index;castSkill(index,true);button.setPointerCapture(event.pointerId);});
  const release=(event:PointerEvent)=>{if(heldHudSkill!==index)return;heldHudSkill=null;if(channelSlot===index)stopChannel();if(button.hasPointerCapture(event.pointerId))button.releasePointerCapture(event.pointerId);canvas.focus({preventScroll:true});};button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',()=>{if(heldHudSkill===index){heldHudSkill=null;if(channelSlot===index)stopChannel();}});
}
$('afk-toggle').addEventListener('click',()=>{toggleAfk();canvas.focus({preventScroll:true});});
$('loot-labels-toggle').addEventListener('click',()=>{toggleLootLabels();canvas.focus({preventScroll:true});});
$('movement').addEventListener('click',()=>{toggleRun();canvas.focus({preventScroll:true});});
function drink(slot:'q'|'w'){if(!$(slot==='q'?'potion':'mana-potion').classList.contains('quick-unavailable'))game.useConsumable(slot);}
$('attack').addEventListener('click',()=>{attackAt();canvas.focus({preventScroll:true});});$('potion').addEventListener('click',()=>{drink('q');canvas.focus({preventScroll:true});});$('mana-potion').addEventListener('click',()=>{drink('w');canvas.focus({preventScroll:true});});$('reset').addEventListener('click',()=>{returnToCamp();canvas.focus({preventScroll:true});});$('retry').addEventListener('click',()=>location.reload());
start();
