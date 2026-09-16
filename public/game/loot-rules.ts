import type {MobType} from '../../shared/types.js';

// Ground rewards belong to one contributor. The world does not persist loose
// objects: expired or restart-abandoned rewards cannot silently enter a bag.
export const LOOT_TTL_MS=180_000;
export const MAX_GROUND_DROPS_PER_HERO=48;
export const PICKUP_RANGE=1.4;
export const AFK_PICKUP_RANGE=4;
export const WHITE_GEAR_CHANCE:Readonly<Partial<Record<MobType,number>>>=Object.freeze({wolf:.005,boar:.005,bear:.005,alpha:.01,lynx:.005,yak:.005,'frost-spider':.005,'ice-golem':.005,'ash-jackal':.005,scorpion:.005,'monitor-lizard':.005,scarab:.005});
export const GREEN_GEAR_CHANCE:Readonly<Partial<Record<MobType,number>>>=Object.freeze({wolf:.02,boar:.02,bear:.02,alpha:.08,lynx:.02,yak:.02,'frost-spider':.02,'ice-golem':.02,'ash-jackal':.02,scorpion:.02,'monitor-lizard':.02,scarab:.02});
/** Total ordinary-equipment chance; individual white/green chances stay explicit above. */
export const GEAR_CHANCE:Readonly<Partial<Record<MobType,number>>>=Object.freeze({wolf:.025,boar:.025,bear:.025,alpha:.09,lynx:.025,yak:.025,'frost-spider':.025,'ice-golem':.025,'ash-jackal':.025,scorpion:.025,'monitor-lizard':.025,scarab:.025});
export const gearDrops=(type:MobType,random:()=>number)=>random()<(GEAR_CHANCE[type]??.025);

export const ELITE_GEAR_CHANCE=.13;
export const ELITE_RARE_CHANCE=.03;
/** One roll: 3% rare, 10% uncommon, 87% no equipment for named elites. */
export const BOSS_GEAR_CHANCE=.57;
export const BOSS_RARITY_CHANCES=Object.freeze({1:.10,2:.35,3:.08,4:.04});
/** Bosses use one mutually exclusive roll, never four independent item rolls. */
export function gearRarity(type:MobType,eliteId:string|undefined,random:()=>number,boss=false):0|1|2|3|4|null{
 const roll=random();if(!Number.isFinite(roll)||roll<0||roll>=1)throw new Error('Random source must return [0, 1)');
 if(boss)return roll<.04?4:roll<.12?3:roll<.47?2:roll<.57?1:null;
 if(eliteId)return roll<ELITE_RARE_CHANCE?2:roll<ELITE_GEAR_CHANCE?1:null;
 const white=WHITE_GEAR_CHANCE[type]??.005,green=GREEN_GEAR_CHANCE[type]??.02;
 return roll<white?0:roll<white+green?1:null;
}
