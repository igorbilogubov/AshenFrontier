import type {Position,Obstacle} from './motion.js';

/** Town geometry shared by movement, protection, interaction and rendering. */
export const CAMP_SAFE_BOUNDS=Object.freeze({minX:-9,maxX:5.6,minZ:-8,maxZ:7});
export const CAMP_FIRE=Object.freeze({x:.5,z:2,r:.85});
export const CAMP_SPAWN=Object.freeze({x:.5,z:4});
export const CAMP_HOUSE=Object.freeze({x:-5,z:-4.6,width:4.8,depth:4,doorX:-5.65,doorZ:-2.6,doorWidth:1.5});
import {PERSONAL_CHEST} from './personal-stash.js';
export {PERSONAL_CHEST};
export const campSafe=(p:Position)=>p.x>CAMP_SAFE_BOUNDS.minX&&p.x<CAMP_SAFE_BOUNDS.maxX&&p.z>CAMP_SAFE_BOUNDS.minZ&&p.z<CAMP_SAFE_BOUNDS.maxZ;
export const insideHouse=(p:Position,padding=0)=>Math.abs(p.x-CAMP_HOUSE.x)<CAMP_HOUSE.width/2+padding&&Math.abs(p.z-CAMP_HOUSE.z)<CAMP_HOUSE.depth/2+padding;
export const CAMP_FENCES:readonly Readonly<Obstacle>[]=Object.freeze([
  {x:-9,z:-2.5,w:.18,d:11},
  {x:5.6,z:-4.6,w:.18,d:6.8},{x:5.6,z:5.9,w:.18,d:2.2},
  {x:-5.5,z:-8,w:7,d:.18},{x:3.8,z:-8,w:3.6,d:.18},
  {x:-7,z:7,w:4,d:.18},{x:3.5,z:7,w:4.2,d:.18},
].map(x=>Object.freeze(x)));
export const HOUSE_WALLS:readonly Readonly<Obstacle>[]=Object.freeze([
  {x:-7.4,z:-4.6,w:.18,d:4},{x:-2.6,z:-4.6,w:.18,d:4},
  {x:-5,z:-6.6,w:4.8,d:.18},
  {x:-6.9,z:-2.6,w:1,d:.18},{x:-3.75,z:-2.6,w:2.3,d:.18},
].map(x=>Object.freeze(x)));
export const CAMP_OBSTACLES:readonly Readonly<Obstacle>[]=Object.freeze([
  ...CAMP_FENCES,...HOUSE_WALLS,CAMP_FIRE,
  {x:PERSONAL_CHEST.x,z:PERSONAL_CHEST.z,w:1.15,d:.7},
  {x:-6.75,z:-5.15,w:.65,d:1.6},
]);
