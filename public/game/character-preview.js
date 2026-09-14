import * as T from './vendor/three.module.js';
import {loadWarrior,CLIP_NAMES} from './character.js';
const $=id=>document.getElementById(id),canvas=$('portrait');
const renderer=new T.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
const scene=new T.Scene();scene.background=new T.Color('#192125');scene.fog=new T.Fog('#192125',10,24);
const camera=new T.PerspectiveCamera(30,1,.1,40);camera.position.set(2.5,2.45,5.2);camera.lookAt(0,.95,0);
scene.add(new T.HemisphereLight('#d3e7f0','#605141',2));
const studio=new T.Scene();studio.background=new T.Color('#b1bfbe');
const pmrem=new T.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(studio,.1).texture;scene.environmentIntensity=.6;pmrem.dispose();
for(const [pos,color,intensity] of [[[3,5,4],'#ffe8be',3],[[-4,2,2],'#aecae9',2],[[2,4,-3],'#c7d9eb',3]]){const l=new T.DirectionalLight(color,intensity);l.position.set(...pos);scene.add(l);if(pos[0]===3){l.castShadow=true;l.shadow.mapSize.set(1024,1024);Object.assign(l.shadow.camera,{left:-3,right:3,top:3,bottom:-3});l.shadow.normalBias=.015;}}
const ground=new T.Mesh(new T.CircleGeometry(5,80),new T.MeshStandardMaterial({color:'#263437',roughness:.94}));ground.rotation.x=-Math.PI/2;ground.position.y=-.025;ground.receiveShadow=true;scene.add(ground);
const labels=['Стойка','Ходьба','Бег','Удар поперёк','Удар сверху','Получение урона','Падение'];
let warrior,clip='Idle',elapsed=0,paused=false,last=0;
function fit(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
fit();addEventListener('resize',fit);
function select(name){clip=name;elapsed=0;warrior.previewClip(name);for(const b of $('clips').children)b.setAttribute('aria-pressed',String(b.dataset.clip===name));}
function status(){const duration=warrior.clips[clip].duration;$('timeline').value=Math.round(Math.min(elapsed/duration,1)*1000);$('status').textContent=`${labels[CLIP_NAMES.indexOf(clip)]} · ${Math.min(elapsed,duration).toFixed(2)} / ${duration.toFixed(2)} с${paused?' · пауза':''}`;}
try{
  warrior=await loadWarrior();scene.add(warrior.root);
  CLIP_NAMES.forEach((name,i)=>{const b=document.createElement('button');b.textContent=labels[i];b.dataset.clip=name;b.setAttribute('aria-pressed','false');b.onclick=()=>select(name);$('clips').append(b);});
  select('Idle');
  $('weapon').onchange=()=>warrior.equipment($('weapon').value);
  $('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'Продолжить':'Пауза';status();};
  $('timeline').oninput=()=>{paused=true;$('pause').textContent='Продолжить';elapsed=Number($('timeline').value)/1000*warrior.clips[clip].duration;warrior.samplePreview(elapsed);status();};
  renderer.setAnimationLoop(t=>{const dt=last?Math.min((t-last)/1000,.1):0;last=t;if(document.hidden)return;
    if(!paused){elapsed+=dt;const duration=warrior.clips[clip].duration;if(clip!=='Death')elapsed%=duration;else elapsed=Math.min(elapsed,duration);}
    warrior.root.rotation.y=Number($('angle').value)*Math.PI/180;warrior.samplePreview(elapsed);status();renderer.render(scene,camera);
  });
}catch(error){$('status').textContent=error.message;console.error(error);}
