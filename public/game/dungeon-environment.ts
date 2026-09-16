import * as T from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';
import {mesh,box,cylinder} from './models.js';
import {surfaceMaterial} from './forms.js';
import {DUNGEONS,DUNGEON_PASSAGES} from './dungeons.js';
import {LATE_PASSAGES} from './late-world.js';
import type {Portal} from './stadium.js';
/** Open-roof cutaway rooms keep the fixed camera and every warning readable. */
export function createDungeonEnvironment(scene:T.Scene){
 const roots=new Map<string,T.Group>(),seals=new Map<string,T.Mesh<T.RingGeometry,T.MeshBasicMaterial>>();
 for(const d of DUNGEONS){
  const root=new T.Group();root.name=d.id;root.visible=false;scene.add(root);roots.set(d.id,root);
  const stone=surfaceMaterial(d.floor,{grain:.12,frequency:24}),trim=surfaceMaterial(new T.Color(d.floor).lerp(new T.Color('#bbb7a0'),.3).getStyle(),{grain:.1,frequency:30});
  const accent=new T.MeshStandardMaterial({color:d.color,emissive:d.color,emissiveIntensity:.35,metalness:.45,roughness:.4});
  const ground=box(root,110,.18,52,stone,d.bounds.minX+55,-.11,0);ground.castShadow=false;
  const geometry=new T.Group();root.add(geometry);
  for(const w of d.walls){
   if(w.w!==undefined&&w.d!==undefined){const height=w.z>10?.75:1.75;box(geometry,w.w,height,w.d,stone,w.x,height/2,w.z);box(geometry,w.w+.1,.1,w.d+.1,trim,w.x,height+.04,w.z);}
   else{cylinder(geometry,.65,.8,2.6,stone,w.x,1.3,w.z,8);cylinder(geometry,.88,.88,.18,trim,w.x,2.6,w.z,8);cylinder(geometry,.20,.28,.5,accent,w.x,3,w.z,6);}
  }
  for(let row=0;row<11;row++)for(let col=0;col<21;col++){
   if((row+col)%3===0)continue;const p=box(geometry,4.4,.035,4.35,trim,d.bounds.minX+3+col*5,.001,-23+row*4.5);p.castShadow=false;
  }
  for(const dx of [20,44,68,84]){for(const side of [-1,1]){box(geometry,1.3,2.2,1.2,trim,d.bounds.minX+dx,1.1,side*4.2);box(geometry,.36,.65,.06,accent,d.bounds.minX+dx+.68,1.45,side*4.2);}}
  for(const [room,dx] of [30,54,76,96].entries()){
   const x=d.bounds.minX+dx;
   const ring=mesh(geometry,new T.RingGeometry(room===3?10:6,room===3?10.18:6.08,64),trim,x,.045,0);ring.rotation.x=-Math.PI/2;ring.castShadow=false;
   for(const side of [-1,1])for(let n=0;n<4;n++){
    const px=x-7+n*4,pz=side*21;
    if(d.region==='forest'||d.region==='swamp'){const rootwood=cylinder(geometry,.03,.22,3.8,stone,px,.9,pz,6);rootwood.rotation.z=side*.75;mesh(geometry,new T.IcosahedronGeometry(.3,0),accent,px+1.2,.45,pz);}
    else if(d.region==='snow'||d.region==='mines'){const crystal=cylinder(geometry,0,.42,1.6+n*.25,accent,px,1,pz,5);crystal.rotation.z=side*.22;}
    else if(d.region==='wasteland'){box(geometry,1.7,.7,3.5,stone,px,.35,pz);box(geometry,1.85,.2,3.6,trim,px,.8,pz);}
    else if(d.region==='rift'){const crack=box(geometry,.18,.025,5,accent,px,.055,pz);crack.rotation.y=n*.3;}
    else{box(geometry,1.5,.55,1.5,stone,px,.275,pz);cylinder(geometry,.18,.35,2.4,trim,px,1.3,pz,6);mesh(geometry,new T.OctahedronGeometry(.5),accent,px,2.7,pz);}
   }
  }
  bake(geometry);
  const seal=mesh(root,new T.RingGeometry(2.4,2.55,64),new T.MeshBasicMaterial({color:d.color,transparent:true,opacity:.7,side:T.DoubleSide,depthWrite:false}),d.boss.x,.09,d.boss.z);seal.rotation.x=-Math.PI/2;seal.castShadow=false;seals.set(d.id,seal);
 }
 const portals:{portal:Portal;object:T.Group}[]=[];
 for(const portal of [...LATE_PASSAGES,...DUNGEON_PASSAGES]){
  const root=new T.Group();scene.add(root);root.position.set(portal.x,0,portal.z);root.name=portal.id;
  const d=DUNGEONS.find(d=>portal.id.includes(d.id)),color=d?.color??'#b6c6a1';
  const mat=new T.MeshStandardMaterial({color:'#555950',roughness:.85}),glow=new T.MeshBasicMaterial({color,transparent:true,opacity:.55,side:T.DoubleSide,depthWrite:false});
  for(const side of [-1,1]){box(root,.42,2,.6,mat,side*1.4,1,0);mesh(root,new T.OctahedronGeometry(.18),glow,side*1.4,2.25,0);}
  const ring=mesh(root,new T.RingGeometry(1.05,1.22,48),glow,0,.055,0);ring.rotation.x=-Math.PI/2;ring.castShadow=false;
  portals.push({portal,object:root});
 }
 return {portals,update(region:string,time:number,guards=0){for(const [id,root]of roots)root.visible=id===region;const seal=seals.get(region);if(seal){seal.visible=guards>0;seal.rotation.z=time*.2;seal.material.opacity=.45+.15*Math.sin(time*2);}}};
}
function bake(root:T.Group){root.updateMatrixWorld(true);const batches=new Map<T.Material,T.Mesh[]>();root.traverse(o=>{if(o instanceof T.Mesh&&!Array.isArray(o.material)){const batch=batches.get(o.material)??[];batch.push(o);batches.set(o.material,batch);}});for(const [material,objects]of batches){const pieces=objects.map(o=>{const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);return g;});const merged=mergeGeometries(pieces,false);if(merged){mesh(root,merged,material);for(const o of objects){o.removeFromParent();o.geometry.dispose();}}for(const p of pieces)p.dispose();}}
