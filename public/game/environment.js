import * as T from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';
import {box,cylinder,ellipsoid,joint,mesh,materials} from './models.js';
import {BOUNDS,SPAWNS,CAMERA} from './location.js';
import {OBSTACLES,TREE_POSITIONS} from './terrain.js';
import {surfaceMaterial} from './forms.js';
import {pineGeometry,grassGeometry,fernGeometry,leafGeometry,windMaterial} from './vegetation.js';

export function createEnvironment(scene){
  let seed=71493;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  const material=(color,roughness=.95)=>new T.MeshStandardMaterial({color,roughness});
  const wood=surfaceMaterial('#574534',{grain:.16,frequency:24}),timber=surfaceMaterial('#3c332a',{grain:.18,frequency:18}),plaster=surfaceMaterial('#aaa18b',{grain:.075,frequency:35}),roofMats=['#3c5058','#496069','#526a70','#3b535b'].map(c=>surfaceMaterial(c,{grain:.07,frequency:26}));
  const rocks=['#60645c','#76776a','#515f59'].map(c=>surfaceMaterial(c,{grain:.15,frequency:22}));
  const breeze={value:0};
  const groundG=new T.PlaneGeometry(100,70,160,112);groundG.rotateX(-Math.PI/2);groundG.translate(10,0,0);
  const positions=groundG.attributes.position,colors=[],wear=[];
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),z=positions.getZ(i),distance=Math.hypot(x+1,z),path=Math.abs(z-1-Math.sin(x*.25)*.9);
    const clearing=Math.max(...SPAWNS.map(s=>Math.exp(-((x-s.x)**2+(z-s.z)**2)/9)));
    const dirt=Math.max(Math.exp(-distance*distance/28),Math.exp(-path*path/3)*.8,clearing*.48);
    const patches=Math.sin(x*.61+Math.sin(z*.32))*Math.cos(z*.73+x*.12);
    const color=new T.Color('#a3b7a1').lerp(new T.Color('#e0c6a0'),dirt*.9);
    color.multiplyScalar(1.05+patches*.11+random()*.04);
    colors.push(color.r,color.g,color.b);wear.push(Math.max(1-T.MathUtils.smoothstep(distance,2.4,4.4),(1-T.MathUtils.smoothstep(path,.35,2.0))*.88));
    if(x<BOUNDS.minX-1||x>BOUNDS.maxX+1||Math.abs(z)>16)positions.setY(i,Math.max(0,Math.sin(x*.5)*Math.cos(z*.3))*.8);
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
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','vec3 unwornNormal=normal;\n#include <normal_fragment_maps>\nnormal=normalize(mix(normal,unwornNormal,vPathWear*.85));');
  };
  const ground=mesh(scene,groundG,groundMaterial);ground.castShadow=false;
  const ready=new T.TextureLoader().loadAsync(new URL('./materials/forest-floor-v1.png',import.meta.url).href).then(texture=>{
    texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(100/5.6,70/5.6);texture.anisotropy=8;
    groundMaterial.map=texture;groundMaterial.bumpMap=texture;groundMaterial.needsUpdate=true;
  });
  const obstacles=OBSTACLES;
  const house=joint(scene,-5,0,-4.6);
  box(house,5,.32,4.2,rocks[0],0,.16,0);
  box(house,4.65,2.6,3.8,plaster,0,1.55,0);
  for(const x of [-2.32,0,2.32])box(house,.20,2.8,.24,timber,x,1.65,1.94);
  for(const z of [-1.9,0,1.9])box(house,.24,2.8,.20,timber,2.36,1.65,z);
  for(const y of [.5,2.3,2.83]){box(house,4.9,.16,4.0,timber,0,y,0);}
  // Roof is a pair of actual pitched surfaces with overlapping slate tiles.
  const pitch=.57;
  for(const side of [-1,1]){
    const roof=joint(house,0,3.30,side*1.08);roof.rotation.x=side*pitch;
    box(roof,5.5,.14,2.7,roofMats[0]);
    for(let row=0;row<5;row++)for(let col=0;col<12;col++){
      const tile=box(roof,.46,.08,.59,roofMats[Math.floor(random()*roofMats.length)],-2.5+col*.455+(row%2)*.12,.12+row*.008,-1.08+row*.51);
      tile.rotation.y=(random()-.5)*.025;
    }
  }
  // Gables close the triangular space beneath the ridge.
  const tri=new T.Shape();tri.moveTo(-1.95,0);tri.lineTo(0,1.25);tri.lineTo(1.95,0);tri.closePath();
  for(const x of [-2.32,2.32]){const g=mesh(house,new T.ShapeGeometry(tri),plaster,x,2.82,0);g.rotation.y=Math.PI/2;g.material=plaster.clone();g.material.side=T.DoubleSide;}
  box(house,.92,1.85,.12,wood,-.65,1.24,1.97);
  for(let i=0;i<6;i++)box(house,.022,1.74,.014,timber,-1.03+i*.15,1.24,2.04);
  for(const y of [.65,1.8])box(house,.85,.08,.04,materials.dark,-.65,y,2.06);
  ellipsoid(house,-.31,1.25,2.07,.037,.037,.037,materials.gold);
  for(const x of [-1.7,1.12]){
    const glowMat=new T.MeshStandardMaterial({color:'#e9aa51',emissive:'#e9a042',emissiveIntensity:1.1});
    box(house,.64,.75,.06,glowMat,x,1.82,1.97);
    box(house,.74,.075,.10,timber,x,2.24,2.03);box(house,.74,.075,.10,timber,x,1.40,2.03);
    box(house,.045,.78,.12,timber,x,1.82,2.04);box(house,.68,.055,.12,timber,x,1.83,2.04);
  }
  for(let i=0;i<3;i++)box(house,1.55,.14*(i+1),.45,rocks[1],-.65,.07*(i+1),3.02-i*.4);
  for(let row=0;row<5;row++)for(let col=0;col<3;col++)box(house,.39,.23,.65,rocks[(col+row)%3],1.25+col*.37,3.2+row*.22,-.3);

  const fire=joint(scene,-2.3,0,-.6);
  cylinder(fire,.9,.93,.045,material('#282722'),0,.015,0,32);
  for(let i=0;i<11;i++){
    const a=i/11*Math.PI*2;const stone=mesh(fire,new T.DodecahedronGeometry(.27,1),rocks[i%3],Math.cos(a)*.83,.16,Math.sin(a)*.83);stone.scale.set(1,.65,.85);stone.rotation.set(random(),random(),random());
  }
  for(let i=0;i<4;i++){const log=cylinder(fire,.12,.13,1.1,wood,0,.18+i*.04,0);log.rotation.z=Math.PI/2;log.rotation.y=i*.88;}
  const flames=[];
  for(let i=0;i<9;i++){
    const flame=mesh(fire,new T.ConeGeometry(.16+random()*.16,.7+random()*.55,7),new T.MeshBasicMaterial({color:i%2?'#ffbb4d':'#ff7434',transparent:true,opacity:.7,depthWrite:false}), (random()-.5)*.55,.56,(random()-.5)*.55);flame.castShadow=false;flame.userData.dynamic=true;flames.push(flame);
  }
  const fireLight=new T.PointLight('#ffab4e',35,10,2);fireLight.position.set(-2.3,1.3,-.6);scene.add(fireLight);

  for(const [x,z,rot] of [[-4,-.5,0],[-2.1,-2.25,Math.PI/2]]){
    const log=cylinder(scene,.23,.23,1.8,wood,x,.28,z);log.rotation.z=Math.PI/2;log.rotation.y=rot;

  }
  const chest=joint(scene,-.4,0,-4.2);
  box(chest,1.13,.6,.7,wood,0,.3,0);const lid=cylinder(chest,.36,.36,1.13,wood,0,.6,0);lid.rotation.z=Math.PI/2;lid.scale.z=1.02;
  for(const x of [-.4,.4])box(chest,.07,.77,.73,materials.dark,x,.39,0);
  box(chest,.16,.22,.06,materials.gold,0,.5,.38);
  for(const [x,z] of [[-7,-1.8],[-6.4,-2.0]]){
    cylinder(scene,.34,.30,.8,wood,x,.4,z);
    for(const y of [.12,.65]){const band=mesh(scene,new T.TorusGeometry(.32,.035,6,16),materials.dark,x,y,z);band.rotation.x=Math.PI/2;}
  }

  // The first route leaves camp to the east and ends at a ruined watchpost.
  const sign=joint(scene,4.7,0,-.7);cylinder(sign,.07,.09,1.6,wood,0,.8,0);box(sign,1.85,.48,.12,timber,0,1.48,0);
  const signCanvas=document.createElement('canvas');signCanvas.width=512;signCanvas.height=128;const ink=signCanvas.getContext('2d');ink.fillStyle='#b59a6a';ink.font='bold 38px serif';ink.textAlign='center';ink.fillText('ОПУШКА  →',256,78);
  const signTexture=new T.CanvasTexture(signCanvas);signTexture.colorSpace=T.SRGBColorSpace;
  mesh(sign,new T.PlaneGeometry(1.75,.43),new T.MeshBasicMaterial({map:signTexture,transparent:true}),0,1.48,.067);sign.rotation.y=.55;
  for(const [x,z] of [[22.6,-3.4],[28,-3.4],[28,2.5]]){
    cylinder(scene,.34,.40,.23,rocks[1],x,.115,z);cylinder(scene,.22,.26,1.6+random()*.8,rocks[0],x,.95,z);
  }
  for(const [x,z,w] of [[23,-4.7,2.3],[27,-4.7,2.0],[28.8,.3,.6]]){
    for(let row=0;row<3;row++)for(let col=0;col<Math.ceil(w/.6);col++)box(scene,.57,.31,.52,rocks[(row+col)%3],x-w/2+col*.59,.15+row*.30,z);

  }
  const ruinsFloor=mesh(scene,new T.CircleGeometry(3.0,28),material('#606054'),25,.012,-1.2);ruinsFloor.rotation.x=-Math.PI/2;ruinsFloor.castShadow=false;
  for(const [x,z,r] of [[8.5,-8,.85],[14,10,.9],[18.5,6.5,.65],[20,-10,1.1],[29,8,.8],[10,-11,.6]]){
    const rock=mesh(scene,new T.DodecahedronGeometry(r,1),rocks[0],x,r*.42,z);rock.scale.y=.8;
  }
  // Instanced forest and undergrowth keep the prototype small and inexpensive to draw.
  const transforms=new T.Object3D(),treePositions=TREE_POSITIONS;
  const bark=surfaceMaterial('#514737',{grain:.18,frequency:22});
  const trunks=new T.InstancedMesh(new T.CylinderGeometry(.055,.18,4.2,9),bark,treePositions.length);scene.add(trunks);trunks.castShadow=true;trunks.receiveShadow=true;
  const foliage=new T.InstancedMesh(pineGeometry(),windMaterial(breeze,.009),treePositions.length);scene.add(foliage);foliage.castShadow=true;foliage.receiveShadow=true;
  treePositions.forEach((p,i)=>{
    transforms.position.set(p.x,2.02*p.s,p.z);transforms.scale.set(p.s,p.s,p.s);transforms.rotation.set(0,i*.71,0);transforms.updateMatrix();trunks.setMatrixAt(i,transforms.matrix);
    transforms.position.y=0;transforms.updateMatrix();foliage.setMatrixAt(i,transforms.matrix);foliage.setColorAt(i,new T.Color().setHSL(.34,.08,.76+(i%4)*.045));
    // The visible roots anchor trunks in the moss without closing the walking lane.
    for(let j=0;j<4;j++){const a=j*Math.PI/2+i,root=cylinder(scene,.045,.07,.6*p.s,bark,p.x+Math.sin(a)*.18,.13,p.z+Math.cos(a)*.18,6);root.rotation.set(Math.cos(a)*.9,0,Math.sin(a)*-.9);}
  });
  const stones=new T.InstancedMesh(new T.DodecahedronGeometry(1,0),rocks[0],230);scene.add(stones);stones.castShadow=true;stones.receiveShadow=true;
  for(let i=0;i<230;i++){
    const x=-10+random()*40,z=(random()-.5)*28,s=.06+random()*.17;
    transforms.position.set(x,s*.32,z);transforms.scale.set(s,s*.55,s*.8);transforms.rotation.set(random(),random(),random());transforms.updateMatrix();stones.setMatrixAt(i,transforms.matrix);
  }
  const grass=new T.InstancedMesh(grassGeometry(),windMaterial(breeze,.055),2000);scene.add(grass);grass.receiveShadow=true;
  const ferns=new T.InstancedMesh(fernGeometry(),windMaterial(breeze,.035),260);scene.add(ferns);ferns.receiveShadow=true;
  const leaves=new T.InstancedMesh(leafGeometry(),new T.MeshStandardMaterial({color:'#89704b',roughness:1,side:T.DoubleSide}),650);scene.add(leaves);leaves.receiveShadow=true;
  for(let i=0;i<2000;i++){
    const x=-12+random()*44,z=(random()-.5)*28,path=Math.abs(z-1-Math.sin(x*.25)*.9),noise=Math.sin(x*1.7+Math.cos(z))*Math.sin(z*2.3);
    const s=path<1.6||Math.hypot(x+1,z)<3.3?0:(.45+random()*.65)*(noise>-.1?1:.28);
    transforms.position.set(x,.01,z);transforms.scale.set(s,s,s);transforms.rotation.set(0,random()*6.28,0);transforms.updateMatrix();grass.setMatrixAt(i,transforms.matrix);
    if(i<260){
      const fernScale=path<2.7||Math.hypot(x+1,z)<4.5?0:.65+random()*.75;transforms.scale.setScalar(fernScale);transforms.updateMatrix();ferns.setMatrixAt(i,transforms.matrix);
    }
    if(i<650){transforms.position.y=.018;transforms.scale.setScalar(.45+random()*.7);transforms.updateMatrix();leaves.setMatrixAt(i,transforms.matrix);leaves.setColorAt(i,new T.Color(i%3===0?'#c1a277':'#897656'));}
  }
  // Campside details frame the route while keeping the centre clear for combat.
  for(const [x,z] of [[-3.6,2.5],[2.2,-3.6],[5.7,-3.3],[7.5,4.7]]){
    const rock=mesh(scene,new T.DodecahedronGeometry(.35,0),rocks[2],x,.11,z);rock.scale.set(1.4,.5,1);rock.rotation.y=x;
    for(let i=0;i<3;i++){const fern=mesh(scene,fernGeometry(),ferns.material,x+(random()-.5)*.7,.025,z+(random()-.5)*.7);fern.rotation.y=random()*6;fern.scale.setScalar(.75);fern.castShadow=false;}
  }
  const marker=mesh(scene,new T.RingGeometry(.18,.21,40),new T.MeshBasicMaterial({color:'#d5bb80',transparent:true,opacity:.8,side:T.DoubleSide}));marker.rotation.x=-Math.PI/2;marker.position.y=.025;marker.visible=false;marker.userData.dynamic=true;
  // Bake static scenery per material. Hundreds of slate tiles and beams become
  // a few draw calls; the fire, instanced forest and animated actors stay separate.
  scene.updateMatrixWorld(true);const batches=new Map();
  scene.traverse(object=>{
    if(!object.isMesh||object.isInstancedMesh||object.userData.dynamic||object===ground)return;
    const key=object.material.uuid;let batch=batches.get(key);if(!batch){batch={material:object.material,geometries:[],objects:[]};batches.set(key,batch);}
    const g=object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone();g.applyMatrix4(object.matrixWorld);batch.geometries.push(g);batch.objects.push(object);
  });
  for(const batch of batches.values()){
    const combined=mergeGeometries(batch.geometries,false);if(!combined)continue;
    mesh(scene,combined,batch.material);for(const object of batch.objects){object.removeFromParent();object.geometry.dispose();}for(const g of batch.geometries)g.dispose();
  }
  function animate(time){breeze.value=time;flames.forEach((flame,i)=>{flame.scale.set(.8+Math.sin(time*9+i)*.2,.85+Math.sin(time*11+i*4)*.25,.9+Math.sin(time*8+i)*.15);flame.rotation.z=Math.sin(time*5+i)*.15;});fireLight.intensity=32+Math.sin(time*12)*3+Math.sin(time*19)*2;}
  return {ground,obstacles,animate,marker,ready};
}
