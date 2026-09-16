import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import * as T from '../../../public/game/vendor/three.module.js';
import {GLTFLoader} from '../../../public/game/vendor/GLTFLoader.js';
const dir=fileURLToPath(new URL('../../../',import.meta.url));
const report={};
for(const type of ['ash-jackal','scorpion','monitor-lizard','scarab']){
if(!fs.existsSync(`${dir}/public/game/creatures/${type}.glb`))continue;
const bytes=fs.readFileSync(`${dir}/public/game/creatures/${type}.glb`),asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const mixer=new T.AnimationMixer(asset.scene),bounds=new T.Box3(),byclip={};
for(const clip of asset.animations){mixer.stopAllAction();const act=mixer.clipAction(clip).play();act.paused=true;const box=new T.Box3();for(let i=0;i<=60;i++){act.time=clip.duration*i/60;mixer.update(0);asset.scene.updateMatrixWorld(true);asset.scene.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingBox();box.union(o.boundingBox);}});}byclip[clip.name]={min:[...box.min],max:[...box.max]};bounds.union(box);}
report[type]={bounds:{min:[...bounds.min],max:[...bounds.max]},byclip};
}
fs.writeFileSync(new URL('./animation-bounds.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log('Measured exported GLB animation bounds for',Object.keys(report).join(', '));
