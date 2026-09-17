import {createCampHouse} from './camp-house.js';
import {CAMP_FIRE,CAMP_FENCES,insideHouse,campSafe} from './camp-layout.js';
import * as T from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';
import {box,cylinder,ellipsoid,joint,mesh,materials} from './models.js';
import {BOUNDS,SPAWNS,CAMERA} from './location.js';
import {OBSTACLES,TREE_POSITIONS} from './terrain.js';
import {AFK_SPOTS as ALL_AFK_SPOTS,forestTrailDistance,withinSpot} from './afk.js';
import {WORLD_CLEARINGS,WORLD_LANDMARKS,roadEdgeDistance,locationAt} from './world-layout.js';
import {surfaceMaterial} from './forms.js';
import {pineGeometry,grassGeometry,fernGeometry,leafGeometry,windMaterial} from './vegetation.js';

export function createEnvironment(scene:T.Scene){
  const AFK_SPOTS=ALL_AFK_SPOTS.filter(spot=>locationAt(spot)==='forest');
  let seed=71493;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  const material=(color:T.ColorRepresentation,roughness=.95)=>new T.MeshStandardMaterial({color,roughness});
  const wood=surfaceMaterial('#574534',{grain:.16,frequency:24}),timber=surfaceMaterial('#3c332a',{grain:.18,frequency:18}),plaster=surfaceMaterial('#aaa18b',{grain:.075,frequency:35}),roofMats=['#3c5058','#496069','#526a70','#3b535b'].map(c=>surfaceMaterial(c,{grain:.07,frequency:26}));
  const rocks=['#60645c','#76776a','#515f59'].map(c=>surfaceMaterial(c,{grain:.15,frequency:22}));
  const breeze={value:0};
  const groundWidth=BOUNDS.maxX-BOUNDS.minX+32,groundDepth=BOUNDS.maxZ-BOUNDS.minZ+32;
  const groundG=new T.PlaneGeometry(groundWidth,groundDepth,200,172);groundG.rotateX(-Math.PI/2);groundG.translate((BOUNDS.minX+BOUNDS.maxX)/2,0,(BOUNDS.minZ+BOUNDS.maxZ)/2);
  const positions=groundG.attributes.position,colors:number[]=[],wear:number[]=[];
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),z=positions.getZ(i),distance=Math.hypot(x+1,z),path=forestTrailDistance(x,z);
    const clearing=Math.max(...SPAWNS.map(s=>Math.exp(-((x-s.x)**2+(z-s.z)**2)/9)));
    const hollow=Math.exp(-((x-12.7)**2+(z+8.2)**2)/70),wallow=Math.exp(-((x-23)**2+(z-9.3)**2)/15);
    const dirt=Math.max(Math.exp(-distance*distance/28),Math.exp(-path*path/3)*.8,clearing*.48);
    const patches=Math.sin(x*.61+Math.sin(z*.32))*Math.cos(z*.73+x*.12);
    const color=new T.Color('#97a28d').lerp(new T.Color('#c7ab83'),dirt*.9);
    color.lerp(new T.Color('#929b91'),hollow*.62).lerp(new T.Color('#ad9575'),wallow*.72);
    for(const field of WORLD_CLEARINGS){const influence=Math.exp(-((x-field.x)**2+(z-field.z)**2)/(field.radius**2*.75));color.lerp(new T.Color(field.tint),influence*.48);}
    color.multiplyScalar(1.05+patches*.11+random()*.04);
    colors.push(color.r,color.g,color.b);wear.push(Math.max(1-T.MathUtils.smoothstep(distance,2.4,4.4),(1-T.MathUtils.smoothstep(roadEdgeDistance(x,z),-1.7,.5))*.88,wallow*.52,hollow*.3));
    if(x<BOUNDS.minX-1||x>BOUNDS.maxX+1||z<BOUNDS.minZ-1||z>BOUNDS.maxZ+1)positions.setY(i,Math.max(0,Math.sin(x*.5)*Math.cos(z*.3))*.8);
  }
  groundG.setAttribute('color',new T.Float32BufferAttribute(colors,3));groundG.setAttribute('pathWear',new T.Float32BufferAttribute(wear,1));groundG.computeVertexNormals();
  const groundMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:1,bumpScale:.032});
  groundMaterial.onBeforeCompile=shader=>{
    shader.vertexShader='attribute float pathWear; varying float vPathWear; varying vec2 vSoilPoint;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvPathWear=pathWear;vSoilPoint=position.xz;');
    shader.fragmentShader='varying float vPathWear; varying vec2 vSoilPoint;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      float soilGrain=fract(sin(dot(floor(vSoilPoint*95.0),vec2(12.9898,78.233)))*43758.5453);
      vec3 wornSoil=vec3(.245,.182,.116)*(.93+.16*soilGrain);
      diffuseColor.rgb=mix(diffuseColor.rgb,wornSoil,vPathWear*.82);
      float passEdge=smoothstep(62.0,75.0,vSoilPoint.x)*exp(-pow((vSoilPoint.y-5.0)/8.0,2.0));
      float snowCover=smoothstep(.15,.9,passEdge+sin(vSoilPoint.x*1.6+vSoilPoint.y*2.1)*.08);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.59,.69,.72)*(.96+.07*soilGrain),snowCover);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','vec3 unwornNormal=normal;\n#include <normal_fragment_maps>\nnormal=normalize(mix(normal,unwornNormal,vPathWear*.85));');
  };
  const ground=mesh(scene,groundG,groundMaterial);ground.castShadow=false;
  const ready=new T.TextureLoader().loadAsync(new URL('./materials/forest-floor-v1.png',import.meta.url).href).then(texture=>{
    texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(groundWidth/5.6,groundDepth/5.6);texture.anisotropy=8;
    groundMaterial.map=texture;groundMaterial.bumpMap=texture;groundMaterial.needsUpdate=true;
  });
  const obstacles=OBSTACLES;
  const fire=joint(scene,CAMP_FIRE.x,0,CAMP_FIRE.z);
  cylinder(fire,.9,.93,.045,material('#282722'),0,.015,0,32);
  for(let i=0;i<11;i++){
    const a=i/11*Math.PI*2;const stone=mesh(fire,new T.DodecahedronGeometry(.27,1),rocks[i%3],Math.cos(a)*.83,.16,Math.sin(a)*.83);stone.scale.set(1,.65,.85);stone.rotation.set(random(),random(),random());
  }
  for(let i=0;i<4;i++){const log=cylinder(fire,.12,.13,1.1,wood,0,.18+i*.04,0);log.rotation.z=Math.PI/2;log.rotation.y=i*.88;}
  const flames:T.Mesh<T.ConeGeometry,T.MeshBasicMaterial>[]=[];
  for(let i=0;i<9;i++){
    const flame=mesh(fire,new T.ConeGeometry(.16+random()*.16,.7+random()*.55,7),new T.MeshBasicMaterial({color:i%2?'#ffbb4d':'#ff7434',transparent:true,opacity:.7,depthWrite:false}), (random()-.5)*.55,.56,(random()-.5)*.55);flame.castShadow=false;flame.userData.dynamic=true;flames.push(flame);
  }
  const fireLight=new T.PointLight('#ffab4e',35,10,2);fireLight.position.set(CAMP_FIRE.x,1.3,CAMP_FIRE.z);scene.add(fireLight);

  for(const [x,z,rot] of [[-4,-.5,0],[-2.1,-2.25,Math.PI/2]]){
    const log=cylinder(scene,.23,.23,1.8,wood,x,.28,z);log.rotation.z=Math.PI/2;log.rotation.y=rot;

  }
  for(const [x,z] of [[-7,-1.8],[-6.4,-2.0]]){
    cylinder(scene,.34,.30,.8,wood,x,.4,z);
    for(const y of [.12,.65]){const band=mesh(scene,new T.TorusGeometry(.32,.035,6,16),materials.dark,x,y,z);band.rotation.x=Math.PI/2;}
  }

  // Low split rails follow the exact safe-town perimeter, with broad road gates.
  for(const fence of CAMP_FENCES){
    const alongX=fence.w!>fence.d!,length=alongX?fence.w!:fence.d!,count=Math.max(1,Math.ceil(length/1.6));
    for(let i=0;i<=count;i++){
      const offset=-length/2+i*length/count;
      const x=fence.x+(alongX?offset:0),z=fence.z+(alongX?0:offset);
      box(scene,.16,.78,.16,timber,x,.39,z);
      if(i===0||i===count){const cap=mesh(scene,new T.ConeGeometry(.14,.11,4),wood,x,.835,z);cap.rotation.y=Math.PI/4;}
    }
    for(const y of [.29,.61]){const rail=box(scene,length,.08,.10,wood,fence.x,y,fence.z);if(!alongX)rail.rotation.y=Math.PI/2;}
  }
  // The first route leaves camp to the east and ends at a ruined watchpost.
  const sign=joint(scene,4.7,0,-.7);cylinder(sign,.07,.09,1.6,wood,0,.8,0);box(sign,1.85,.48,.12,timber,0,1.48,0);
  const signCanvas=document.createElement('canvas');signCanvas.width=512;signCanvas.height=128;const ink=signCanvas.getContext('2d');if(!ink)throw new Error('Canvas 2D is unavailable');ink.fillStyle='#b59a6a';ink.font='bold 38px serif';ink.textAlign='center';ink.fillText('ОПУШКА  →',256,78);
  const signTexture=new T.CanvasTexture(signCanvas);signTexture.colorSpace=T.SRGBColorSpace;
  mesh(sign,new T.PlaneGeometry(1.75,.43),new T.MeshBasicMaterial({map:signTexture,transparent:true}),0,1.48,.067);sign.rotation.y=.55;
  for(const [x,z] of [[22.6,-3.4],[28,-3.4],[28,2.5]]){
    cylinder(scene,.34,.40,.23,rocks[1],x,.115,z);cylinder(scene,.22,.26,1.6+random()*.8,rocks[0],x,.95,z);
  }
  for(const [x,z,w] of [[23,-4.7,2.3],[27,-4.7,2.0],[28.8,.3,.6]]){
    for(let row=0;row<3;row++)for(let col=0;col<Math.ceil(w/.6);col++)box(scene,.57,.31,.52,rocks[(row+col)%3],x-w/2+col*.59,.15+row*.30,z);

  }
  // Broken, earth-filled paving follows the old watchpost footprint. Its centre
  // stays flat: the boss arena has the same physical boundaries as before.
  for(let row=-4;row<=4;row++)for(let col=-4;col<=4;col++){
    const x=25+col*.62,z=-1.2+row*.62;if(Math.hypot(x-25,z+1.2)>2.9||random()<.18)continue;
    const slab=box(scene,.48+random()*.1,.035,.48+random()*.09,rocks[(row+col+9)%3],x,.017,z);
    slab.rotation.y=(random()-.5)*.13;slab.castShadow=false;
  }
  for(const [x,z,r] of [[8.5,-8,.85],[14,10,.9],[18.5,6.5,.65],[20,-10,1.1],[29,8,.8],[10,-11,.6]]){
    const rock=mesh(scene,new T.DodecahedronGeometry(r,1),rocks[0],x,r*.42,z);rock.scale.y=.8;
  }
  // Each hunting ground has a physical waymark and its own ground story. All
  // details use shared materials and join the static batches below.
  const waymarkCanvas=document.createElement('canvas');waymarkCanvas.width=1024;waymarkCanvas.height=128*AFK_SPOTS.length;
  const waymarkInk=waymarkCanvas.getContext('2d');if(!waymarkInk)throw new Error('Canvas 2D is unavailable');
  waymarkInk.fillStyle='#d4c19b';waymarkInk.textAlign='center';waymarkInk.font='bold 70px serif';
  AFK_SPOTS.forEach((spot,i)=>waymarkInk.fillText(spot.name.toUpperCase(),512,86+i*128));
  const waymarkTexture=new T.CanvasTexture(waymarkCanvas);waymarkTexture.colorSpace=T.SRGBColorSpace;
  const waymarkMaterial=new T.MeshBasicMaterial({map:waymarkTexture,transparent:true,depthWrite:false});
  for(const [i,x,z] of [[0,10.2,-1.2],[1,20.2,3.1],[2,-20,-19],[3,40,24.7]]){
    const post=joint(scene,x,0,z);post.rotation.y=CAMERA.azimuth;
    cylinder(post,.055,.085,1.15,wood,0,.575,0,7);
    box(post,2.65,.44,.11,timber,0,1.08,0);
    const faceGeometry=new T.PlaneGeometry(2.55,.40),uv=faceGeometry.attributes.uv;
    for(let j=0;j<uv.count;j++)uv.setY(j,(uv.getY(j)+AFK_SPOTS.length-1-i)/AFK_SPOTS.length);
    mesh(post,faceGeometry,waymarkMaterial,0,1.08,.06);
    for(const side of [-1,1]){
      const foot=mesh(post,new T.DodecahedronGeometry(.17,0),rocks[1],side*.13,.08,0);foot.scale.y=.5;
    }
  }
  // Distant escarpment frames the northern frontier beyond the new boundary.
  for(let i=0;i<9;i++){
    const x=-20+i*2.1,z=BOUNDS.minZ-3-Math.sin(i*.7)*.45,s=1.1+random()*.7;
    const rock=mesh(scene,new T.DodecahedronGeometry(1,1),rocks[i%3],x,.45,z);
    rock.scale.set(s,s*(.65+random()*.5),s*.8);rock.rotation.set(.1,random()*3,.08);
  }
  // Low weathered branches and exposed roots leave the broad fighting circles
  // navigable. The boar clearing is open, churned soil with old logging debris.
  for(const [x,z,length,yaw] of [[26.5,12.4,2.4,.9],[19.7,12.2,1.6,-.6],[15.5,-11.8,1.9,.6]]){
    const log=joint(scene,x,.14,z);log.rotation.y=yaw;
    const trunk=cylinder(log,.12,.18,length,timber,0,0,0,9);trunk.rotation.z=Math.PI/2;
    for(const side of [-1,1]){const end=cylinder(log,.105,.105,.018,wood,side*length/2,0,0,9);end.rotation.z=Math.PI/2;}
    for(let i=0;i<3;i++){const branch=cylinder(log,.018,.04,.48,wood,(i-1)*.55,.07,.16,5);branch.rotation.x=1.0;branch.rotation.z=.4;}
  }
  // Small irregular boundary stones are terrain detail, not a luminous arena ring.
  AFK_SPOTS.forEach((spot,index)=>{
    for(let i=0;i<13;i++){
      const a=i/13*Math.PI*2+.3,r=spot.radius+.35+random()*.45;
      const x=spot.x+Math.cos(a)*r,z=spot.z+Math.sin(a)*r;
      if(forestTrailDistance(x,z)<1.4)continue;
      const stone=mesh(scene,new T.DodecahedronGeometry(.13+random()*.08,0),rocks[(i+index)%3],x,.04,z);
      stone.scale.set(1.5,.4,.9);stone.rotation.y=a;
    }
  });
  // Recognizable landmarks occupy the wider clearings; their solid footprints
  // come from the same layout as terrain.LANDMARK_OBSTACLES.
  for(const landmark of WORLD_LANDMARKS){
    const {x,z,kind}=landmark;
    if(kind==='standing-stones'){
      for(const i of [-1,0,1]){
        const stone=mesh(scene,new T.DodecahedronGeometry(1,0),rocks[i+1],x+i*1.5,1.3+(.3*(i===0?1:0)),z+Math.abs(i)*.5);
        stone.scale.set(.49,1.6+(i===0?.4:0),.47);stone.rotation.y=i*.3;
        for(let mark=0;mark<3;mark++)box(scene,.15,.045,.018,materials.dark,x+i*1.5,1.05+mark*.22,z+Math.abs(i)*.5+.44);
      }
      for(let i=0;i<10;i++){const a=i/10*Math.PI*2,slab=box(scene,.55,.065,.4,rocks[1],x+Math.cos(a)*3,.035,z+Math.sin(a)*2.5);slab.rotation.y=a;slab.castShadow=false;}
    }else if(kind==='fallen-oak'){
      const oak=joint(scene,x,.56,z),trunk=cylinder(oak,.48,.65,5.4,timber,0,0,0,12);trunk.rotation.z=Math.PI/2;
      for(const side of [-1,1]){const cut=cylinder(oak,.45,.45,.025,wood,side*2.71,0,0,12);cut.rotation.z=Math.PI/2;}
      for(let i=0;i<5;i++){const branch=cylinder(oak,.045,.13,1.7,wood,-1.8+i*.75,.55,0,7);branch.rotation.z=(i%2?1:-1)*.6;}
      const stump=cylinder(scene,.8,1.1,.3,timber,x-3.6,.15,z,11);stump.castShadow=false;
    }else if(kind==='arches'){
      for(const side of [-1,1])for(let row=0;row<8;row++)box(scene,.86,.38,1.05,rocks[row%3],x+side*1.8,.2+row*.38,z);
      for(let i=0;i<9;i++){const a=i/8*Math.PI,block=box(scene,.67,.46,1.1,rocks[i%3],x+Math.cos(a)*1.8,3.0+Math.sin(a)*1.4,z);block.rotation.z=a-Math.PI/2;}
      for(let i=0;i<12;i++){const slab=box(scene,.6,.04,.7,rocks[i%3],x+(i%3-1)*.85,.021,z+(Math.floor(i/3)-1.5)*.8);slab.rotation.y=(random()-.5)*.2;slab.castShadow=false;}
    }else{
      for(let row=0;row<3;row++)for(let i=0;i<4-row;i++){
        const log=cylinder(scene,.24,.29,3.2,wood,x,.25+row*.42,z+(i-(3-row)/2)*.5,9);log.rotation.z=Math.PI/2;
        for(const side of [-1,1]){const end=cylinder(scene,.225,.225,.018,timber,x+side*1.61,.25+row*.42,z+(i-(3-row)/2)*.5,9);end.rotation.z=Math.PI/2;}
      }
      for(const side of [-1,1]){const stake=cylinder(scene,.08,.1,1.8,timber,x+side*1.15,.9,z+1.05,7);stake.rotation.z=side*.09;}
    }
  }
  // Spatially chunk instances so the fixed camera rejects distant vegetation.
  // Detail counts grow 2.5× while area grows 7.86×; no per-frame allocations.
  const transforms=new T.Object3D(),treePositions=TREE_POSITIONS;
  const bark=surfaceMaterial('#514737',{grain:.18,frequency:22});
  const forestChunks:T.InstancedMesh[]=[];
  function chunkedInstances(geometry:T.BufferGeometry,mat:T.Material,points:readonly {x:number;z:number}[],apply:(p:{x:number;z:number},i:number,object:T.Object3D)=>void,castShadow=false){
    const chunks=new Map<string,number[]>();
    points.forEach((p,i)=>{const key=`${Math.floor(p.x/18)},${Math.floor(p.z/18)}`;const group=chunks.get(key)??[];group.push(i);chunks.set(key,group);});
    const meshes:T.InstancedMesh[]=[];
    for(const indices of chunks.values()){
      const batch=new T.InstancedMesh(geometry,mat,indices.length);batch.castShadow=castShadow;batch.receiveShadow=true;
      indices.forEach((source,i)=>{transforms.position.set(0,0,0);transforms.rotation.set(0,0,0);transforms.scale.setScalar(1);apply(points[source],source,transforms);transforms.updateMatrix();batch.setMatrixAt(i,transforms.matrix);});
      batch.computeBoundingSphere();scene.add(batch);meshes.push(batch);
    }
    return meshes;
  }
  forestChunks.push(...chunkedInstances(new T.CylinderGeometry(.055,.18,4.2,7),bark,treePositions,(point,i,o)=>{const p=treePositions[i];o.position.set(point.x,2.02*p.s,point.z);o.scale.setScalar(p.s);o.rotation.y=i*.71;},true));
  forestChunks.push(...chunkedInstances(pineGeometry(),windMaterial(breeze,.009),treePositions,(point,i,o)=>{const p=treePositions[i];o.position.set(point.x,0,point.z);o.scale.setScalar(p.s);o.rotation.y=i*.71;},true));
  // Root geometry is limited to older nearby trees; outer forests are instanced.
  treePositions.filter(p=>p.solid&&p.x>-11&&p.x<31&&Math.abs(p.z)<15).forEach((p,i)=>{
    for(let j=0;j<3;j++){const a=j*Math.PI*2/3+i,root=cylinder(scene,.045,.07,.6*p.s,bark,p.x+Math.sin(a)*.18,.13,p.z+Math.cos(a)*.18,5);root.rotation.set(Math.cos(a)*.9,0,Math.sin(a)*-.9);}
  });
  const detailPoints=Array.from({length:5000},()=>({x:BOUNDS.minX+random()*(BOUNDS.maxX-BOUNDS.minX),z:BOUNDS.minZ+random()*(BOUNDS.maxZ-BOUNDS.minZ),scale:.45+random()*.65,yaw:random()*Math.PI*2}));
  const grassMaterial=windMaterial(breeze,.055),fernMaterial=windMaterial(breeze,.035);
  chunkedInstances(grassGeometry(),grassMaterial,detailPoints,(p,i,o)=>{
    const d=detailPoints[i],inSpot=AFK_SPOTS.some(spot=>withinSpot(p,spot,.5)),noise=Math.sin(p.x*1.7+Math.cos(p.z))*Math.sin(p.z*2.3);
    const s=insideHouse(p,.4)||roadEdgeDistance(p.x,p.z)<.3||Math.hypot(p.x+1,p.z)<3.3?0:d.scale*(noise>-.1?1:.28)*(inSpot?.22:1);
    o.position.set(p.x,.01,p.z);o.scale.setScalar(s);o.rotation.y=d.yaw;
  });
  chunkedInstances(fernGeometry(),fernMaterial,detailPoints.slice(0,520),(p,i,o)=>{
    const s=campSafe(p)||roadEdgeDistance(p.x,p.z)<1.1||AFK_SPOTS.some(spot=>withinSpot(p,spot,.8))||Math.hypot(p.x+1,p.z)<4.5?0:detailPoints[i].scale;
    o.position.set(p.x,.02,p.z);o.scale.setScalar(s);o.rotation.y=detailPoints[i].yaw;
  });
  chunkedInstances(leafGeometry(),new T.MeshStandardMaterial({color:'#89704b',roughness:1,side:T.DoubleSide}),detailPoints.slice(0,1000),(p,i,o)=>{o.position.set(p.x,.018,p.z);o.scale.setScalar(insideHouse(p,.4)?0:detailPoints[i].scale);o.rotation.y=detailPoints[i].yaw;});
  chunkedInstances(new T.DodecahedronGeometry(1,0),rocks[0],detailPoints.slice(0,460),(p,i,o)=>{const s=insideHouse(p,.4)?0:.06+detailPoints[i].scale*.15;o.position.set(p.x,s*.32,p.z);o.scale.set(s,s*.55,s*.8);o.rotation.set(i,detailPoints[i].yaw,i*.3);});
  // Campside details frame the route while keeping the centre clear for combat.
  for(const [x,z] of [[-3.6,2.5],[2.2,-3.6],[5.7,-3.3],[7.5,4.7]]){
    const rock=mesh(scene,new T.DodecahedronGeometry(.35,0),rocks[2],x,.11,z);rock.scale.set(1.4,.5,1);rock.rotation.y=x;
    for(let i=0;i<3;i++){const fern=mesh(scene,fernGeometry(),fernMaterial,x+(random()-.5)*.7,.025,z+(random()-.5)*.7);fern.rotation.y=random()*6;fern.scale.setScalar(.75);fern.castShadow=false;}
  }
  // Eastern mountain passage: snow appears along the open road, not as a magic portal.
  const passSnow=material('#bdcdd1');
  for(const side of [-1,1])for(let i=0;i<4;i++){
    const cliff=mesh(scene,new T.DodecahedronGeometry(1,0),rocks[i%3],73+i*2,1.2,5+side*(5+i));cliff.scale.set(2.2,2+i*.3,1.8);
    const cap=mesh(scene,new T.DodecahedronGeometry(1,0),passSnow,73+i*2,2.8+i*.3,5+side*(5+i));cap.scale.set(2.1,.45,1.7);
  }
  const marker=mesh(scene,new T.RingGeometry(.18,.21,40),new T.MeshBasicMaterial({color:'#d5bb80',transparent:true,opacity:.8,side:T.DoubleSide}));marker.rotation.x=-Math.PI/2;marker.position.y=.025;marker.visible=false;marker.userData.dynamic=true;
  // Bake static scenery per material. Hundreds of slate tiles and beams become
  // a few draw calls; the fire, instanced forest and animated actors stay separate.
  scene.updateMatrixWorld(true);const batches=new Map<string,{material:T.Material;castShadow:boolean;receiveShadow:boolean;geometries:T.BufferGeometry[];objects:T.Mesh[]}>();
  scene.traverse(object=>{
    if(!(object instanceof T.Mesh)||object instanceof T.InstancedMesh||Array.isArray(object.material)||object.userData.dynamic||object===ground)return;
    const key=`${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`;let batch=batches.get(key);if(!batch){batch={material:object.material,castShadow:object.castShadow,receiveShadow:object.receiveShadow,geometries:[],objects:[]};batches.set(key,batch);}
    const g=object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone();g.applyMatrix4(object.matrixWorld);batch.geometries.push(g);batch.objects.push(object);
  });
  for(const batch of batches.values()){
    const combined=mergeGeometries(batch.geometries,false);if(!combined)continue;
    const baked=mesh(scene,combined,batch.material);baked.castShadow=batch.castShadow;baked.receiveShadow=batch.receiveShadow;
    for(const object of batch.objects){object.removeFromParent();object.geometry.dispose();}for(const g of batch.geometries)g.dispose();
  }
  const campHouse=createCampHouse(scene);
  function animate(time:number){breeze.value=time;flames.forEach((flame,i)=>{flame.scale.set(.8+Math.sin(time*9+i)*.2,.85+Math.sin(time*11+i*4)*.25,.9+Math.sin(time*8+i)*.15);flame.rotation.z=Math.sin(time*5+i)*.15;});fireLight.intensity=32+Math.sin(time*12)*3+Math.sin(time*19)*2;}
  return {ground,obstacles,animate,marker,ready,campHouse,setTreesVisible:(visible:boolean)=>{forestChunks.forEach(chunk=>{chunk.visible=visible;});}};
}
