import type {MobType} from '../../shared/types.js';

// Ground rewards belong to one contributor. The world does not persist loose
// objects: expired or restart-abandoned rewards cannot silently enter a bag.
export const LOOT_TTL_MS=180_000;
export const MAX_GROUND_DROPS_PER_HERO=48;
export const PICKUP_RANGE=1.4;
export const GEAR_CHANCE:Readonly<Partial<Record<MobType,number>>>=Object.freeze({wolf:.10,boar:.10,bear:.10,alpha:.40,lynx:.10,yak:.10,'frost-spider':.10,'ice-golem':.10,'ash-jackal':.10,scorpion:.10,'monitor-lizard':.10,scarab:.10});
export const gearDrops=(type:MobType,random:()=>number)=>random()<(GEAR_CHANCE[type]??.1);

export const ELITE_GEAR_CHANCE=.40;
export const ELITE_RARE_CHANCE=.03;
/** One roll: 3% rare, 37% uncommon, 60% no equipment for named elites. */
export const BOSS_GEAR_CHANCE=.77;
export const BOSS_RARITY_CHANCES=Object.freeze({1:.30,2:.35,3:.08,4:.04});
/** Bosses use one mutually exclusive roll, never four independent item rolls. */
export function gearRarity(type:MobType,eliteId:string|undefined,random:()=>number,boss=false):1|2|3|4|null{
 const roll=random();if(!Number.isFinite(roll)||roll<0||roll>=1)throw new Error('Random source must return [0, 1)');
 if(boss)return roll<.04?4:roll<.12?3:roll<.47?2:roll<.77?1:null;
 return eliteId?(roll<ELITE_RARE_CHANCE?2:roll<ELITE_GEAR_CHANCE?1:null):roll<(GEAR_CHANCE[type]??.10)?1:null;
}
