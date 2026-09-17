import type {MobType} from '../../shared/types.js';

// Ground rewards belong to one contributor. The world does not persist loose
// objects: expired or restart-abandoned rewards cannot silently enter a bag.
export const LOOT_TTL_MS=180_000;
export const MAX_GROUND_DROPS_PER_HERO=48;
export const PICKUP_RANGE=1.4;
export const AFK_PICKUP_RANGE=4;

const ordinaryWhite=.03;
const ordinaryGreen=.01;
const alphaWhite=.06;
const alphaGreen=.04;
const ordinaryTypes=['wolf','boar','bear','lynx','yak','frost-spider','ice-golem','ash-jackal','scorpion','monitor-lizard','scarab'] as const;

const chanceMap=(ordinary:number,alpha:number)=>Object.freeze(
  Object.fromEntries([...ordinaryTypes.map(type=>[type,ordinary]),['alpha',alpha]])
) as Readonly<Partial<Record<MobType,number>>>;

export const WHITE_GEAR_CHANCE=chanceMap(ordinaryWhite,alphaWhite);
export const GREEN_GEAR_CHANCE=chanceMap(ordinaryGreen,alphaGreen);
/** Total ordinary-equipment chance; individual white/green chances stay explicit above. */
export const GEAR_CHANCE=chanceMap(ordinaryWhite+ordinaryGreen,alphaWhite+alphaGreen);
export const gearDrops=(type:MobType,random:()=>number)=>random()<(GEAR_CHANCE[type]??ordinaryWhite+ordinaryGreen);

export const ELITE_WHITE_CHANCE=.20;
export const ELITE_GREEN_CHANCE=.12;
export const ELITE_BLUE_CHANCE=.04;
export const ELITE_GEAR_CHANCE=ELITE_WHITE_CHANCE+ELITE_GREEN_CHANCE+ELITE_BLUE_CHANCE;
export const ELITE_RARE_CHANCE=ELITE_BLUE_CHANCE;

export const BOSS_ITEM_MIN=1;
export const BOSS_ITEM_MAX=3;
/** Bosses always drop at least one item; this is the chance a given boss item roll yields gear. */
export const BOSS_GEAR_CHANCE=1;
/** Per dropped boss item: green > blue > yellow > purple, never white, never empty. */
export const BOSS_RARITY_CHANCES=Object.freeze({1:.50,2:.30,3:.15,4:.05});

export function bossItemCount(random:()=>number):number{
  const roll=random();if(!Number.isFinite(roll)||roll<0||roll>=1)throw new Error('Random source must return [0, 1)');
  return BOSS_ITEM_MIN+Math.floor(roll*(BOSS_ITEM_MAX-BOSS_ITEM_MIN+1));
}

/** One mutually exclusive roll. Ordinary: white then green. Elite: white then green then blue. Boss: green then blue then yellow then set. */
export function gearRarity(type:MobType,eliteId:string|undefined,random:()=>number,boss=false):0|1|2|3|4|null{
  const roll=random();if(!Number.isFinite(roll)||roll<0||roll>=1)throw new Error('Random source must return [0, 1)');
  if(boss){
    if(roll<.50)return 1;
    if(roll<.80)return 2;
    if(roll<.95)return 3;
    return 4;
  }
  if(eliteId){
    if(roll<ELITE_WHITE_CHANCE)return 0;
    if(roll<ELITE_WHITE_CHANCE+ELITE_GREEN_CHANCE)return 1;
    if(roll<ELITE_GEAR_CHANCE)return 2;
    return null;
  }
  const white=WHITE_GEAR_CHANCE[type]??ordinaryWhite,green=GREEN_GEAR_CHANCE[type]??ordinaryGreen;
  if(roll<white)return 0;
  if(roll<white+green)return 1;
  return null;
}
