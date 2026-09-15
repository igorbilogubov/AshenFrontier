import * as T from './vendor/three.module.js';
import {mesh} from './models.js';
import {loadWarrior} from './character.js';
import {createMob,loadMobAssets} from './mobs.js';
import {createEnvironment} from './environment.js';
import {angleDelta,gaitProfile} from './motion.js';
import {CAMERA,BOUNDS,CAMP,WEAPONS,MOB_TYPES,safe} from './location.js';

import {NetworkGame} from './network.js';
import {bindInterface} from './interface.js';
import {classFor} from '../rules.js';
import {heldMouseInput} from './mouse-input.js';
import {element as $,errorMessage} from './ui-types.js';
import type {Point,PublicPlayer,PublicMob,WeaponId} from '../../shared/types.js';
type Warrior=Awaited<ReturnType<typeof loadWarrior>>;
type MobModel=ReturnType<typeof createMob> & {pickMeshes:T.Mesh[]};
type RemoteWarrior=Warrior & {label:HTMLDivElement};
type VisualHero=Pick<PublicPlayer,'id'|'x'|'z'|'yaw'|'gait'|'runBlend'|'moveBlend'|'dead'|'weapon'|'classId'|'hurt'|'attack'>;
interface FloatingNumber {element:HTMLSpanElement;x:number;z:number;y:number;life:number}
interface Particle {mesh:T.Mesh<T.IcosahedronGeometry,T.MeshBasicMaterial>;v:T.Vector3;life:number}
interface HeldMouse {x:number;y:number;active:boolean;point:T.Vector3|null;held:boolean;pointerId:number|null;pickPending:boolean}

const canvas=$('scene');
let renderer:T.WebGLRenderer,scene:T.Scene,camera:T.OrthographicCamera,sun:T.DirectionalLight,world:ReturnType<typeof createEnvironment>,warrior:Warrior,game:NetworkGame,ready=false,last=0,time=0,accumulator=0;
let width=innerWidth,height=innerHeight,selected:number|null=null,autoTarget:number|null=null,pendingWeapon:WeaponId|null=null;
let noticeTimer:ReturnType<typeof setTimeout>|undefined=undefined,lastSafeToast=0,uiTimer=0,frames:number[]=[],frameCounter=0,paused=false;
let targetZoom=1,interfaceUI:ReturnType<typeof bindInterface>;
const remoteModels=new Map<string,RemoteWarrior>(),loadingPlayers=new Set<string>(),visualHeroes=new Map<string,VisualHero>(),visualMobs=new Map<number,PublicMob>(),shots=new Map<string,T.Mesh<T.BufferGeometry,T.MeshBasicMaterial>>();
const ZOOM={min:.7,max:1.9,sensitivity:.0015};
const keys=new Set<string>(),models=new Map<number,MobModel>(),drops=new Map<number,T.Group>(),particles:Particle[]=[],floats:FloatingNumber[]=[];
const raycaster=new T.Raycaster(),ndc=new T.Vector2(),groundPlane=new T.Plane(new T.Vector3(0,1,0),0),cameraTarget=new T.Vector3(.5,.3,2);
const mouse:HeldMouse={x:0,y:0,active:false,point:null,held:false,pointerId:null,pickPending:false};
const marker=new T.Group();
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
const mini=$('minimap'),map=mini.getContext('2d')!;
const lootGeometry=new T.IcosahedronGeometry(.11,0),lootMaterial=new T.MeshStandardMaterial({color:'#e5b258',emissive:'#8a5a1e',emissiveIntensity:.3,metalness:.65,roughness:.35});

