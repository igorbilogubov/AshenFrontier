import * as T from './vendor/three.module.js';
import {loadWarrior,CLIP_NAMES,type WarriorClip} from './character.js';
import {regionalEquipment,CLASS_ITEMS,EQUIPMENT_ITEMS,rollEquipment,equipmentAppearance,itemDefinition} from './equipment-items.js';
import {REGIONAL_COLLECTIONS,type GearRegion} from './regional-equipment.js';
import {renderItemRolls} from './item-details.js';
import {characterStats,EQUIPMENT_SLOTS} from '../rules.js';
import {itemArtwork} from './item-icons.js';
import {element as $,errorMessage} from './ui-types.js';
import type {ClassId,Equipment,Item} from '../../shared/types.js';

const canvas=$('portrait'),renderer=new T.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
const scene=new T.Scene();scene.background=new T.Color('#15231e');scene.fog=new T.Fog('#15231e',7,16);
const camera=new T.PerspectiveCamera(30,1,.1,30);camera.position.set(.25,2.35,5.5);camera.lookAt(0,1.04,0);
scene.add(new T.HemisphereLight('#e0e7d2','#3b4232',1.9));
for(const [position,color,intensity] of [[[3,5,3],'#ffe0a6',3],[[-3,3,1],'#b2c9d4',1.8],[[1,4,-3],'#a9c7ab',3]] as const){const light=new T.DirectionalLight(color,intensity);light.position.set(position[0],position[1],position[2]);scene.add(light);if(position[0]===3){light.castShadow=true;light.shadow.mapSize.set(1024,1024);Object.assign(light.shadow.camera,{left:-2,right:2,top:3,bottom:-2});light.shadow.normalBias=.012;}}
const ground=new T.Mesh(new T.CircleGeometry(9,64),new T.MeshStandardMaterial({color:'#172a20',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.036;ground.receiveShadow=true;scene.add(ground);
const plinth=new T.Mesh(new T.CylinderGeometry(1.3,1.38,.06,64),new T.MeshStandardMaterial({color:'#2b352b',roughness:.88}));plinth.position.y=-.033;plinth.receiveShadow=true;scene.add(plinth);
const rim=new T.Mesh(new T.TorusGeometry(1.23,.006,4,80),new T.MeshStandardMaterial({color:'#7b7451',metalness:.5,roughness:.55}));rim.rotation.x=Math.PI/2;rim.position.y=.003;scene.add(rim);
const random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
const samples=new Map<string,Item>(EQUIPMENT_ITEMS.map(definition=>[definition.id,rollEquipment(definition.id,crypto.randomUUID(),random)]));
const wardrobes:Record<ClassId,Equipment>={warrior:{},archer:{},mage:{}};let equipment=wardrobes.warrior;let selected='watch-armor',warrior:Awaited<ReturnType<typeof loadWarrior>>,clip:WarriorClip='Idle',elapsed=0,last=0,paused=false,feedback='';
let previewClass:ClassId='warrior',loadSequence=0;let previewRegion:GearRegion='forest',previewRarity:1|2=1;
const previewItems=()=>regionalEquipment(previewClass,previewRegion,previewRarity);
const models=new Map<ClassId,Awaited<ReturnType<typeof loadWarrior>>>();
const buttons=new Map<string,HTMLButtonElement>();
const source=()=>({classId:previewClass,level:previewRegion==='forest'?1:REGIONAL_COLLECTIONS[previewRegion].level,items:[...samples.values()],equipment});
const shortNames:Record<string,string>={weapon:'МЕЧ',armor:'ДОСПЕХ',helmet:'ГОЛОВА',boots:'САПОГИ',ring:'КОЛЬЦО',amulet:'АМУЛЕТ'};
const classNames:Record<ClassId,string>={warrior:'Воин',archer:'Лучник',mage:'Маг'};
const collections:Record<ClassId,readonly [string,string,string,string]>={warrior:['wanderer','watch','Странник','Дозорный'],archer:['ranger','sentinel','Следопыт','Лесной страж'],mage:['acolyte','runekeeper','Послушник','Хранитель рун']};
function catalog(){
  $('catalog').replaceChildren();buttons.clear();
  for(const definition of previewItems()){const button=document.createElement('button');button.innerHTML=itemArtwork(samples.get(definition.id)!,previewClass);const label=document.createElement('small');label.textContent=definition.slot==='weapon'?(previewClass==='archer'?'ЛУК':previewClass==='mage'?'ПОСОХ':'МЕЧ'):shortNames[definition.slot];button.append(label);button.title=definition.name;button.setAttribute('aria-label',definition.name);button.onclick=()=>{selected=definition.id;feedback='';update();};$('catalog').append(button);buttons.set(definition.id,button);}
  $('wear-light').textContent=previewRegion==='forest'?collections[previewClass][2]:REGIONAL_COLLECTIONS[previewRegion][previewClass][1];$('wear-heavy').textContent=collections[previewClass][3];$('wear-heavy').hidden=previewRegion!=='forest';$('wardrobe-class').textContent=classNames[previewClass].toUpperCase()+' · УРОВЕНЬ '+source().level;
}
catalog();
function fit(){const {width,height}=canvas.getBoundingClientRect();renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
new ResizeObserver(fit).observe(canvas);fit();
function update(){
  const item=samples.get(selected)!,definition=itemDefinition(selected)!,worn=equipment[item.slot]===item.id;
  for(const [id,button] of buttons){button.classList.toggle('selected',id===selected);button.classList.toggle('worn',Object.values(equipment).includes(samples.get(id)!.id));button.setAttribute('aria-pressed',String(id===selected));}
  $('sample-icon').innerHTML=itemArtwork(item,previewClass);$('sample-kind').textContent=(item.rarity===2?'РЕДКИЙ · ':'НЕОБЫЧНЫЙ · ')+EQUIPMENT_SLOTS[item.slot].name.toUpperCase();$('sample-name').textContent=item.name;$('sample-worn').textContent=worn?'◆ Надето на манекен':classNames[previewClass]+' · от '+definition.level+'-го уровня';
  renderItemRolls($('sample-rolls'),item,[...samples.values()].find(other=>other.id===equipment[item.slot]));
  $('sample-equip').textContent=worn?'Снять':'Надеть';$('sample-feedback').textContent=feedback||'Каждая находка получает свои значения в указанном диапазоне.';
  const stats=characterStats(source()),values:[string,string][]=[['Урон',stats.attack.toFixed(1)],['Защита',stats.armor.toFixed(1)],['Здоровье',String(stats.maxHp)],['Мана',String(stats.maxMana)],['Попадание',(stats.hitChance*100).toFixed(1)+'%'],['Скорость атак','+'+Math.round(stats.attackSpeed*100)+'%']];
  $('sample-totals').replaceChildren(...values.map(([label,value])=>{const row=document.createElement('div'),name=document.createElement('span'),number=document.createElement('strong');name.textContent=label;number.textContent=value;row.append(name,number);return row;}));
  warrior?.equipment('sword',previewClass,equipmentAppearance(source()));
}
function preset(kind:'wanderer'|'watch'|'none'){
  for(const key of Object.keys(equipment) as (keyof Equipment)[])delete equipment[key];
  if(kind!=='none')for(const definition of previewItems())if(previewRegion!=='forest'||definition.id.startsWith(collections[previewClass][kind==='wanderer'?0:1])||definition.slot==='ring'||definition.slot==='amulet')equipment[definition.slot]=samples.get(definition.id)!.id;
  for(const [id,value] of [['wear-light','wanderer'],['wear-heavy','watch'],['wear-none','none']])$(id).classList.toggle('active',value===kind);
  feedback='';update();
}
$('wear-light').onclick=()=>preset('wanderer');$('wear-heavy').onclick=()=>preset('watch');$('wear-none').onclick=()=>preset('none');
$('sample-equip').onclick=()=>{const item=samples.get(selected)!;equipment[item.slot]=equipment[item.slot]===item.id?null:item.id;for(const id of ['wear-light','wear-heavy','wear-none'])$(id).classList.remove('active');update();};
$('sample-roll').onclick=()=>{const old=samples.get(selected)!,next=rollEquipment(selected,crypto.randomUUID(),random);samples.set(selected,next);if(equipment[old.slot]===old.id)equipment[old.slot]=next.id;feedback='Создан новый образец. Найденные в игре вещи так перебрасывать нельзя.';update();};
$('motion').onchange=()=>{const value=($('motion') as HTMLSelectElement).value;if(CLIP_NAMES.includes(value as WarriorClip)){clip=value as WarriorClip;elapsed=0;warrior?.previewClip(clip);}};
$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'Продолжить':'Пауза';};
preset('watch');
try{await selectClass('warrior');$('class-preview').removeAttribute('disabled');
  let frames=0,time=0;
  renderer.setAnimationLoop(now=>{const dt=last?Math.min((now-last)/1000,.15):0;last=now;if(document.hidden)return;if(!paused)elapsed+=dt;warrior.root.rotation.y=Number($('angle').value)*Math.PI/180;warrior.samplePreview(elapsed);renderer.render(scene,camera);frames++;time+=dt;if(time>1){$('render-status').textContent=Math.round(frames/time)+' FPS · '+renderer.info.render.triangles.toLocaleString('ru-RU')+' треугольников · колесо — приближение';frames=time=0;}});
  canvas.addEventListener('wheel',event=>{event.preventDefault();camera.zoom=T.MathUtils.clamp(camera.zoom*Math.exp(-event.deltaY*.001),.8,1.8);camera.updateProjectionMatrix();},{passive:false});
}catch(error){$('render-status').textContent=errorMessage(error);console.error(error);}

async function selectClass(classId:ClassId){
  const sequence=++loadSequence;previewClass=classId;equipment=wardrobes[classId];selected=previewItems().find(item=>item.slot==='armor')!.id;catalog();($('class-preview') as HTMLSelectElement).value=classId;
  $('render-status').textContent='Загружаем модель…';
  try{
    const model=models.get(classId)??await loadWarrior(classId);models.set(classId,model);
    if(sequence!==loadSequence)return;
    if(warrior)scene.remove(warrior.root);warrior=model;scene.add(warrior.root);
    elapsed=0;warrior.previewClip(clip);warrior.equipment('sword',classId,equipmentAppearance(source()));
    const names={warrior:'Exo Gray',archer:'Erika Archer',mage:'Dreyar'};
    const notes={warrior:'Воин · Странник и дозорный · 6 слотов снаряжения',archer:'Лучник · Следопыт и Лесной страж · 6 слотов снаряжения',mage:'Маг · Послушник и Хранитель рун · 6 слотов снаряжения'};
    $('model-name').textContent=names[classId];$('model-note').textContent=notes[classId];
    $('warrior-wardrobe').hidden=false;$('warrior-presets').hidden=false;$('class-description').hidden=true;
    $('class-name').textContent=names[classId];$('class-copy').textContent=notes[classId];canvas.setAttribute('aria-label',notes[classId]);if(!Object.keys(equipment).length)preset('wanderer');else update();
  }catch(error){$('render-status').textContent=errorMessage(error);console.error(error);if(!warrior)throw error;}
}
$('class-preview').onchange=()=>{const value=($('class-preview') as HTMLSelectElement).value;if(value==='warrior'||value==='archer'||value==='mage')void selectClass(value);};
$('back-to-warrior').onclick=()=>void selectClass('warrior');

function selectCollection(){previewRegion=($('region-preview') as HTMLSelectElement).value as GearRegion;previewRarity=Number(($('rarity-preview') as HTMLSelectElement).value) as 1|2;selected=previewItems().find(item=>item.slot==='armor')!.id;catalog();preset('wanderer');}
$('region-preview').onchange=selectCollection;$('rarity-preview').onchange=selectCollection;
