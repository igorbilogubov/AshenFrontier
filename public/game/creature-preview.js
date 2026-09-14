import * as T from './vendor/three.module.js';
import {loadMobAssets,createMob} from './mobs.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {MOB_TYPES} from './location.js';
const $=id=>document.getElementById(id),renderer=new T.WebGLRenderer({canvas:$('portrait'),antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
const scene=new T.Scene();scene.background=new T.Color('#192125');scene.fog=new T.Fog('#192125',10,24);
const camera=new T.PerspectiveCamera(32,1,.1,40);camera.position.set(3.1,2.7,5.5);camera.lookAt(0,.75,0);
scene.add(new T.HemisphereLight('#d3e7f0','#605141',2));
const studio=new T.Scene();studio.background=new T.Color('#b1bfbe');const pmrem=new T.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(studio,.1).texture;scene.environmentIntensity=.45;pmrem.dispose();
for(const [pos,color,intensity] of [[[3,5,4],'#ffe8be',3],[[-4,2,2],'#aecae9',2],[[2,4,-3],'#c7d9eb',2]]){const l=new T.DirectionalLight(color,intensity);l.position.set(...pos);scene.add(l);if(pos[0]===3){l.castShadow=true;l.shadow.mapSize.set(1024,1024);Object.assign(l.shadow.camera,{left:-4,right:4,top:4,bottom:-4});l.shadow.normalBias=.012;}}
const ground=new T.Mesh(new T.CircleGeometry(6,80),new T.MeshStandardMaterial({color:'#263437',roughness:.94}));ground.rotation.x=-Math.PI/2;ground.position.y=-.025;ground.receiveShadow=true;scene.add(ground);
const labels={Idle:'Покой',Walk:'Шаг',Run:'Бег',Attack:'Атака',Hit:'Ранение',Death:'Падение',Turn_Left:'Влево',Turn_Right:'Вправо'};
let models,current,beforePromise,clip='Idle',elapsed=0,paused=false,last=0,selectionRequest=0;
const focus=new T.Vector3();
function fit(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.setViewOffset(innerWidth,innerHeight,Math.min(260,innerWidth*.28)/2,0,innerWidth,innerHeight);camera.updateProjectionMatrix();}fit();addEventListener('resize',fit);
function selectClip(name){clip=name;elapsed=0;current.previewClip(name);for(const b of $('clips').children)b.setAttribute('aria-pressed',String(b.dataset.clip===name));}
async function selectCreature(type){
  const request=++selectionRequest,version=$('version').value;
  $('version-field').hidden=type!=='wolf';
  if(type==='wolf'&&version==='before'&&!models['wolf-before']){
    beforePromise??=new GLTFLoader().loadAsync(new URL('./creatures/wolf-before.glb',import.meta.url).href).then(asset=>{
      const model=createMob('wolf',{wolf:asset});model.root.visible=false;scene.add(model.root);models['wolf-before']=model;
    }).catch(error=>{beforePromise=null;throw error;});
    try{await beforePromise;}catch(error){$('status').textContent='Не удалось загрузить прошлую версию';console.error(error);return;}
    if(request!==selectionRequest)return;
  }
  const key=type==='wolf'&&version==='before'?'wolf-before':type;
  for(const [name,model] of Object.entries(models))model.root.visible=name===key;
  current=models[key];$('creature-name').textContent=MOB_TYPES[type].name;
  if(!current.clips[clip]){clip='Idle';elapsed=0;}
  current.previewClip(clip);current.samplePreview(elapsed);
  $('clips').replaceChildren();
  for(const name of Object.keys(current.clips)){
    const b=document.createElement('button');b.textContent=labels[name];b.dataset.clip=name;b.setAttribute('aria-pressed',String(clip===name));b.onclick=()=>selectClip(name);$('clips').append(b);
  }
}
try{
  const assets=await loadMobAssets();models=Object.fromEntries(Object.keys(MOB_TYPES).map(type=>{const model=createMob(type,assets);scene.add(model.root);return [type,model];}));
  await selectCreature('wolf');$('creature').onchange=$('version').onchange=()=>selectCreature($('creature').value);
  $('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'Продолжить':'Пауза';};
  $('timeline').oninput=()=>{paused=true;$('pause').textContent='Продолжить';elapsed=Number($('timeline').value)/1000*current.clips[clip].duration;current.samplePreview(elapsed);};
  renderer.setAnimationLoop(t=>{const dt=last?Math.min((t-last)/1000,.1):0;last=t;if(document.hidden)return;
    if(!paused){elapsed+=dt;if(clip==='Death')elapsed=Math.min(elapsed,current.clips[clip].duration);}
    const turning=clip==='Turn_Left'?1:clip==='Turn_Right'?-1:0;
    current.root.rotation.y=Number($('angle').value)*Math.PI/180+turning*elapsed/current.clips[clip].duration;current.samplePreview(elapsed);
    focus.set(0,.75,0);
    if(clip==='Death'){current.model.getObjectByName('Chest').getWorldPosition(focus);focus.y=.75;}
    const framing=$('creature').value==='alpha'?1.18:1;
    camera.position.set(focus.x+3.1*framing,.75+1.95*framing,focus.z+5.5*framing);camera.lookAt(focus);
    const d=current.clips[clip].duration,frame=clip==='Death'?Math.min(elapsed,d):elapsed%d;$('timeline').value=Math.round(frame/d*1000);$('status').textContent=`${labels[clip]} · ${frame.toFixed(2)} / ${d.toFixed(2)} с${paused?' · пауза':''}`;
    renderer.render(scene,camera);
  });
}catch(error){$('status').textContent=error.message;console.error(error);}
