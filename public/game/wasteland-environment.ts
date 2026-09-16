import * as T from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';
import {mesh,box,cylinder,joint} from './models.js';
import {WASTELAND_BOUNDS as B,WASTELAND_SPOTS,WASTELAND_LANDMARKS,WASTELAND_PASSAGES,WASTELAND_TREES,wastelandRoadDistance,wastelandSafe} from './wasteland.js';

/** Authored open ashland: physical inland props match wasteland.ts exactly. */
export function createWastelandEnvironment(scene:T.Scene){
 const root=new T.Group();root.name='wasteland-region';scene.add(root);root.visible=false;
 const stone=new T.MeshStandardMaterial({color:'#645347',roughness:1}),basalt=new T.MeshStandardMaterial({color:'#393a38',roughness:.9}),sand=new T.MeshStandardMaterial({color:'#a88257',roughness:1}),bone=new T.MeshStandardMaterial({color:'#b5a283',roughness:.95}),charcoal=new T.MeshStandardMaterial({color:'#292d2b',roughness:1}),bronze=new T.MeshStandardMaterial({color:'#8e673a',roughness:.72,metalness:.3});
 const geometry=new T.PlaneGeometry(244,244,160,160);geometry.rotateX(-Math.PI/2);geometry.translate(600,-.045,0);const colors:number[]=[],p=geometry.attributes.position;
 for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),trail=1-T.MathUtils.smoothstep(wastelandRoadDistance(x,z),-.4,2.4),ash=.5+.5*Math.sin(x*.07+Math.cos(z*.10)*1.8)*Math.sin(z*.065);const c=new T.Color('#766953').lerp(new T.Color('#313f3e'),ash*.62).lerp(new T.Color('#b08a5e'),trail*.82);c.multiplyScalar(.91+.09*Math.sin(x*.6+z*.23));colors.push(c.r,c.g,c.b);if(x<B.minX||x>B.maxX||z<B.minZ||z>B.maxZ)p.setY(i,.2+Math.sin(x*.12+z*.15)**2*.75);}
 geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();const soil=new T.MeshStandardMaterial({vertexColors:true,roughness:1});soil.onBeforeCompile=s=>{s.vertexShader='varying vec3 ashPoint;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nashPoint=position;');s.fragmentShader='varying vec3 ashPoint;\n'+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat wave=sin(ashPoint.x*3.1+ashPoint.z*4.7+sin(ashPoint.z*.39)*3.0);float grain=fract(sin(dot(floor(ashPoint.xz*27.0),vec2(12.9898,78.233)))*43758.5453);diffuseColor.rgb*=.92+.027*wave+.075*grain;');};const ground=mesh(root,geometry,soil);ground.castShadow=false;
 const statics=new T.Group();root.add(statics);
 for(let side=0;side<4;side++)for(let i=0;i<23;i++){
  const x=side<2?B.minX+i*7.4:side===2?B.minX-5:B.maxX+5,z=side<2?(side===0?B.minZ-5:B.maxZ+5):B.minZ+i*7.4;if(side===2&&Math.abs(z)<11)continue;
  const r=mesh(statics,new T.DodecahedronGeometry(1,0),i%3?stone:basalt,x,1.7,z);r.scale.set(3.4,2+i%4,3.4);r.rotation.y=i*.8;
  if(i%3===0){const cap=cylinder(statics,1.5,2.5,1,sand,x,4+i%4,z,6);cap.rotation.y=i*.8;}
 }
 for(const mark of WASTELAND_LANDMARKS){const g=joint(statics,mark.x,0,mark.z);
  if(mark.kind==='pillars'){for(const dx of [-2.5,0,2.5]){cylinder(g,.38,.55,4.3-Math.abs(dx)*.3,basalt,dx,2.1-Math.abs(dx)*.15,0,6);cylinder(g,.63,.52,.35,sand,dx,4.1-Math.abs(dx)*.3,0,6);for(const y of [.8,1.8,2.8])cylinder(g,.50,.50,.05,bronze,dx,y,0,6);}}
  if(mark.kind==='tomb'){box(g,5,.35,3,basalt,0,.175,0);box(g,4.8,.18,2.8,sand,0,.44,0);box(g,4.25,1.2,2.3,basalt,0,1.05,0);box(g,4.6,.20,2.65,sand,0,1.73,0);box(g,3.8,.22,2.05,stone,0,1.93,0);for(const dx of [-1.5,-.5,.5,1.5]){box(g,.1,.8,.02,bronze,dx,1.09,1.165);box(g,.12,.08,.04,bone,dx,1.49,1.17);}cylinder(g,.35,.46,.48,bronze,0,2.26,0,6);}
  if(mark.kind==='skeleton'){const spine=cylinder(g,.22,.25,5.4,bone,0,.65,0,8);spine.rotation.z=Math.PI/2;for(let j=0;j<6;j++)for(const side of [-1,1]){const rib=mesh(g,new T.TorusGeometry(.8,.075,5,10,Math.PI*.8),bone,-2.1+j*.84,.55,side*.05);rib.rotation.set(Math.PI/2,side*Math.PI/2,Math.PI/2);rib.scale.y=1.2;}}
 }
 for(const t of WASTELAND_TREES){const g=joint(statics,t.x,0,t.z);g.scale.setScalar(t.s);g.rotation.y=t.x;const trunk=cylinder(g,.075,.24,3.2,charcoal,0,1.6,0,7);trunk.rotation.z=.04;
  for(const side of [-1,1]){const branch=cylinder(g,.02,.085,1.5,charcoal,side*.4,2.2,side*.13,5);branch.rotation.z=-side*.63;const twig=cylinder(g,.007,.03,.6,charcoal,side*.8,2.8,side*.2,4);twig.rotation.z=side*.35;}}
 // Ground-level scree and dried scrub never masquerade as solid obstacles.
 for(let i=0;i<460;i++){const x=523+(i*47.179%154),z=-77+(i*61.719%154);if(wastelandRoadDistance(x,z)<2||wastelandSafe({x,z})||WASTELAND_SPOTS.some(s=>Math.hypot(x-s.x,z-s.z)<s.radius+3))continue;const r=mesh(statics,new T.DodecahedronGeometry(1,0),i%3?basalt:bone,x,.04,z);r.scale.set(.1+i%4*.045,.05,.12+i%3*.025);r.rotation.y=i;r.castShadow=false;}
 // Arrival ring is low and visibly broken at its entrances, matching the safe radius.
 for(let i=0;i<18;i++){const a=i*Math.PI/9;if(Math.abs(Math.sin(a))<.4)continue;const x=526+Math.cos(a)*6,z=Math.sin(a)*6;const r=mesh(statics,new T.DodecahedronGeometry(1,0),sand,x,.22,z);r.scale.set(.4,.27,.35);}
 for(const z of [-3.5,3.5]){cylinder(statics,.4,.6,.6,basalt,528,.3,z,8);cylinder(statics,.44,.32,.25,bronze,528,.72,z,8);}
 bake(statics);
 const flameMaterial=new T.MeshBasicMaterial({color:'#ffc475',transparent:true,opacity:.87,depthWrite:false});const flames=[-3.5,3.5].map(z=>{const f=mesh(root,new T.ConeGeometry(.2,.65,6),flameMaterial,528,1.08,z);f.castShadow=false;return f;});
 const particles=new Float32Array(100*3),pg=new T.BufferGeometry();pg.setAttribute('position',new T.BufferAttribute(particles,3));const dust=new T.Points(pg,new T.PointsMaterial({color:'#ccb48b',size:.035,transparent:true,opacity:.4,depthWrite:false}));dust.frustumCulled=false;root.add(dust);
 // The snow-side gateway belongs to its own scene and is visible only near that map.
 const approach=new T.Group();approach.name='wasteland-snow-passage';scene.add(approach);for(const z of [7,17]){const cliff=mesh(approach,new T.DodecahedronGeometry(2,0),basalt,439,1.3,z);cliff.scale.set(1.2,1.5,1);}
 const passages=WASTELAND_PASSAGES.map(portal=>{const object=new T.Group();object.position.set(portal.x,0,portal.z);object.userData.portalId=portal.id;scene.add(object);return {portal,object};});
 return {root,ground,passages,animate(time:number,hero:{x:number;z:number},active:boolean){root.visible=active;approach.visible=hero.x>400&&hero.x<450;if(!active)return;for(let i=0;i<100;i++){particles[i*3]=hero.x+(i*7.117+time*1.2)%30-15;particles[i*3+1]=.3+(i*.37+time*.13)%5;particles[i*3+2]=hero.z+(i*11.27+time*.36)%28-14;}pg.attributes.position.needsUpdate=true;flames.forEach((f,i)=>f.scale.y=1+Math.sin(time*8+i)*.12);}};
}
function bake(group:T.Group){group.updateMatrixWorld(true);const batches=new Map<T.Material,T.Mesh[]>();group.traverse(o=>{if(o instanceof T.Mesh&&!Array.isArray(o.material)){const a=batches.get(o.material)||[];a.push(o);batches.set(o.material,a);}});for(const [material,objects] of batches){const gs=objects.map(o=>{const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);return g;}),g=mergeGeometries(gs,false);if(g){mesh(group,g,material);for(const o of objects){o.removeFromParent();o.geometry.dispose();}}gs.forEach(g=>g.dispose());}}
