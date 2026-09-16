/** Stable level and experience rules shared by the server and balance tools. */
export const MAX_LEVEL=100;

const finiteInteger=(value:number,fallback=1)=>Number.isFinite(value)?Math.floor(value):fallback;
const playableLevel=(value:number)=>Math.max(1,Math.min(MAX_LEVEL,finiteInteger(value)));

/** Baseline reward for one ordinary monster fought at its authored level. */
export function baseXp(mobLevel:number){
  const level=playableLevel(mobLevel);
  return Math.round(12+.55*level*level);
}
export const baseExperience=baseXp;

/**
 * The curve is expressed in equal-level kills so later monster rewards can grow
 * without collapsing the time budget. Breakpoints mirror the five world tiers.
 */
export function targetKills(level:number){
  const current=playableLevel(level);
  if(current>=MAX_LEVEL)return 0;
  if(current<20)return Math.round(20+(current-1)*(180/18));
  if(current<40)return Math.round(300+(current-20)*(646/19));
  if(current<60)return Math.round(1000+(current-40)*(646/19));
  if(current<80)return Math.round(1700+(current-60)*(716/19));
  return Math.round(2450+(current-80)*(98/19));
}

/** XP required to advance from `level` to the next level; zero means capped. */
export function xpNeeded(level:number){
  const current=finiteInteger(level);
  if(current>=MAX_LEVEL)return 0;
  const normalized=Math.max(1,current);
  return baseXp(normalized)*targetKills(normalized);
}

/** Full reward through a ten-level overlap, then progressively less for old zones. */
export function experienceMultiplier(heroLevel:number,mobLevel:number){
  const gap=Math.max(0,playableLevel(heroLevel)-playableLevel(mobLevel));
  if(gap<=10)return 1;
  if(gap<=15)return 1-(gap-10)*.04;
  if(gap<=20)return .8-(gap-15)*.05;
  if(gap<=30)return .55-(gap-20)*.03;
  if(gap<=40)return .25-(gap-30)*.015;
  return .1;
}

/** Manual and online-AFK kills call the same function. */
export function mobExperience(heroLevel:number,mobLevel:number,reward:number=baseXp(mobLevel)){
  const base=Number.isFinite(reward)?Math.max(0,Math.round(reward)):0;
  return base===0?0:Math.max(1,Math.round(base*experienceMultiplier(heroLevel,mobLevel)));
}