function toast(message:string){$('notice').textContent=message;$('notice').classList.add('visible');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').classList.remove('visible'),2400);}
function fitCamera(){
  width=innerWidth;height=innerHeight;if(!renderer)return;
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.25));renderer.setSize(width,height,false);
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
  camera.lookAt(cameraTarget);camera.updateMatrixWorld();
  sun.position.set(hero.x-8,15,hero.z+7);sun.target.position.set(hero.x,0,hero.z);
}
function pickGround(){
  if(!mouse.active)return null;ndc.set(mouse.x/width*2-1,1-mouse.y/height*2);raycaster.setFromCamera(ndc,camera);
  return raycaster.ray.intersectPlane(groundPlane,new T.Vector3());
}
function pickMob(){
  const objects:T.Mesh[]=[];for(const mob of game.mobs){if(mob.state==='dead'||mob.state==='return')continue;objects.push(...models.get(mob.id)!.pickMeshes);}
  const direct:unknown=raycaster.intersectObjects(objects,false)[0]?.object.userData.mob;if(typeof direct==='number')return direct;
  // Slimmer legs and a tapered muzzle should not demand pixel-perfect clicks.
  const box=new T.Box3(),point=new T.Vector3();let nearest=Infinity,id:number|null=null;
  for(const mob of game.mobs){
    if(mob.state==='dead'||mob.state==='return')continue;
    box.setFromObject(models.get(mob.id)!.pickRoot).expandByScalar(.12);
    if(raycaster.ray.intersectBox(box,point)){const d=point.distanceToSquared(raycaster.ray.origin);if(d<nearest){nearest=d;id=mob.id;}}
  }
  return id;
}
function selectedMob(){return selected===null?null:game.mobs[selected];}
function toggleRun(){
  if(!ready||game.player.dead)return;
  game.toggleRun(); // The movement button updates when the server confirms the mode.
}
function chooseWeapon(id:unknown){
  if(!ready||(id!=='sword'&&id!=='axe')||game.player.dead)return;autoTarget=null;pendingWeapon=null;
  if(id===game.player.weapon)return;if(game.player.attack){pendingWeapon=id;return;}
  game.weapon(id);toast(WEAPONS[id].name);updateUI();
}
function attackAt(point:Point|null=null){
  if(!ready)return;const hero=game.player,p=point||mouse.point;
  game.attack(p?Math.atan2(p.x-hero.x,p.z-hero.z):hero.yaw);
}
function releaseMovement(){
  const id=mouse.pointerId,wasHeld=mouse.held;
  mouse.held=false;mouse.pointerId=null;mouse.pickPending=false;autoTarget=null;
  if(id!==null&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
  if(wasHeld)game?.stopInput();
}
function clearInput(){keys.clear();releaseMovement();mouse.active=false;mouse.point=null;game?.stopInput();}
function returnToCamp(){
  if(!ready)return;
  if(!safe(game.player)&&game.mobs.some(m=>['chase','windup','recover'].includes(m.state)&&distance(m,game.player)<8)){toast('Сначала оторвитесь от врагов');return;}
  clearInput();game.returnToCamp();selected=null;
}
function number(event:Point & {amount?:number},kind=''){const element=document.createElement('span');element.className='damage-number '+kind;element.textContent=kind==='miss'?'Промах':(kind==='heal'?'+':kind==='loot'?'+':'')+String(event.amount);$('world-ui').append(element);floats.push({element,x:event.x,z:event.z,y:kind==='hurt'?2.2:1.5,life:.95});}
function processEvents(){
  let gainedLevel=null;
  for(const event of game.events.splice(0)){
    interfaceUI.onEvent?.(event);
    if(event.type==='notice')toast(event.text);
    if(event.type==='item')toast(`Получено: ${event.name}${event.pending?' · ожидает в рюкзаке':''}`);
    if(event.type==='level')gainedLevel=event.level;
    if(event.type==='miss')number(event,'miss');
    if(event.type==='hit'){
      number(event);for(let i=0;i<6;i++){const p=mesh(scene,lootGeometry,new T.MeshBasicMaterial({color:i%2?'#edc387':'#e6a17e'}),event.x,.7,event.z);p.castShadow=false;particles.push({mesh:p,v:new T.Vector3((Math.random()-.5)*3,1+Math.random()*2,(Math.random()-.5)*3),life:.25+Math.random()*.18});}
    }
    if(event.type==='hurt')number(event,'hurt');
    if(event.type==='heal')number(event,'heal');
    if(event.type==='loot'){number(event,'loot');const model=drops.get(event.id);if(model){model.removeFromParent();drops.delete(event.id);}}
    if(event.type==='kill'){toast(`${event.name} повержен · +${event.xp} опыта`);if(autoTarget===event.id)autoTarget=null;}
    if(event.type==='safe'&&time-lastSafeToast>1.5){lastSafeToast=time;toast('Лагерь безопасен. Выйдите на лесную тропу');}
    if(event.type==='death'){clearInput();pendingWeapon=null;selected=null;}
    if(event.type==='camp'){clearInput();selected=null;toast('У костра восстанавливаются здоровье, мана и зелья');}
    if(event.type==='quest')toast('Опушка очищена! Награда: 50 золота');
  }
  // Kill/loot events arrive in the same snapshot: keep level progression visible.
  if(gainedLevel!==null)toast(`Новый уровень: ${gainedLevel} · доступны очки характеристик · C`);
}
function tick(dt:number){
  if(!game.connected){processEvents();return;}
  if(interfaceUI?.isPanelOpen?.()){game.update(dt,{x:0,z:0,aim:null});processEvents();return;}
  const hero=game.player;
  let mob:PublicMob|null=autoTarget===null?null:game.mobs[autoTarget];
  if(mob&&(mob.state==='dead'||mob.state==='return')){autoTarget=null;mob=null;}
  const input=heldMouseInput(hero,mouse.point,{held:mouse.held,target:mob,reach:hero.classId==='warrior'?1.45:classFor(hero.classId).range-.5,inCamp:safe(hero)});
  if(input.attack&&typeof input.aim==='number'&&Math.abs(angleDelta(hero.yaw,input.aim))<.22)attackAt(mob);
  if(keys.has('Space')&&!safe(hero)){input.x=input.z=0;attackAt();}
  game.update(dt,input);
  if(pendingWeapon&&!hero.attack)chooseWeapon(pendingWeapon);
  processEvents();
}
function mapPosition(p:Point){return {x:10+(p.x-BOUNDS.minX)/(BOUNDS.maxX-BOUNDS.minX)*(mini.width-20),y:8+(p.z-BOUNDS.minZ)/(BOUNDS.maxZ-BOUNDS.minZ)*(mini.height-16)};}
function drawMap(){
  map.clearRect(0,0,mini.width,mini.height);map.fillStyle='#1c3027';map.fillRect(0,0,mini.width,mini.height);
  const camp=mapPosition(CAMP);map.fillStyle='#304b37';map.beginPath();map.ellipse(camp.x,camp.y,27,21,0,0,Math.PI*2);map.fill();
  map.strokeStyle='#948368';map.lineWidth=3;map.beginPath();for(let x=-1;x<27;x+=.3){const p=mapPosition({x,z:1+Math.sin(x*.25)*.9});if(x===-1)map.moveTo(p.x,p.y);else map.lineTo(p.x,p.y);}map.stroke();
  const ruin=mapPosition({x:25,z:-1.2});map.strokeStyle='#81745a';map.lineWidth=1.5;map.strokeRect(ruin.x-10,ruin.y-10,20,20);
  for(const m of game.mobs){if(m.state==='dead')continue;const p=mapPosition(m);map.fillStyle=m.type==='alpha'?'#edba70':'#c27461';map.beginPath();map.arc(p.x,p.y,m.type==='alpha'?3:2.2,0,Math.PI*2);map.fill();}
  for(const other of game.players){if(other.id===game.id)continue;const p=mapPosition(other);map.fillStyle='#80cddd';map.beginPath();map.arc(p.x,p.y,2.8,0,Math.PI*2);map.fill();}
  const p=mapPosition(game.player);map.fillStyle='#f4e5bb';map.beginPath();map.arc(p.x,p.y,3,0,Math.PI*2);map.fill();map.strokeStyle='#eff3d0';map.beginPath();map.moveTo(p.x,p.y);map.lineTo(p.x+Math.sin(game.player.yaw)*7,p.y+Math.cos(game.player.yaw)*7);map.stroke();
}
function updateUI(){
  const hero=game.player,camp=safe(hero),mob=selectedMob();
  $('zone-state').textContent=camp?'Безопасный лагерь':hero.x>21?'Старые руины · вожак':'Пепельная опушка · опасная зона';$('zone-state').classList.toggle('safe',camp);
  $('hp-text').textContent=`${Math.ceil(hero.hp)} / ${hero.maxHp}`;$('hp-fill').style.height=`${Math.max(0,Math.min(1,hero.hp/hero.maxHp||0))*100}%`;
  $('hp-orb').setAttribute('aria-valuemax',String(hero.maxHp));$('hp-orb').setAttribute('aria-valuenow',String(Math.ceil(hero.hp)));
  $('gold').textContent=`${hero.coins} золота`;$('xp').textContent=`${hero.xp} опыта`;$('potions').textContent=String(hero.potions);
  $('movement-label').textContent=hero.running?'Бег':'Ходьба';$('movement').setAttribute('aria-pressed',String(hero.running));$('movement').disabled=!!hero.dead;
  $('movement').title=hero.running?'Перейти на ходьбу · Shift':'Перейти на бег · Shift';
  $('potion').disabled=!!hero.dead||hero.potions===0||hero.potionCooldown>0||hero.hp>=hero.maxHp;$('potion').title=hero.potionCooldown>0?`Готово через ${Math.ceil(hero.potionCooldown)} с`:'Восстановить 45 здоровья';
  $('attack').disabled=!!hero.dead;$('reset').disabled=!!hero.dead;
  $('death-screen').hidden=!hero.dead;$('hurt-vignette').style.opacity=String(hero.hurt*.9);
  $('kills-goal').innerHTML=`Победите существ: <b>${Math.min(5,hero.questKills)} / 5</b>`;$('kills-goal').classList.toggle('done',hero.questKills>=5);$('boss-goal').classList.toggle('done',hero.boss);$('camp-goal').classList.toggle('done',hero.questClaimed);
  $('quest-hint').textContent=hero.questClaimed?'Задание выполнено. Можно продолжить охоту.':hero.questKills>=5&&hero.boss?'Возвращайтесь в безопасный лагерь.':hero.questKills>=5?'Вожак ждёт у руин, дальше по тропе.':'Идите по тропе направо, за указатель.';
  $('target-panel').hidden=!mob||mob.state==='dead';if(mob&&mob.state!=='dead'){$('target-name').textContent=MOB_TYPES[mob.type].name;$('target-health').textContent=mob.state==='return'?'Возвращается к логову':`${mob.hp} / ${MOB_TYPES[mob.type].hp}`;$('target-fill').style.transform=`scaleX(${mob.hp/MOB_TYPES[mob.type].hp})`;}
  for(const button of document.querySelectorAll<HTMLButtonElement>('[data-weapon]')){const active=button.dataset.weapon===hero.weapon;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));button.disabled=!!hero.dead;}
  $('cooldown').style.transform=`scaleX(${hero.attack?1-hero.attack.age/hero.attack.duration:0})`;
  interfaceUI.update();drawMap();
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
      loadingPlayers.add(p.id);loadWarrior().then(model=>{
        loadingPlayers.delete(p.id);if(!game.players.some(other=>other.id===p.id))return;
        scene.add(model.root);model.root.position.set(p.x,0,p.z);
        const label=document.createElement('div');label.className='player-label';$('world-ui').append(label);remoteModels.set(p.id,Object.assign(model,{label}));
      }).catch(error=>console.error(error));
    }
    const model=remoteModels.get(p.id);if(!model)continue;
    const v=visualActor(p,dt);model.root.position.set(v.x,0,v.z);model.root.rotation.y=v.yaw;model.animate(dt,v);
    const projected=new T.Vector3(v.x,2.45,v.z).project(camera);
    model.label.textContent=`${p.name} · ${classFor(p.classId).name} ${p.level} · ${Math.ceil(p.hp)}/${p.maxHp}${p.connected?'':' · нет связи'}`;
    model.label.style.transform=`translate(${(projected.x*.5+.5)*width}px,${(-projected.y*.5+.5)*height}px) translate(-50%,-100%)`;
    model.label.hidden=Math.abs(projected.x)>1.2||Math.abs(projected.y)>1.2;
  }
  for(const [id,model] of remoteModels)if(!present.has(id)){model.root.removeFromParent();model.label.remove();model.mixer.stopAllAction();model.model.traverse(o=>{if(o instanceof T.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});remoteModels.delete(id);visualHeroes.delete(id);}
}
function renderShots(){
  const ids=new Set(game.projectiles.map(p=>p.id));
  for(const [id,model] of shots)if(!ids.has(id)){model.removeFromParent();model.geometry.dispose();model.material.dispose();shots.delete(id);}
  for(const p of game.projectiles){
    let model=shots.get(p.id);
    if(!model){model=new T.Mesh(p.kind==='archer'?new T.CylinderGeometry(.025,.025,.65,5):new T.IcosahedronGeometry(.13,1),new T.MeshBasicMaterial({color:p.kind==='archer'?'#e5ce95':'#bb99ff'}));if(p.kind==='archer')model.geometry.rotateX(Math.PI/2);scene.add(model);shots.set(p.id,model);}
    model.position.set(p.x,1.05,p.z);model.rotation.y=p.yaw;
  }
}
function render(dt:number){
  const hero=visualActor(game.player,dt);time+=dt;updateCamera(dt);mouse.point=pickGround();
  if(mouse.held&&mouse.pickPending&&mouse.point){autoTarget=pickMob();selected=autoTarget;mouse.pickPending=false;}
  warrior.root.position.set(hero.x,0,hero.z);warrior.root.rotation.set(0,hero.yaw,0);
  warrior.animate(dt,hero);
  marker.position.set(hero.x,.03,hero.z);marker.rotation.y=hero.yaw;marker.visible=!hero.dead;
  world.marker.visible=false;world.animate(time);
  renderPlayers(dt);renderShots();
  for(const mob of game.mobs){
    let v=visualMobs.get(mob.id);if(!v){v={...mob};visualMobs.set(mob.id,v);}
    const x=v.x,z=v.z,yaw=v.yaw,blend=1-Math.exp(-18*dt);Object.assign(v,mob);
    if(Math.hypot(x-mob.x,z-mob.z)<3){v.x=x+(mob.x-x)*blend;v.z=z+(mob.z-z)*blend;}
    v.yaw=yaw+angleDelta(yaw,mob.yaw)*blend;
    const lag=Math.min(.1,(performance.now()-game.receivedAt)/1000);v.age+=lag;if(v.state==='windup')v.timer=Math.max(0,v.timer-lag);v.flash=Math.max(0,v.flash-lag);
    models.get(mob.id)?.animate(v,time,selected===mob.id,camera);
  }
  for(const drop of game.loot){let model=drops.get(drop.id);if(!model){model=new T.Group();for(let i=0;i<3;i++)mesh(model,lootGeometry,lootMaterial,(i-1)*.12,.1,Math.sin(i*2)*.1);scene.add(model);drops.set(drop.id,model);}model.position.set(drop.x,.05+Math.sin(time*3+drop.id)*.04,drop.z);model.rotation.y=time*.7;}
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.v.y-=8*dt;p.mesh.position.addScaledVector(p.v,dt);if(p.life<=0){p.mesh.removeFromParent();p.mesh.material.dispose();particles.splice(i,1);}}
  for(let i=floats.length-1;i>=0;i--){const f=floats[i];f.life-=dt;f.y+=dt*.6;const p=new T.Vector3(f.x,f.y,f.z).project(camera);f.element.style.transform=`translate(${(p.x*.5+.5)*width}px,${(-p.y*.5+.5)*height}px)`;f.element.style.opacity=String(Math.min(1,f.life*4));if(f.life<=0){f.element.remove();floats.splice(i,1);}}
  uiTimer+=dt;if(uiTimer>.1){uiTimer=0;updateUI();}
  renderer.render(scene,camera);
}
function loop(timestamp:number){
  if(!ready)return;const elapsed=last?(timestamp-last)/1000:1/60;last=timestamp;if(paused)return;
  const dt=Math.min(elapsed,.15);accumulator+=dt;
  while(accumulator>=1/60){tick(1/60);accumulator-=1/60;}
  render(dt);if(elapsed<.5){frames.push(elapsed);if(frames.length>90)frames.shift();}if(++frameCounter%30===0)$('performance').textContent=`${Math.round(frames.length/frames.reduce((a,b)=>a+b,0))} FPS`;
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

    world=createEnvironment(scene);game=new NetworkGame();interfaceUI=bindInterface(game,toast,clearInput);
    $('load-progress').textContent='Загружаем персонажа и обитателей леса…';
    const loaded=await Promise.all([loadWarrior(),loadMobAssets()]);warrior=loaded[0];scene.add(warrior.root);
    $('load-progress').textContent='Подключаем героя к общему миру…';await interfaceUI.join();
    for(const mob of game.mobs){const model=Object.assign(createMob(mob.type,loaded[1]),{pickMeshes:[] as T.Mesh[]});model.pickRoot.traverse(o=>{if(o instanceof T.Mesh){o.userData.mob=mob.id;model.pickMeshes.push(o);}});models.set(mob.id,model);scene.add(model.root);}
    const ring=mesh(marker,new T.RingGeometry(.43,.451,40),new T.MeshBasicMaterial({color:'#dac593',transparent:true,opacity:.62,side:T.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.castShadow=false;ring.receiveShadow=false;scene.add(marker);
    $('load-progress').textContent='Загружаем материалы леса…';await world.ready;ready=true;render(1/60);$('load-progress').textContent='Готовим свет и тени…';await renderer.compileAsync(scene,camera);$('loading').hidden=true;canvas.focus({preventScroll:true});updateUI();renderer.setAnimationLoop(loop);
  }catch(error){console.error(error);ready=false;$('loading').hidden=false;$('loading').querySelector('h2')!.textContent='Локацию не удалось открыть';$('load-progress').textContent=errorMessage(error);$('retry').hidden=false;}
}
canvas.addEventListener('pointermove',event=>{
  if(mouse.pointerId!==null&&event.pointerId!==mouse.pointerId)return;
  mouse.x=event.clientX;mouse.y=event.clientY;mouse.active=true;
  if(mouse.held){
    // Capture guarantees release outside the canvas, but UI is never a steering surface.
    if(!(event.buttons&1)||document.elementFromPoint(event.clientX,event.clientY)!==canvas){releaseMovement();mouse.active=false;mouse.point=null;return;}
    mouse.pickPending=true;
  }
});
canvas.addEventListener('pointerleave',()=>{releaseMovement();mouse.active=false;mouse.point=null;});
canvas.addEventListener('pointerdown',event=>{
  if(!ready||!game.connected||game.player.dead||interfaceUI?.isPanelOpen?.()||event.isPrimary===false)return;
  if(event.button!==0&&event.button!==2)return;
  event.preventDefault();canvas.focus({preventScroll:true});mouse.x=event.clientX;mouse.y=event.clientY;mouse.active=true;mouse.point=pickGround();
  if(event.button===2){autoTarget=null;attackAt();return;}
  mouse.held=true;mouse.pointerId=event.pointerId;canvas.setPointerCapture(event.pointerId);
  autoTarget=mouse.point?pickMob():null;selected=autoTarget;mouse.pickPending=false;
});
addEventListener('pointerup',event=>{if(event.pointerId===mouse.pointerId&&!(event.buttons&1))releaseMovement();});
addEventListener('pointercancel',event=>{if(event.pointerId===mouse.pointerId)clearInput();});
canvas.addEventListener('lostpointercapture',event=>{if(event.pointerId===mouse.pointerId)clearInput();});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',event=>{
  if(!ready||event.ctrlKey||event.metaKey)return;
  event.preventDefault();
  const unit=event.deltaMode===1?16:event.deltaMode===2?height:1;
  const delta=T.MathUtils.clamp(event.deltaY*unit,-160,160);
  targetZoom=T.MathUtils.clamp(targetZoom*Math.exp(-delta*ZOOM.sensitivity),ZOOM.min,ZOOM.max);
},{passive:false});
addEventListener('keydown',event=>{
  if(!ready||event.metaKey||event.ctrlKey||event.altKey||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName||''))return;
  if(interfaceUI?.isPanelOpen?.())return;
  if(document.activeElement?.tagName==='BUTTON'&&['Space','Enter'].includes(event.code))return;
  if(event.code==='Space'){event.preventDefault();keys.add(event.code);}if(event.repeat)return;
  if(['ShiftLeft','ShiftRight'].includes(event.code)&&(document.activeElement===canvas||document.activeElement===document.body))toggleRun();
  if(event.code==='Space'){autoTarget=null;attackAt();}if(event.code==='Digit1')chooseWeapon('sword');if(event.code==='Digit2')chooseWeapon('axe');if(event.code==='KeyR')game.potion();if(event.code==='KeyQ')game.attack(mouse.point?Math.atan2(mouse.point.x-game.player.x,mouse.point.z-game.player.z):game.player.yaw,true);if(event.code==='Escape')clearInput();
});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',clearInput);document.addEventListener('visibilitychange',()=>{paused=document.hidden;if(paused)clearInput();last=0;accumulator=0;});addEventListener('resize',fitCamera);
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();ready=false;clearInput();$('loading').hidden=false;$('loading').querySelector('h2')!.textContent='3D-изображение приостановлено';$('load-progress').textContent='Нажмите «Повторить», чтобы открыть локацию снова.';$('retry').hidden=false;});
for(const b of document.querySelectorAll<HTMLButtonElement>('[data-weapon]'))b.addEventListener('click',()=>{chooseWeapon(b.dataset.weapon);canvas.focus({preventScroll:true});});
$('special').addEventListener('click',()=>{const p=mouse.point;game.attack(p?Math.atan2(p.x-game.player.x,p.z-game.player.z):game.player.yaw,true);canvas.focus();});
$('movement').addEventListener('click',()=>{toggleRun();canvas.focus({preventScroll:true});});
$('attack').addEventListener('click',()=>{autoTarget=null;attackAt();canvas.focus({preventScroll:true});});$('potion').addEventListener('click',()=>{game.potion();canvas.focus({preventScroll:true});});$('reset').addEventListener('click',()=>{returnToCamp();canvas.focus({preventScroll:true});});$('retry').addEventListener('click',()=>location.reload());
start();
