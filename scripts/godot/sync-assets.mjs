import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {CAMERA, BOUNDS, CAMP, MOB_TYPES, SPAWNS, WEAPONS} from '../../public/game/location.js';
import {OBSTACLES, TREE_POSITIONS} from '../../public/game/terrain.js';

const root=fileURLToPath(new URL('../../',import.meta.url));
const project=path.join(root,'godot-prototype');
const files={
  'warrior.glb':'public/game/characters/ashen-warrior-v1.glb',
  'wolf.glb':'public/game/creatures/wolf.glb',
  'boar.glb':'public/game/creatures/boar.glb',
  'alpha.glb':'public/game/creatures/alpha.glb',
  'forest-floor.png':'public/game/materials/forest-floor-v1.png',
};
await mkdir(path.join(project,'assets'),{recursive:true});
await mkdir(path.join(project,'generated'),{recursive:true});
const assets={};
for(const [name,source] of Object.entries(files)){
  await copyFile(path.join(root,source),path.join(project,'assets',name));
  assets[name]={source,sha256:createHash('sha256').update(await readFile(path.join(root,source))).digest('hex')};
}
const manifest={camera:CAMERA,bounds:BOUNDS,camp:CAMP,mobTypes:MOB_TYPES,spawns:SPAWNS,weapons:WEAPONS,obstacles:OBSTACLES,trees:TREE_POSITIONS,assets};
await writeFile(path.join(project,'generated/world.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Godot: synced ${Object.keys(files).length} original assets and shared world geometry.`);
