import type {MobType} from '../../shared/types.js';

// Ground rewards belong to one contributor. The world does not persist loose
// objects: expired or restart-abandoned rewards cannot silently enter a bag.
export const LOOT_TTL_MS=180_000;
export const MAX_GROUND_DROPS_PER_HERO=48;
export const PICKUP_RANGE=1.4;
export const GEAR_CHANCE:Readonly<Record<MobType,number>>=Object.freeze({wolf:.10,boar:.10,bear:.10,alpha:.40,lynx:.10,yak:.10,'frost-spider':.10,'ice-golem':.10});
export const gearDrops=(type:MobType,random:()=>number)=>random()<GEAR_CHANCE[type];

export const ELITE_GEAR_CHANCE=.40;
export const ELITE_RARE_CHANCE=.03;
/** One roll: 3% rare, 37% uncommon, 60% no equipment for named elites. */
export function gearRarity(type:MobType,eliteId:string|undefined,random:()=>number):1|2|null{
 const roll=random();return eliteId?(roll<ELITE_RARE_CHANCE?2:roll<ELITE_GEAR_CHANCE?1:null):roll<GEAR_CHANCE[type]?1:null;
}
