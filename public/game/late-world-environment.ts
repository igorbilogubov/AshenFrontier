import * as T from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';
import {LATE_REGIONS,lateRoadDistance,type LateRegionId} from './late-world.js';
import {mesh,box,cylinder,joint} from './models.js';
const palettes={swamp:['#344a38','#697348','#233e36','#7c8060','#a4bd70'],mines:['#423e3a','#6c6255','#363c40','#748585','#53aead'],rift:['#343235','#615149','#2a292e','#795146','#ee813d'],citadel:['#34373d','#595960','#282c36','#696b73','#a288cb']} as const;
/** Batched open-region scenery. Only one 180m region renders at a time. */
export function createLateWorldEnvironment(scene:T.Scene){
 const roots=new Map<LateRegionId,T.Group>(),animated:T.Object3D[]=[];let active:LateRegionId|null=null,time=0;
 for(const region of LATE_REGIONS){
  const colors=palettes[region.id],root=new T.Group();root.name=`late-region-${region.id}`;root.visible=false;scene.add(root);roots.set(region.id,root);
  const stone=new T.MeshStandardMaterial({color:colors[2],roughness:.95}),trim=new T.MeshStandardMaterial({color:colors[3],roughness:.9}),wood=new T.MeshStandardMaterial({color:'#3e392f',roughness:1}),accent=new T.MeshStandardMaterial({color:colors[4],roughness:.5,emissive:colors[4],emissiveIntensity:.16});
  const water=new T.MeshStandardMaterial({color:'#223e37',roughness:.23,metalness:.15});
  const groundGeo=new T.PlaneGeometry(252,252,126,126);groundGeo.rotateX(-Math.PI/2);groundGeo.translate(region.bounds.minX+90,-.035,0);const pos=groundGeo.attributes.position,vertexColors:number[]=[];
  for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i),road=1-T.MathUtils.smoothstep(lateRoadDistance(region,x,z),-.3,2.5),patch=.5+.5*Math.sin(x*.083+Math.cos(z*.06)*2.1)*Math.cos(z*.075);const c=new T.Color(colors[0]).lerp(new T.Color(colors[2]),patch*.55).lerp(new T.Color(colors[1]),road*.8);c.multiplyScalar(.92+.08*Math.sin(x*1.7+z*.63));vertexColors.push(c.r,c.g,c.b);if(x<region.bounds.minX||x>region.bounds.maxX||Math.abs(z)>90)pos.setY(i,.2+Math.sin(x*.13+z*.07)**2*.8);}
  groundGeo.setAttribute('color',new T.Float32BufferAttribute(vertexColors,3));groundGeo.computeVertexNormals();const groundMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:1});groundMaterial.onBeforeCompile=s=>{s.vertexShader='varying vec3 latePoint;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nlatePoint=position;');s.fragmentShader='varying vec3 latePoint;\n'+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat g=fract(sin(dot(floor(latePoint.xz*23.0),vec2(12.9898,78.233)))*43758.5453);diffuseColor.rgb*=.89+.13*g+.025*sin(latePoint.x*4.7+sin(latePoint.z*2.2));');};mesh(root,groundGeo,groundMaterial).castShadow=false;
  const statics=new T.Group();root.add(statics);
  // Sparse solid objects use exactly the circles exported for movement/collision.
  for(const p of region.props){const g=joint(statics,p.x,0,p.z);g.rotation.y=p.x*.3;
   if(p.kind==='tree'){cylinder(g,.12,p.r,p.height,wood,0,p.height/2,0,7);for(const side of [-1,1]){const branch=cylinder(g,.04,.10,1.6,wood,side*.38,p.height*.7,0,6);branch.rotation.z=-side*.6;const crown=mesh(g,new T.IcosahedronGeometry(1,1),stone,side*.5,p.height,0);crown.scale.set(1.1,.5,.8);}for(let k=0;k<3;k++){const rootWood=cylinder(g,.03,.12,1.2,wood,Math.sin(k*2.1)*.45,.15,Math.cos(k*2.1)*.45,5);rootWood.rotation.x=1.3;rootWood.rotation.z=k*2.1;}}
   else if(p.kind==='pillar'){cylinder(g,p.r*.82,p.r,p.height,stone,0,p.height/2,0,7);cylinder(g,p.r*1.05,p.r,.22,trim,0,p.height,0,7);for(let n=0;n<3;n++)box(g,p.r*1.45,.1,p.r*1.45,trim,0,.5+n,0);}
   else {const rock=mesh(g,new T.DodecahedronGeometry(1,0),stone,0,p.height*.36,0);rock.scale.set(p.r,p.height*.48,p.r);if(region.id==='mines')for(let n=0;n<3;n++){const crystal=cylinder(g,0,.15,.6+n*.2,accent,(n-1)*.24,p.height*.6,.12,5);crystal.rotation.z=(n-1)*.3;}else for(let n=0;n<2;n++)cylinder(g,p.r*.7,p.r*.8,.13,trim,0,.4+n*.6,0,6);}
  }
  // These shallow patches are explicitly traversable; they never form hidden walls.
  for(let i=0;i<42;i++){const x=region.bounds.minX+19+(i*47.19%149),z=-75+i*61.17%150;if(lateRoadDistance(region,x,z)<6||Math.hypot(x-region.dungeonEntrance.x,z-region.dungeonEntrance.z)<12)continue;
   if(region.id==='swamp'){const pool=mesh(statics,new T.CircleGeometry(2+i%3,18),water,x,-.012,z);pool.rotation.x=-Math.PI/2;pool.castShadow=false;for(let j=0;j<5;j++){const a=j*1.25;cylinder(statics,.025,.035,.65,trim,x+Math.cos(a)*2.2,.3,z+Math.sin(a)*2.2,4);}}
   if(region.id==='rift'){const seam=box(statics,.12,.015,3+i%4,accent,x,-.006,z);seam.rotation.y=i*.7;seam.castShadow=false;}
   if(region.id==='citadel'){for(let j=0;j<3;j++)box(statics,1.2,.02,.65,j%2?stone:trim,x+j*1.27,-.006,z);}
   if(region.id==='mines'){const sleeper=box(statics,3,.025,.23,wood,x,-.005,z);sleeper.rotation.y=i*.5;}
  }
  // Three substantial landmarks establish the biome at walking-camera scale.
  // Their four-metre bases are exported in late-world.ts as solid circles.
  for(const [dx,z] of [[20,-55],[160,45],[20,50]]){const x=region.bounds.minX+dx;
   if(region.id==='swamp'){cylinder(statics,3.8,4,.8,wood,x,.4,z,11);cylinder(statics,.8,1.4,7.5,wood,x,4,z,9);for(let k=0;k<6;k++){const a=k*Math.PI/3,g=joint(statics,x,0,z);g.rotation.y=a;const branch=cylinder(g,.08,.27,4.5,wood,1.2,5.3,0,7);branch.rotation.z=-.65;const canopy=mesh(g,new T.IcosahedronGeometry(1,1),stone,2.7,6.6,0);canopy.scale.set(2.2,.8,1.6);for(let j=0;j<4;j++)cylinder(g,.018,.04,2.2,trim,2+j*.35,5.4,.6,4);}}
   if(region.id==='mines'){cylinder(statics,3.5,4,1.2,stone,x,.6,z,9);for(let k=0;k<7;k++){const a=k*.9,c=cylinder(statics,0,.5,3+k%3,accent,x+Math.cos(a)*2,2.2,z+Math.sin(a)*2,5);c.rotation.z=Math.cos(a)*.23;c.rotation.x=Math.sin(a)*.23;}}
   if(region.id==='rift'){cylinder(statics,3,4,2.7,stone,x,1.35,z,9);cylinder(statics,2.65,2.8,.08,accent,x,2.73,z,16);for(let k=0;k<9;k++){const a=k*Math.PI*2/9,lip=mesh(statics,new T.DodecahedronGeometry(.7,0),stone,x+Math.cos(a)*3,2.8,z+Math.sin(a)*3);lip.scale.y=.7;}}
   if(region.id==='citadel'){cylinder(statics,3.7,4,7,stone,x,3.5,z,8);cylinder(statics,4,3.9,.5,trim,x,7.25,z,8);for(let k=0;k<8;k++){const a=k*Math.PI/4;box(statics,.7,1,.7,trim,x+Math.cos(a)*3.6,8,z+Math.sin(a)*3.6);}for(const side of [-1,1])box(statics,.15,2,.03,accent,x+side*1.2,4.5,z+3.7);}
  }
  // Distant silhouettes outside playable bounds; both horizontal passages stay open.
  for(let side=0;side<4;side++)for(let i=0;i<25;i++){const x=side<2?region.bounds.minX+i*7.5:side===2?region.bounds.minX-6:region.bounds.maxX+6,z=side<2?(side===0?-96:96):-90+i*7.5;if(side>=2&&Math.abs(z)<13)continue;const m=mesh(statics,new T.DodecahedronGeometry(1,0),stone,x,2,z);m.scale.set(4,3+i%4,4);if(region.id==='citadel'){box(statics,5,6+i%4,3,stone,x,3,z);box(statics,5.4,.5,3.4,trim,x,6+i%4,z);}}
  // Region-specific dungeon facade is open in its center. Only side pillars are solid.
  const e=region.dungeonEntrance;
  for(const side of [-1,1]){box(statics,1.2,3.5,1.5,stone,e.x+side*2.4,1.75,e.z);box(statics,1.5,.35,1.8,trim,e.x+side*2.4,3.65,e.z);}
  box(statics,6,.65,1.7,trim,e.x,4,e.z);const doorway=mesh(statics,new T.PlaneGeometry(3.2,3.4),new T.MeshBasicMaterial({color:region.id==='rift'?'#381914':'#121923',side:T.DoubleSide}),e.x,1.7,e.z-.2);doorway.castShadow=false;
  if(region.id==='swamp')for(const side of [-1,1]){const vine=cylinder(statics,.08,.12,4.8,wood,e.x+side*2.25,2.1,e.z+.6,6);vine.rotation.z=side*.10;}
  if(region.id==='mines')for(const side of [-1,1])box(statics,.12,.025,7,trim,e.x+side*.75,-.005,e.z+3.7);
  if(region.id==='rift')for(const side of [-1,1]){const spike=cylinder(statics,0,.4,2,accent,e.x+side*2.5,4.5,e.z,5);spike.rotation.z=side*.2;}
  if(region.id==='citadel')for(const side of [-1,1])box(statics,.7,1.5,.07,accent,e.x+side*2.4,2.5,e.z+.81);
  // Safe camp is readable without a solid ring blocking its exits.
  for(let i=0;i<28;i++){const a=i*Math.PI/14;if(Math.abs(Math.sin(a))<.45)continue;const s=region.safe;cylinder(statics,.15,.22,.52,trim,s.x+Math.cos(a)*s.r,.26,s.z+Math.sin(a)*s.r,6);}
  for(const side of [-1,1]){const s=region.safe;cylinder(statics,.20,.35,1.35,stone,s.x,.68,s.z+side*3.6,7);const fire=mesh(root,new T.ConeGeometry(.17,.55,6),accent,s.x,1.65,s.z+side*3.6);animated.push(fire);}
  bake(statics);
 }
 return {roots,updateRegion(id:string|null){active=LATE_REGIONS.some(r=>r.id===id)?id as LateRegionId:null;for(const [name,root]of roots)root.visible=name===active;},update(dt:number){time+=dt;if(!active)return;for(const o of animated)if(o.parent===roots.get(active))o.scale.y=1+.1*Math.sin(time*7+o.position.z);},dispose(){for(const root of roots.values()){root.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});root.removeFromParent();}roots.clear();}};
}
function bake(group:T.Group){group.updateMatrixWorld(true);const batches=new Map<T.Material,T.Mesh[]>();group.traverse(o=>{if(o instanceof T.Mesh&&!Array.isArray(o.material)){const list=batches.get(o.material)||[];list.push(o);batches.set(o.material,list);}});for(const [material,objects]of batches){const geometries=objects.map(o=>{const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);return g;}),merged=mergeGeometries(geometries,false);if(merged){mesh(group,merged,material);for(const o of objects){o.removeFromParent();o.geometry.dispose();}}for(const g of geometries)g.dispose();}}
