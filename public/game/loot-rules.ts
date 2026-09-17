import type {MobType} from '../../shared/types.js';

// Ground rewards belong to one contributor. The world does not persist loose
// objects: expired or restart-abandoned rewards cannot silently enter a bag.
export const LOOT_TTL_MS=180_000;
export const MAX_GROUND_DROPS_PER_HERO=48;
export const PICKUP_RANGE=1.4;
export const AFK_PICKUP_RANGE=4;
export const WHITE_GEAR_CHANCE:Readonly<Partial<Record<MobType,number>>>=Object.freeze({wolf:.03,boar:.03,bear:.03,alpha:.06,lynx:.03,yak:.03,'frost-spider':.03,'ice-golem':.03,'ash-jackal':.03,scorpion:.03,'monitor-lizard':.03,scarab:.03});
export const GREEN_GEAR_CHANCE:Readonly<Partial<Record<MobType,number>>>=Object.freeze({wolf:.01,boar:.01,bear:.01,alpha:.04,lynx:.01,yak:.01,'frost-spider':.01,'ice-golem':.01,'ash-jackal':.01,scorpion:.01,'monitor-lizard':.01,scarab:.01});
/** Total ordinary-equipment chance; individual white/green chances stay explicit above. */
export const GEAR_CHANCE:Readonly<Partial<Record<MobType,number>>>=Object.freeze({wolf:.04,boar:.04,bear:.04,alpha:.10,lynx:.04,yak:.04,'frost-spider':.04,'ice-golem':.04,'ash-jackal':.04,scorpion:.04,'monitor-lizard':.04,scarab:.04});
export const gearDrops=(type:MobType,random:()=>number)=>random()<(GEAR_CHANCE[type]??.025);

export const ELITE_GEAR_CHANCE=.13;
export const ELITE_RARE_CHANCE=.03;
/** One roll: 3% rare, 10% uncommon, 87% no equipment for named elites. */
export const BOSS_GEAR_CHANCE=.57;
export const BOSS_RARITY_CHANCES=Object.freeze({1:.10,2:.35,3:.08,4:.04});
/** Bosses use one mutually exclusive roll, never four independent item rolls. */
export function gearRarity(type:MobType,eliteId:string|undefined,random:()=>number,boss=false):0|1|2|3|4|null{
 const roll=random();if(!Number.isFinite(roll)||roll<0||roll>=1)throw new Error('Random source must return [0, 1)');
 if(boss)return roll<.04?4:roll<.12?3:roll<.32?2:roll<.62?1:roll<.92?0:null;
 if(eliteId)return roll<.04?2:roll<.16?1:roll<.36?0:null;
 const white=WHITE_GEAR_CHANCE[type]??.03,green=GREEN_GEAR_CHANCE[type]??.01;
 return roll<green?1:roll<white+green?0:null;
}
