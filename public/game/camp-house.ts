import * as T from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';
import {box,cylinder,ellipsoid,joint,mesh,materials} from './models.js';
import {surfaceMaterial} from './forms.js';
import {CAMP_HOUSE,PERSONAL_CHEST,insideHouse} from './camp-layout.js';
import type {Position} from './motion.js';

/** Authored open doorway and cutaway interior; floor remains at game ground. */
export function createCampHouse(scene:T.Scene){
  const house=joint(scene,CAMP_HOUSE.x,0,CAMP_HOUSE.z),roof=new T.Group(),front=new T.Group();house.add(roof,front);
  const timber=surfaceMaterial('#40352a',{grain:.15,frequency:22}),wood=surfaceMaterial('#766044',{grain:.17,frequency:26}),plaster=surfaceMaterial('#a69d83',{grain:.08,frequency:35}),stone=surfaceMaterial('#777a70',{grain:.15,frequency:20});
  const slate=['#3c5058','#496069','#526a70','#3b535b'].map(color=>surfaceMaterial(color,{grain:.07,frequency:26}));
  box(house,4.8,.07,4,stone,0,.015,0);
  for(let i=0;i<16;i++)box(house,.277,.025,3.78,wood,-2.2+i*.293,.065,0);
  box(house,.18,2.65,4,plaster,-2.4,1.39,0);box(house,4.8,2.65,.18,plaster,0,1.39,-2);
  box(front,.18,2.65,4,plaster,2.4,1.39,0);
  box(front,1,2.65,.18,plaster,-1.9,1.39,2);box(front,2.3,2.65,.18,plaster,1.25,1.39,2);
  box(front,1.5,.48,.18,plaster,-.65,2.48,2);
  for(const x of [-2.4,2.4])for(const z of [-2,2])box(z>0||x>0?front:house,.22,2.8,.22,timber,x,1.46,z);
  for(const z of [-2,2])for(const y of [.2,2.8])box(z>0?front:house,4.98,.16,.24,timber,0,y,z);
  for(const x of [-2.4,2.4])for(const y of [.2,2.8])box(x>0?front:house,.24,.16,4.1,timber,x,y,0);
  for(const x of [-1.4,.1])box(house,.13,2.22,.27,timber,x,1.15,2);
  box(house,1.65,.14,.28,timber,-.65,2.29,2);
  // Door is visibly swung inward and never occupies the shared clear doorway.
  const door=joint(house,-1.39,0,1.96);door.rotation.y=Math.PI*.48;
  box(door,1.35,2.12,.11,wood,.68,1.12,0);
  for(let i=0;i<8;i++)box(door,.022,2,.014,timber,.08+i*.17,1.12,.064);
  for(const y of [.45,1.8])box(door,1.25,.08,.025,materials.dark,.68,y,.072);
  ellipsoid(door,1.21,1.12,.09,.04,.04,.04,materials.gold);
  for(let i=0;i<3;i++)box(house,1.6,.035,.42,stone,-.65,.018,2.22+i*.4);
  for(const side of [-1,1]){
    const wing=joint(roof,0,3.30,side*1.08);wing.rotation.x=side*.57;
    box(wing,5.5,.14,2.7,slate[0]);
    for(let row=0;row<5;row++)for(let col=0;col<12;col++)box(wing,.46,.08,.59,slate[(col*3+row)%4],-2.5+col*.455+(row%2)*.12,.12+row*.008,-1.08+row*.51);
  }
  const tri=new T.Shape();tri.moveTo(-1.95,0);tri.lineTo(0,1.25);tri.lineTo(1.95,0);tri.closePath();
  for(const x of [-2.32,2.32]){const mat=plaster.clone();mat.side=T.DoubleSide;const g=mesh(roof,new T.ShapeGeometry(tri),mat,x,2.82,0);g.rotation.y=Math.PI/2;}
  for(let row=0;row<5;row++)for(let col=0;col<3;col++)box(roof,.39,.23,.65,stone,1.25+col*.37,3.2+row*.22,-.3);
  const glow=new T.MeshStandardMaterial({color:'#edbb70',emissive:'#d09342',emissiveIntensity:.6});
  for(const x of [-1.9,1.2]){box(front,.55,.7,.06,glow,x,1.85,2.11);box(front,.04,.75,.08,timber,x,1.85,2.15);box(front,.6,.06,.08,timber,x,1.85,2.15);}
  // A bunk, rug, shelf and small lamp make the room readable from the game angle.
  box(house,.64,.24,1.6,timber,-1.75,.18,-.55);box(house,.61,.10,1.52,new T.MeshStandardMaterial({color:'#56625a',roughness:1}),-1.75,.35,-.55);
  box(house,.5,.09,.36,new T.MeshStandardMaterial({color:'#b2aa91',roughness:1}),-1.75,.45,-1.07);
  box(house,1.3,.015,1.7,new T.MeshStandardMaterial({color:'#665444',roughness:1}),-.3,.084,.25);
  box(house,1.3,.1,.4,wood,.1,1.12,-1.75);
  for(let i=0;i<5;i++)box(house,.12,.25,.19,new T.MeshStandardMaterial({color:i%2?'#586552':'#7b4c35',roughness:.9}),-.35+i*.17,1.29,-1.75);
  const lamp=joint(house,1.8,1.75,-1.6);cylinder(lamp,.1,.15,.22,timber);cylinder(lamp,.07,.07,.16,glow,0,.13,0);
  const chest=joint(scene,PERSONAL_CHEST.x,0,PERSONAL_CHEST.z);
  box(chest,1.13,.6,.7,wood,0,.36,0);
  const lid=cylinder(chest,.35,.35,1.13,wood,0,.65,0,16);lid.rotation.z=Math.PI/2;
  for(const x of [-.42,.42])box(chest,.075,.84,.75,materials.dark,x,.46,0);
  box(chest,.17,.23,.06,materials.gold,0,.56,.39);
  // Batch each visibility part independently, preserving the roof cutaway.
  for(const group of [...roof.children.filter(child=>child instanceof T.Group),door,front,roof,chest,house]){
    group.updateWorldMatrix(true,true);
    const byMaterial=new Map<T.Material,T.Mesh[]>();
    for(const child of [...group.children])if(child instanceof T.Mesh&&!Array.isArray(child.material)){const list=byMaterial.get(child.material)??[];list.push(child);byMaterial.set(child.material,list);}
    for(const [mat,objects] of byMaterial){
      const geometries=objects.map(o=>{o.updateMatrix();const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();return g.applyMatrix4(o.matrix);});
      const combined=mergeGeometries(geometries,false);if(combined){const result=mesh(group,combined,mat);result.userData.dynamic=true;for(const o of objects){o.removeFromParent();o.geometry.dispose();}}
      geometries.forEach(g=>g.dispose());
    }
  }
  const pickMeshes:T.Object3D[]=[];chest.traverse(object=>{if(object instanceof T.Mesh)pickMeshes.push(object);});
  let cutaway=false;
  function update(hero:Position){const inside=insideHouse(hero,cutaway?.38:.10);if(inside!==cutaway){cutaway=inside;roof.visible=!inside;front.visible=!inside;}}
  return {house,chest,pickMeshes,update};
}
