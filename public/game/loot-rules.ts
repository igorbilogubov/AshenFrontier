import type {MobType} from '../../shared/types.js';

// Ground rewards belong to one contributor. The world does not persist loose
// objects: expired or restart-abandoned rewards cannot silently enter a bag.
export const LOOT_TTL_MS=180_000;
export const MAX_GROUND_DROPS_PER_HERO=48;
export const PICKUP_RANGE=1.4;
export const GEAR_CHANCE:Readonly<Record<MobType,number>>=Object.freeze({wolf:.10,boar:.10,alpha:.40});
export const gearDrops=(type:MobType,random:()=>number)=>random()<GEAR_CHANCE[type];
