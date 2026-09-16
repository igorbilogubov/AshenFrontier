import * as T from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';
import {mesh,box,cylinder,joint} from './models.js';
import {pineGeometry} from './vegetation.js';
import {SNOW_BOUNDS,SNOW_ENTRY,SNOW_SPOTS,SNOW_ROADS,SNOW_LANDMARKS,SNOW_PASSAGES,SNOW_TREES} from './snow.js';

/** All solid inland scenery follows snow.ts. Ice and wind marks remain walkable. */
export function createSnowEnvironment(scene:T.Scene){
  const root=new T.Group();root.name='snow-region';scene.add(root);root.visible=false;
  const snow=new T.MeshStandardMaterial({color:'#d1e1e2',roughness:.96});
  const rock=new T.MeshStandardMaterial({color:'#647e8c',roughness:.9});
  const dark=new T.MeshStandardMaterial({color:'#344e5b',roughness:.85});
  const ice=new T.MeshStandardMaterial({color:'#81b0c3',roughness:.36,metalness:.12});
  const wood=new T.MeshStandardMaterial({color:'#675749',roughness:1});
  const groundG=new T.PlaneGeometry(210,195,160,148);groundG.rotateX(-Math.PI/2);groundG.translate(350,-.04,2.5);
  const colors:number[]=[],position=groundG.attributes.position;
  function trailDistance(x:number,z:number){let nearest=Infinity;for(const road of SNOW_ROADS)for(let i=1;i<road.points.length;i++){
    const a=road.points[i-1],b=road.points[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
    nearest=Math.min(nearest,Math.hypot(x-a.x-t*dx,z-a.z-t*dz)-road.width*.5);
  }return nearest;}
  for(let i=0;i<position.count;i++){
    const x=position.getX(i),z=position.getZ(i),trail=1-T.MathUtils.smoothstep(trailDistance(x,z),-.9,1.7);
    const wind=Math.sin(x*.18+z*.39+Math.sin(z*.13)*2)*.03;
    const color=new T.Color('#b7d1dc').lerp(new T.Color('#628ca3'),trail*.78).multiplyScalar(.95+wind);
    colors.push(color.r,color.g,color.b);
    // Inside playable bounds terrain stays level, matching server movement.
    if(x<SNOW_BOUNDS.minX||x>SNOW_BOUNDS.maxX||z<SNOW_BOUNDS.minZ||z>SNOW_BOUNDS.maxZ)position.setY(i,.12+Math.sin(x*.12+z*.08)**2*.8);
  }
  groundG.setAttribute('color',new T.Float32BufferAttribute(colors,3));groundG.computeVertexNormals();
  const groundMat=new T.MeshStandardMaterial({vertexColors:true,roughness:1});
  groundMat.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 snowPoint;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nsnowPoint=position;');
    shader.fragmentShader='varying vec3 snowPoint;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat ripple=sin(snowPoint.x*2.8+snowPoint.z*5.6+sin(snowPoint.z*.7)*1.3);float drift=sin(snowPoint.x*.31+sin(snowPoint.z*.17)*2.7)*sin(snowPoint.z*.23-snowPoint.x*.12);float grain=fract(sin(dot(floor(snowPoint.xz*36.0),vec2(12.9898,78.233)))*43758.5453);float icePatch=smoothstep(.35,.85,drift);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.31,.48,.59),icePatch*.27);diffuseColor.rgb*=.91+.065*ripple+.05*grain;');
  };
  const ground=mesh(root,groundG,groundMat);ground.castShadow=false;
  const staticRoot=new T.Group();root.add(staticRoot);
  // Frozen shallow lake is traversable, with flat shore shelves (no invisible collision).
  const lake=mesh(staticRoot,new T.CircleGeometry(9.5,64),ice,367,.003,39);lake.rotation.x=-Math.PI/2;lake.scale.set(1.6,.8,1);lake.castShadow=false;
  const lineMat=new T.MeshBasicMaterial({color:'#b8d6dd',transparent:true,opacity:.4,depthWrite:false});
  for(let i=0;i<12;i++){
    const fissure=box(staticRoot,.025,.003,2.2+i%4,lineMat,355+i*1.9,.009,38+Math.sin(i)*3.6);fissure.rotation.y=i*.91;fissure.castShadow=false;
  }
  // Boundary ridges remain completely outside the walkable rectangle, entrance left open.
  for(let side=0;side<4;side++)for(let i=0;i<24;i++){
    const x=side<2?SNOW_BOUNDS.minX+i*8:side===2?SNOW_BOUNDS.minX-5:SNOW_BOUNDS.maxX+5;
    const z=side<2?(side===0?SNOW_BOUNDS.minZ-5:SNOW_BOUNDS.maxZ+5):SNOW_BOUNDS.minZ+i*7;
    if(side===2&&Math.abs(z-SNOW_ENTRY.z)<10)continue;
    const cliff=mesh(staticRoot,new T.DodecahedronGeometry(1,0),i%3?rock:dark,x,1.7,z);cliff.scale.set(3.5,2.3+i%4,3);cliff.rotation.y=i*.91;
    const cap=mesh(staticRoot,new T.DodecahedronGeometry(1,0),snow,x,3.4+i%4*.8,z);cap.scale.set(3.6,.55,3.1);cap.rotation.y=i*.91;
  }
  for(const landmark of SNOW_LANDMARKS){
    const group=joint(staticRoot,landmark.x,0,landmark.z);
    if(landmark.kind==='ruins'){
      box(group,6,2.3,2,dark,0,1.15,0);box(group,6.1,.18,2.1,snow,0,2.36,0);
      for(const x of [-2.35,-.8,.8,2.35]){box(group,.5,3.7,1.65,rock,x,1.85,0);box(group,.6,.22,1.8,snow,x,3.78,0);}
    }else if(landmark.kind==='obelisk'){
      cylinder(group,1.6,2.1,.6,rock,0,.3,0,6);const obelisk=cylinder(group,.55,1.1,6,dark,0,3.2,0,5);obelisk.rotation.y=.4;
      cylinder(group,.6,.62,.12,ice,0,5.6,0,5);cylinder(group,.7,1.15,.16,snow,0,.66,0,6);
    }else for(let i=0;i<7;i++){const a=i*2.399,r=i?1.5:0,crystal=cylinder(group,.03,.4,2+i%3,ice,Math.sin(a)*r,1+i%3*.5,Math.cos(a)*r,5);crystal.rotation.z=Math.sin(a)*.14;}
  }
  const entry=joint(staticRoot,266,0,8);
  // Arrival refuge: two low stone braziers flank the open path, without blocking it.
  for(const z of [-4,4]){cylinder(entry,.42,.58,.45,rock,2,.225,z,8);cylinder(entry,.46,.32,.3,dark,2,.6,z,8);}
  // Low pebbles are walkable dressing, batched with the existing stone material.
  // Keep spawn clearings and roads readable; no tall collision-like scenery here.
  for(let i=0;i<340;i++){
    const x=263+((i*47.173)%173),z=-77+((i*71.719)%159);
    if(trailDistance(x,z)<3||SNOW_SPOTS.some(p=>Math.hypot(x-p.x,z-p.z)<p.radius+5))continue;
    const pebble=mesh(staticRoot,new T.DodecahedronGeometry(1,0),rock,x,.055,z);
    pebble.scale.set(.12+i%3*.05,.065,.1+i%4*.035);pebble.rotation.y=i;pebble.castShadow=false;
  }
  bake(staticRoot);
  const flameMat=new T.MeshBasicMaterial({color:'#ffc783',transparent:true,opacity:.85,depthWrite:false});
  const flames=[-4,4].map(z=>{const f=mesh(root,new T.ConeGeometry(.22,.7,6),flameMat,268,1,8+z);f.castShadow=false;return f;});
  const pine=pineGeometry();const pc=pine.attributes.color;
  for(let i=0;i<pc.count;i++){const y=pine.attributes.position.getY(i),c=new T.Color('#bed4d8').lerp(new T.Color('#3f666c'),y<1.15?.4:(i%9<6?.15:.63));pc.setXYZ(i,c.r,c.g,c.b);}
  const foliage=new T.MeshStandardMaterial({vertexColors:true,roughness:1,side:T.DoubleSide});
  const trunks=new T.CylinderGeometry(.065,.22,4.2,7);trunks.translate(0,2.1,0);
  const chunks=new Map<string,typeof SNOW_TREES[number][]>();for(const p of SNOW_TREES){const key=`${Math.floor(p.x/24)},${Math.floor(p.z/24)}`;const points=chunks.get(key)||[];points.push(p);chunks.set(key,points);}
  const transform=new T.Object3D(),treeChunks:T.Group[]=[];
  for(const points of chunks.values()){
    const group=new T.Group();root.add(group);treeChunks.push(group);group.userData.center={x:points.reduce((s,p)=>s+p.x,0)/points.length,z:points.reduce((s,p)=>s+p.z,0)/points.length};
    for(const [geometry,material] of [[pine,foliage],[trunks,wood]] as const){const batch=new T.InstancedMesh(geometry,material,points.length);batch.castShadow=true;batch.receiveShadow=true;
      points.forEach((p,i)=>{transform.position.set(p.x,0,p.z);transform.rotation.y=p.x*.7+p.z;transform.scale.setScalar(.9+Math.abs(Math.sin(p.x*8+p.z))* .35);transform.updateMatrix();batch.setMatrixAt(i,transform.matrix);});batch.computeBoundingSphere();group.add(batch);}
  }
  const snowPositions=new Float32Array(240*3),particleG=new T.BufferGeometry();particleG.setAttribute('position',new T.BufferAttribute(snowPositions,3));
  const particles=new T.Points(particleG,new T.PointsMaterial({color:'#e8f5fc',size:.045,transparent:true,opacity:.55,depthWrite:false}));particles.frustumCulled=false;root.add(particles);
  const passages=SNOW_PASSAGES.map(p=>{const object=new T.Group();object.position.set(p.x,0,p.z);object.userData.portalId=p.id;scene.add(object);return {portal:p,object};});
  return {root,ground,passages,animate(time:number,hero:{x:number;z:number},active:boolean){
    root.visible=active;if(!active)return;
    for(const chunk of treeChunks){const c=chunk.userData.center as {x:number;z:number};chunk.visible=Math.hypot(c.x-hero.x,c.z-hero.z)<65;}
    for(let i=0;i<240;i++){snowPositions[i*3]=hero.x+((i*7.197+time*.7)%32)-16;snowPositions[i*3+1]=8-((i*.173+time*.65)%8);snowPositions[i*3+2]=hero.z+((i*11.373+time*.2)%28)-14;}
    particleG.attributes.position.needsUpdate=true;flames.forEach((f,i)=>{f.scale.y=1+Math.sin(time*9+i)*.15;});
  }};
}
function bake(group:T.Group){
  group.updateMatrixWorld(true);const batches=new Map<T.Material,T.Mesh[]>();group.traverse(o=>{if(o instanceof T.Mesh&&!Array.isArray(o.material)){const a=batches.get(o.material)||[];a.push(o);batches.set(o.material,a);}});
  for(const [material,objects] of batches){const geometries=objects.map(o=>{const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);return g;});const combined=mergeGeometries(geometries,false);if(combined){mesh(group,combined,material);for(const o of objects){o.removeFromParent();o.geometry.dispose();}}geometries.forEach(g=>g.dispose());}
}
