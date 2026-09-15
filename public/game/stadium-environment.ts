import * as T from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';
import {box,cylinder,joint,mesh} from './models.js';
import {surfaceMaterial} from './forms.js';
import {STADIUM_BOUNDS,STADIUM_PENS,STADIUM_PEN_WALLS,STADIUM_HUB,PORTALS} from './stadium.js';
import type {Portal} from './stadium.js';

/** Authored stone arena. Geometry is batched independently from the forest so
 * its bounds are culled when the camera is in the original location. */
export function createStadiumEnvironment(scene:T.Scene){
  const stone=['#777c75','#8b8c7e','#616c69'].map(color=>surfaceMaterial(color,{grain:.14,frequency:27}));
  const pale=surfaceMaterial('#aaa68f',{grain:.1,frequency:32});
  const dark=surfaceMaterial('#343d3c',{grain:.12,frequency:22});
  const bronze=new T.MeshStandardMaterial({color:'#b08d55',metalness:.48,roughness:.6});
  const iron=new T.MeshStandardMaterial({color:'#414b48',metalness:.45,roughness:.7});
  const floor=surfaceMaterial('#5d6964',{grain:.08,frequency:38});
  const arena=new T.Group();arena.name='stadium-environment';scene.add(arena);
  const {minX,maxX,minZ,maxZ}=STADIUM_BOUNDS;
  const foundation=box(arena,maxX-minX+1,.7,maxZ-minZ+1,stone[2],160,-.37,2);foundation.castShadow=false;
  const ground=box(arena,maxX-minX,.055,maxZ-minZ,floor,160,-.033,2);ground.castShadow=false;
  const pens=new T.Group();pens.name='stadium-pens';arena.add(pens);
  for(const pen of STADIUM_PENS){
    const dirt=surfaceMaterial(pen.tint,{grain:.12,frequency:42});
    const compile=dirt.onBeforeCompile.bind(dirt);
    dirt.onBeforeCompile=(shader,renderer)=>{
      compile(shader,renderer);
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        float wornPatch = sin(vArtSurface.x * .89 + cos(vArtSurface.z * .71)) * cos(vArtSurface.z * 1.12 + vArtSurface.x * .23);
        diffuseColor.rgb *= .88 + wornPatch * .09;
      `);
    };dirt.customProgramCacheKey=()=>`stadium-soil-${pen.id}`;
    const field=box(pens,pen.width-.5,.03,pen.depth-.5,dirt,pen.x,-.005,pen.z);field.castShadow=false;
    const circle=mesh(pens,new T.RingGeometry(pen.radius-.045,pen.radius+.045,72),new T.MeshBasicMaterial({color:pen.tint,transparent:true,opacity:.38,side:T.DoubleSide}),pen.x,.021,pen.z);circle.rotation.x=-Math.PI/2;circle.castShadow=false;
    // Low sides preserve clear sight of all six creatures from the fixed camera.
    for(const wall of STADIUM_PEN_WALLS.filter(w=>w.x>=pen.x-7.3&&w.x<=pen.x+7.3)){
      if(wall.w===undefined||wall.d===undefined)continue;
      box(pens,wall.w,.46,wall.d,stone[0],wall.x,.23,wall.z);
      box(pens,wall.w+.10,.10,wall.d+.10,pale,wall.x,.49,wall.z);
      const horizontal=wall.w>wall.d,length=horizontal?wall.w:wall.d;
      const count=Math.ceil(length/1.8);
      for(let i=0;i<=count;i++){
        const offset=-length/2+length*i/count;
        cylinder(pens,.045,.055,.59,iron,wall.x+(horizontal?offset:0),.81,wall.z+(horizontal?0:offset),6);
      }
      box(pens,horizontal?length:.065,.065,horizontal?.065:length,iron,wall.x,1.07,wall.z);
    }
    // Wide gateway and a separate crest identify each pen without closing it.
    for(const side of [-1,1]){
      box(pens,.66,1.76,.72,stone[2],pen.x+side*2.63,.88,2);
      box(pens,.84,.17,.9,pale,pen.x+side*2.63,1.82,2);
      const banner=mesh(pens,new T.PlaneGeometry(.66,.92),new T.MeshStandardMaterial({color:pen.tint,side:T.DoubleSide}),pen.x+side*2.63,1.18,2.38);banner.castShadow=false;
      box(pens,.06,.54,.018,bronze,pen.x+side*2.63,1.18,2.397);
    }
    // Keep the open gateway and combat silhouettes free of the nameplate.
    const label=makeLabel(`${pen.rank}  ${pen.name.toUpperCase()}`,pen.subtitle,3.2,.64,true);
    label.position.set(pen.x-4.6,1.7,2.2);label.rotation.y=.55;pens.add(label);
    cylinder(pens,.045,.055,.58,iron,pen.x-4.6,1.3,2,6);
    // Broken inset pavers and sparse small stones read as worn training ground.
    for(let i=0;i<15;i++){
      const angle=i*2.399963,r=2.0+(i%5)*.65;
      const paver=box(pens,.36+(i%3)*.15,.025,.35,stone[i%3],pen.x+Math.sin(angle)*r,.011,pen.z+Math.cos(angle)*r);paver.rotation.y=angle;paver.castShadow=false;
    }
  }
  // Outer masonry and stepped spectator terraces remain beyond walkable bounds.
  for(const x of [minX+.35,maxX-.35]){
    box(arena,.7,1.8,maxZ-minZ,stone[0],x,.9,2);
    box(arena,.82,.13,maxZ-minZ,pale,x,1.865,2);
  }
  for(const z of [minZ+.35,maxZ-.35]){
    box(arena,maxX-minX,1.8,.7,stone[0],160,.9,z);
    box(arena,maxX-minX,.13,.82,pale,160,1.865,z);
  }
  for(let step=0;step<4;step++){
    box(arena,55+step*2,.55+step*.55,1.2,stone[step%3],160,(.55+step*.55)/2,-20.1-step*1.05);
    for(const side of [-1,1])box(arena,1.2,.55+step*.55,46+step*2,stone[step%3],160+side*(28.1+step*1.05),(.55+step*.55)/2,2);
  }
  for(let x=135;x<=185;x+=5){
    box(arena,.85,2.9,.9,stone[2],x,1.45,-18.5);box(arena,1.13,.18,1.16,pale,x,2.99,-18.5);
  }
  // Continuous broad promenade feeds all three gates; paving never blocks actors.
  for(let x=136;x<=184;x+=2)for(const z of [4.1,6.1]){
    const slab=box(arena,1.92,.032,1.86,(Math.round(x)+Math.round(z))%3?stone[1]:stone[0],x,.002,z);slab.castShadow=false;
  }
  for(const pen of STADIUM_PENS)for(let z=0;z<=4;z+=1.5){const slab=box(arena,4.35,.034,1.43,stone[1],pen.x,.005,z);slab.castShadow=false;}
  for(let z=7.9;z<=20;z+=1.8)for(const side of [-1,1]){const slab=box(arena,1.75,.034,1.73,stone[1],160+side*.91,.005,z);slab.castShadow=false;}
  const hub=mesh(arena,new T.RingGeometry(STADIUM_HUB.r-.12,STADIUM_HUB.r,96),bronze,160,.025,15);hub.rotation.x=-Math.PI/2;hub.castShadow=false;
  const title=makeLabel('СТАДИУМ','Три загона · безопасная площадь',9.2,1.35);title.position.set(160,3.9,-18);arena.add(title);
  const portalGroups:{portal:Readonly<Portal>;object:T.Group}[]=[],glows:T.Mesh<T.CircleGeometry,T.MeshBasicMaterial>[]=[];
  for(const portal of PORTALS){
    const group=joint(scene,portal.x,0,portal.z);group.name=`portal-${portal.id}`;group.rotation.y=.55;
    group.userData.portalId=portal.id;
    const pad=cylinder(group,1.12,1.28,.13,stone[2],0,.045,0,40);pad.castShadow=false;
    for(let i=0;i<13;i++){
      const a=i/12*Math.PI,x=Math.cos(a)*.99,y=.75+Math.sin(a)*1.38;
      const block=box(group,.40,.43,.52,stone[i%3],x,y,0);block.rotation.z=a-Math.PI/2;
      const rune=box(group,.09,.13,.012,bronze,x,y,.272);rune.rotation.z=a-Math.PI/2;
    }
    for(const side of [-1,1]){box(group,.46,.8,.55,stone[0],side*.99,.4,0);box(group,.67,.14,.76,pale,side*.99,.12,0);}
    const glow=mesh(group,new T.CircleGeometry(.85,48),new T.MeshBasicMaterial({color:'#6dc9ba',transparent:true,opacity:.2,side:T.DoubleSide,depthWrite:false}),0,1.18,0);
    glow.scale.y=1.16;glow.castShadow=false;glow.receiveShadow=false;glows.push(glow);
    const rim=mesh(group,new T.TorusGeometry(.77,.025,5,64),new T.MeshBasicMaterial({color:'#9de2c7',transparent:true,opacity:.7}),0,1.18,.025);rim.scale.y=1.21;rim.castShadow=false;
    // The interactive DOM label names this portal; avoid a duplicate 3D sign.
    portalGroups.push({portal,object:group});
    bake(group);
  }
  bake(pens);bake(arena);
  return {ground,portals:portalGroups,animate(time:number){glows.forEach((glow,i)=>{glow.material.opacity=.18+Math.sin(time*1.7+i)*.035;});}};
}
function makeLabel(title:string,subtitle:string,width:number,height:number,compact=false){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=192;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas 2D is unavailable');
  ctx.fillStyle='rgba(24,32,30,.91)';ctx.fillRect(3,3,1018,186);
  ctx.strokeStyle='#8b8065';ctx.lineWidth=3;ctx.strokeRect(7,7,1010,178);
  ctx.textAlign='center';ctx.fillStyle='#e2d4b1';ctx.font=compact?'600 72px Georgia':'600 53px Georgia';ctx.fillText(title,512,82,950);
  ctx.fillStyle='#b6c3b9';ctx.font=compact?'44px Georgia':'34px Georgia';ctx.fillText(subtitle,512,143,950);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  const label=new T.Mesh(new T.PlaneGeometry(width,height),new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:T.DoubleSide}));label.userData.dynamic=true;return label;
}
function bake(group:T.Group){
  group.updateWorldMatrix(true,true);
  const inverse=new T.Matrix4().copy(group.matrixWorld).invert(),batches=new Map<string,{material:T.Material;parts:T.BufferGeometry[];objects:T.Mesh[];castShadow:boolean;receiveShadow:boolean}>();
  group.traverse(object=>{
    if(!(object instanceof T.Mesh)||Array.isArray(object.material)||object.material.transparent||object.userData.dynamic)return;
    const key=`${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`;
    const batch=batches.get(key)??{material:object.material,parts:[] as T.BufferGeometry[],objects:[] as T.Mesh[],castShadow:object.castShadow,receiveShadow:object.receiveShadow};
    const geometry=object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone();geometry.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,object.matrixWorld));batch.parts.push(geometry);batch.objects.push(object);batches.set(key,batch);
  });
  for(const batch of batches.values()){
    const geometry=mergeGeometries(batch.parts,false);if(!geometry)continue;
    const combined=mesh(group,geometry,batch.material);combined.castShadow=batch.castShadow;combined.receiveShadow=batch.receiveShadow;
    for(const object of batch.objects){object.removeFromParent();object.geometry.dispose();}for(const part of batch.parts)part.dispose();
  }
}
