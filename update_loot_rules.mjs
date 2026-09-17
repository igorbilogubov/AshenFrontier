import fs from 'fs';

let content = fs.readFileSync('public/game/loot-rules.ts', 'utf8');

// Replace WHITE_GEAR_CHANCE and GREEN_GEAR_CHANCE
content = content.replace(/export const WHITE_GEAR_CHANCE[^\n]+/, 
`export const WHITE_GEAR_CHANCE:Readonly<Partial<Record<MobType,number>>>=Object.freeze({wolf:.03,boar:.03,bear:.03,alpha:.06,lynx:.03,yak:.03,'frost-spider':.03,'ice-golem':.03,'ash-jackal':.03,scorpion:.03,'monitor-lizard':.03,scarab:.03});`);

content = content.replace(/export const GREEN_GEAR_CHANCE[^\n]+/,
`export const GREEN_GEAR_CHANCE:Readonly<Partial<Record<MobType,number>>>=Object.freeze({wolf:.01,boar:.01,bear:.01,alpha:.04,lynx:.01,yak:.01,'frost-spider':.01,'ice-golem':.01,'ash-jackal':.01,scorpion:.01,'monitor-lizard':.01,scarab:.01});`);

// Update GEAR_CHANCE (White + Green)
content = content.replace(/export const GEAR_CHANCE[^\n]+/,
`export const GEAR_CHANCE:Readonly<Partial<Record<MobType,number>>>=Object.freeze({wolf:.04,boar:.04,bear:.04,alpha:.10,lynx:.04,yak:.04,'frost-spider':.04,'ice-golem':.04,'ash-jackal':.04,scorpion:.04,'monitor-lizard':.04,scarab:.04});`);

// Update Boss and Elite logic in gearRarity
// Normal max green.
// Elite max blue. (Let's say 4% blue, 12% green, 20% white)
// Boss max yellow/purple.
const rarityFunction = `export function gearRarity(type:MobType,eliteId:string|undefined,random:()=>number,boss=false):0|1|2|3|4|null{
 const roll=random();if(!Number.isFinite(roll)||roll<0||roll>=1)throw new Error('Random source must return [0, 1)');
 if(boss)return roll<.04?4:roll<.12?3:roll<.32?2:roll<.62?1:roll<.92?0:null;
 if(eliteId)return roll<.04?2:roll<.16?1:roll<.36?0:null;
 const white=WHITE_GEAR_CHANCE[type]??.03,green=GREEN_GEAR_CHANCE[type]??.01;
 return roll<green?1:roll<white+green?0:null;
}`;

content = content.replace(/export function gearRarity[\s\S]*?}\n/, rarityFunction + '\n');

fs.writeFileSync('public/game/loot-rules.ts', content);
