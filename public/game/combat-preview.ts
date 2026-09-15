import * as T from './vendor/three.module.js';
import {loadWarrior} from './character.js';
import {skillsForClass} from './skills.js';
import {classFor} from '../rules.js';
import {createSkillEffects} from './skill-effects.js';
import type {ClassId,HeroAttack} from '../../shared/types.js';
const canvas=document.querySelector<HTMLCanvasElement>('#stage')!,classes=document.querySelector<HTMLSelectElement>('#class')!,action=document.querySelector<HTMLSelectElement>('#action')!,phaseInput=document.querySelector<HTMLInputElement>('#phase')!,angle=document.querySelector<HTMLInputElement>('#angle')!,play=document.querySelector<HTMLButtonElement>('#play')!,readout=document.querySelector<HTMLElement>('#readout')!;
const renderer=new T.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
const scene=new T.Scene();scene.background=new T.Color('#18291f');scene.add(new T.HemisphereLight('#dae8e5','#44422d',2));
const key=new T.DirectionalLight('#ffe1b3',3.5);key.position.set(4,7,5);scene.add(key);const rim=new T.DirectionalLight('#a4cce6',2);rim.position.set(-4,3,-3);scene.add(rim);
const camera=new T.PerspectiveCamera(34,innerWidth/innerHeight,.1,50);camera.position.set(4.2,3.6,7.5);camera.lookAt(0,1,1);
const ground=new T.Mesh(new T.CylinderGeometry(6.5,6.5,.06,64),new T.MeshStandardMaterial({color:'#394c36',roughness:1}));ground.position.y=-.035;scene.add(ground);
const fx=createSkillEffects(scene);let model:Awaited<ReturnType<typeof loadWarrior>>|null=null,playing=true,phase=0,last=0,serial=1,impact=false,warning=false,loadingSerial=0;
function discard(character:Awaited<ReturnType<typeof loadWarrior>>){character.root.removeFromParent();character.mixer.stopAllAction();character.disposeExtras();const materials=new Set<T.Material>(),skeletons=new Set<T.Skeleton>();character.model.traverse(object=>{if(object instanceof T.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);if(object instanceof T.SkinnedMesh)skeletons.add(object.skeleton);});for(const material of materials)material.dispose();for(const skeleton of skeletons)skeleton.dispose();}
async function select(){const load=++loadingSerial;readout.textContent='Загрузка…';if(model)model.root.visible=false;const next=await loadWarrior(classes.value as ClassId);if(load!==loadingSerial){discard(next);return;}if(model)discard(model);model=next;scene.add(model.root);phase=0;serial++;impact=false;warning=false;fx.clear();}
classes.onchange=()=>void select();action.onchange=()=>{phase=0;serial++;impact=false;warning=false;fx.clear();};play.onclick=()=>{playing=!playing;play.textContent=playing?'Пауза':'Воспроизвести';};phaseInput.oninput=()=>{playing=false;play.textContent='Воспроизвести';phase=Number(phaseInput.value)/100;impact=false;warning=false;fx.clear();};
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
void select();
renderer.setAnimationLoop(t=>{const dt=Math.min(.06,last?(t-last)/1000:1/60);last=t;if(!model)return;const classId=classes.value as ClassId,skill=skillsForClass(classId).find(s=>s.slot===action.value),duration=(classId==='warrior'?.64:classFor(classId).duration)*(skill?.durationScale||1);if(playing){phase+=dt/duration;if(phase>2.1){phase=0;serial++;impact=false;warning=false;fx.clear();}phaseInput.value=String(Math.min(200,phase*100));}
 const attack:HeroAttack|null=phase<=1?{id:serial,age:phase*duration,duration,yaw:0,weapon:'sword',special:!!skill,skillId:skill?.id,hit:impact}:null;
 model.root.rotation.y=Number(angle.value)*Math.PI/180;model.animate(dt,{classId,weapon:'sword',dead:0,hurt:0,attack,moveBlend:0,runBlend:0,gait:0});
 if(skill){const delay=skill.id==='archer-rain'?.45:skill.id==='mage-meteor'?.7:0,forward=delay?Math.min(3,skill.range-skill.radius!*.65):skill.classId==='archer'||skill.id==='mage-fireball'||skill.id==='mage-lightning'?2.6:0,event={skillId:skill.id,caster:'preview',attackId:serial,x:Math.sin(model.root.rotation.y)*forward,z:Math.cos(model.root.rotation.y)*forward,yaw:model.root.rotation.y,radius:skill.radius,from:skill.id==='mage-lightning'?{x:0,z:0}:undefined};
 if(delay&&!warning&&phase>=skill.hitFraction){warning=true;fx.impact({...event,phase:'warning',delay},playing?0:(phase-skill.hitFraction)*duration);}
 if(!impact&&phase>=skill.hitFraction+delay/duration){impact=true;fx.impact({...event,phase:'impact'},playing?0:(phase-skill.hitFraction)*duration-delay);}}
 fx.update(playing?dt:0);readout.textContent=`${skill?.name||'Обычная атака'} · ${duration.toFixed(2)} с · фаза ${Math.round(phase*100)}% · выпуск / удар ${Math.round((skill?.hitFraction||.49)*100)}%`;renderer.render(scene,camera);
});
