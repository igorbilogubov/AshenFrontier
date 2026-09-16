import fs from 'node:fs/promises';
import * as T from '../../../public/game/vendor/three.module.js';
import {GLTFLoader} from '../../../public/game/vendor/GLTFLoader.js';
const root=new URL('../../../',import.meta.url),dir=new URL('./',import.meta.url);
const kinds=(await fs.readdir(dir)).filter(n=>n.endsWith('-report.json')).map(n=>n.slice(0,-12)).sort();const strides={},bounds={},heights={};
for(const kind of kinds){const bytes=await fs.readFile(new URL(`public/game/creatures/${kind}.glb`,root)),report=JSON.parse(await fs.readFile(new URL(`${kind}-report.json`,dir)));const a=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');const mixer=new T.AnimationMixer(a.scene),box=new T.Box3();let headHeight=0;
 for(const clip of a.animations){mixer.stopAllAction();const action=mixer.clipAction(clip).play();action.paused=true;for(let i=0;i<=32;i++){action.time=clip.duration*i/32;mixer.update(0);a.scene.updateMatrixWorld(true);a.scene.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingBox();box.union(o.boundingBox);}});if(clip.name==='Idle')headHeight=Math.max(headHeight,a.scene.getObjectByName('Head').getWorldPosition(new T.Vector3()).y);}}
 bounds[kind]={min:box.min.toArray().map(v=>Math.floor((v-.16)*100)/100),max:box.max.toArray().map(v=>Math.ceil((v+.16)*100)/100)};strides[kind]=report.strides;heights[kind]=Math.ceil((box.max.y+.22)*100)/100;console.log(kind,JSON.stringify({bounds:bounds[kind],minY:box.min.y,headHeight}));
}
const source=`import type {LateMobType} from './late-world.js';
// Measured from every exported GLB clip at 33 samples, plus 0.16m safety margin.
export const LATE_CREATURE_STRIDES:Readonly<Record<LateMobType,{walk:number;run:number}>>=Object.freeze(${JSON.stringify(strides,null,2)});
export const LATE_CREATURE_BOUNDS:Readonly<Record<LateMobType,{min:readonly [number,number,number];max:readonly [number,number,number]}>>=Object.freeze(${JSON.stringify(bounds,null,2)});
export const LATE_CREATURE_HEIGHTS:Readonly<Record<LateMobType,number>>=Object.freeze(${JSON.stringify(heights,null,2)});
`;
await fs.writeFile(new URL('public/game/late-creatures.ts',root),source);
