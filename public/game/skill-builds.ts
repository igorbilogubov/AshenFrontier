import type {ClassId, SkillBuild, SkillId, SkillLoadout} from '../../shared/types.js';
import {isRecord} from '../../shared/types.js';
import {SKILLS, skillsForClass, type SkillDefinition} from './skills.js';

export interface BuildSource {classId:ClassId;level:number;skillBuild?:SkillBuild}
export interface TalentDefinition {id:string;classId:ClassId;branch:string;name:string;description:string;maxRank:1|2;keystone:boolean;effect:string;amount:number}
const BRANCHES:Record<ClassId,{id:string;name:string}[]>={
  warrior:[{id:'duelist',name:'Дуэлянт'},{id:'crowd',name:'Боец толпы'},{id:'guardian',name:'Страж'}],
  archer:[{id:'sniper',name:'Снайпер'},{id:'ranger',name:'Следопыт'},{id:'hunter',name:'Егерь'}],
  mage:[{id:'pyromancer',name:'Пиромант'},{id:'frostlord',name:'Повелитель льда'},{id:'arcanist',name:'Чародей'}]
};
export const talentBranches=(classId:ClassId)=>BRANCHES[classId];
type Node=[string,string,string,number];
const nodes:Record<string,Node[]>={
 duelist:[['Точный клинок','Одиночные навыки: точность +2% за ранг.','singleAccuracy',.02],['Тяжёлая рука','Одиночные навыки: урон +3% за ранг.','singleDamage',.03],['Сбережение сил','Одиночные навыки: расход MP −3% за ранг.','singleEconomy',.03],['Длинный выпад','Дальность одиночных ударов +4% за ранг.','singleRange',.04],['Свежая кровь','Урон кровотечения +5% за ранг.','dotDamage',.05]],
 crowd:[['Широкая дуга','Области навыков +4% за ранг.','areaRadius',.04],['Удар по рядам','Массовые навыки: урон +2% за ранг.','areaDamage',.02],['Ритм боя','Массовые навыки: цикл быстрее на 2% за ранг.','areaHaste',.02],['Экономный взмах','Массовые навыки: расход MP −3% за ранг.','areaEconomy',.03],['Подавление','Замедления длятся на 8% дольше за ранг.','controlDuration',.08]],
 guardian:[['Закалка','Входящий урон −2% за ранг.','reduction',.02],['Стойкость','Защитные навыки действуют на 5% дольше за ранг.','defenseDuration',.05],['Бережная защита','Защитные навыки: расход MP −4% за ранг.','defenseEconomy',.04],['Походный шаг','Скорость передвижения +2% за ранг.','movement',.02],['Восстановление','Восстановление HP +5% за ранг.','hpRegen',.05]],
 sniper:[['Верный глаз','Одиночные навыки: точность +2% за ранг.','singleAccuracy',.02],['Тяжёлая стрела','Одиночные навыки: урон +3% за ранг.','singleDamage',.03],['Дальнозоркость','Дальность одиночных выстрелов +3% за ранг.','singleRange',.03],['Бережный выстрел','Одиночные навыки: расход MP −3% за ранг.','singleEconomy',.03],['Выдержка','Защитные навыки действуют на 5% дольше за ранг.','defenseDuration',.05]],
 ranger:[['Сильный яд','Урон яда +5% за ранг.','dotDamage',.05],['Лёгкие шаги','Скорость передвижения +2% за ранг.','movement',.02],['Экономия','Одиночные навыки: расход MP −3% за ранг.','singleEconomy',.03],['Живучесть','Восстановление HP +5% за ранг.','hpRegen',.05],['Ускользание','Входящий урон −2% за ранг.','reduction',.02]],
 hunter:[['Широкий веер','Области навыков +4% за ранг.','areaRadius',.04],['Залп охотника','Массовые навыки: урон +2% за ранг.','areaDamage',.02],['Крепкий капкан','Контроль длится на 8% дольше за ранг.','controlDuration',.08],['Лёгкая тетива','Массовые навыки: цикл быстрее на 2% за ранг.','areaHaste',.02],['Запас стрел','Массовые навыки: расход MP −3% за ранг.','areaEconomy',.03]],
 pyromancer:[['Распространение','Области навыков +4% за ранг.','areaRadius',.04],['Жар','Огненные навыки: урон +3% за ранг.','fireDamage',.03],['Ровное пламя','Массовые навыки: расход MP −3% за ранг.','areaEconomy',.03],['Быстрая формула','Массовые навыки: цикл быстрее на 2% за ранг.','areaHaste',.02],['Восстановление сил','Восстановление MP +4% за ранг.','manaRegen',.04]],
 frostlord:[['Холод','Ледяные навыки: урон +3% за ранг.','iceDamage',.03],['Вечная мерзлота','Замедления/корни длятся на 8% дольше за ранг.','controlDuration',.08],['Иней','Входящий урон −2% за ранг.','reduction',.02],['Сохранение щита','Защитные навыки действуют на 5% дольше за ранг.','defenseDuration',.05],['Бережный покров','Защитные навыки: расход MP −4% за ранг.','defenseEconomy',.04]],
 arcanist:[['Сосредоточенный луч','Урон луча +3% за ранг.','beamDamage',.03],['Чистая энергия','Расход MP луча −3% за ранг.','beamEconomy',.03],['Чародейский запас','Восстановление MP +4% за ранг.','manaRegen',.04],['Точный расчёт','Одиночные навыки: точность +2% за ранг.','singleAccuracy',.02],['Проводимость','Урон молнии +3% за ранг.','lightningDamage',.03]]
};
const keystones:Record<string,[string,string]>={
 duelist:['Поединщик','Одиночные навыки: урон +12%; массовые: −12%.'],crowd:['Ураган','Радиус Вихря +25%, его урон по цели −10%.'],guardian:['Оплот','Входящий урон −10%, весь исходящий урон −10%.'],
 sniper:['Неподвижная цель','Прицельный выстрел: урон +18%, подготовка дольше на 15%.'],ranger:['Затяжной яд','Яд длится на 50% дольше; прямой урон ядовитой стрелы −12%.'],hunter:['Рассыпной залп','Веер и Дождь шире на 25%, их урон по цели −10%.'],
 pyromancer:['Пожарище','Области огня +25%, расход MP огненных навыков +15%.'],frostlord:['Владыка зимы','Ледяной контроль на 25% дольше, прямой урон льда −8%.'],arcanist:['Замкнутый поток','Расход MP луча −20%, дальность −15%.']
};
export const TALENTS:readonly TalentDefinition[]=Object.entries(BRANCHES).flatMap(([classId,branches])=>branches.flatMap(branch=>[
 ...nodes[branch.id].map(([name,description,effect,amount],i)=>({id:`${classId}-${branch.id}-${i+1}`,classId:classId as ClassId,branch:branch.id,name,description,effect,amount,maxRank:2 as const,keystone:false})),
 {id:`${classId}-${branch.id}-mastery`,classId:classId as ClassId,branch:branch.id,name:keystones[branch.id][0],description:keystones[branch.id][1],effect:branch.id,amount:1,maxRank:1 as const,keystone:true}
]));
export const talentPoints=(level:number)=>Math.max(0,Math.min(20,1+Math.floor((level-10)/4)));
export const talentSpent=(build:SkillBuild)=>Object.values(build.talents).reduce((sum,n)=>sum+n,0);
export function defaultSkillBuild(classId:ClassId,level:number):SkillBuild{
 const unlocked=skillsForClass(classId).filter(s=>s.unlockLevel<=level).slice(0,4).map(s=>s.id);
 return {slots:[unlocked[0]??null,unlocked[1]??null,unlocked[2]??null,unlocked[3]??null],talents:{}};
}
export function parseSkillBuild(raw:unknown,classId:ClassId,level:number):SkillBuild|null{
 if(!isRecord(raw)||Object.keys(raw).some(k=>!['slots','talents'].includes(k))||!Array.isArray(raw.slots)||raw.slots.length!==4||!isRecord(raw.talents))return null;
 const slots=raw.slots,ids=slots.filter(x=>x!==null);
 if(new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!Object.hasOwn(SKILLS,id)||SKILLS[id as SkillId].classId!==classId||SKILLS[id as SkillId].unlockLevel>level))return null;
 const talents:Record<string,number>={};let spent=0,keystones=0;
 for(const [id,rank] of Object.entries(raw.talents)){
  const def=TALENTS.find(t=>t.id===id&&t.classId===classId);
  if(!def||typeof rank!=='number'||!Number.isInteger(rank)||rank<0||rank>def.maxRank)return null;
  if(rank){talents[id]=rank;spent+=rank;if(def.keystone)keystones++;}
 }
 if(spent>talentPoints(level)||keystones>1)return null;
 for(const def of TALENTS)if(def.keystone&&talents[def.id]){
  const branchSpent=TALENTS.filter(t=>t.classId===classId&&t.branch===def.branch&&!t.keystone).reduce((n,t)=>n+(talents[t.id]??0),0);
  if(branchSpent<8)return null;
 }
 return {slots:[...slots] as SkillLoadout,talents};
}
export const equippedSkills=(hero:BuildSource):readonly Readonly<SkillDefinition>[] => (hero.skillBuild??defaultSkillBuild(hero.classId,hero.level)).slots.flatMap(id=>id&&SKILLS[id]?.classId===hero.classId&&SKILLS[id].unlockLevel<=hero.level?[effectiveSkill(hero,id)]:[]);
export function talentBonuses(hero:BuildSource):Record<string,number>{
 const result:Record<string,number>={};
 for(const def of TALENTS){const rank=hero.skillBuild?.talents[def.id]??0;if(rank&&def.classId===hero.classId)result[def.effect]=(result[def.effect]??0)+def.amount*rank;}
 return result;
}
export function effectiveSkill(hero:BuildSource,id:SkillId):SkillDefinition{
 const s={...SKILLS[id]},b=talentBonuses(hero),single=s.maxTargets===1,area=s.maxTargets>1,ice=id.includes('frost')||id.includes('ice-'),fire=id==='mage-fireball'||id==='mage-meteor';
 s.damageScale*=1+(single?(b.singleDamage??0):0)+(area?(b.areaDamage??0):0)+(fire?(b.fireDamage??0):0)+(ice?(b.iceDamage??0):0)+(id==='mage-beam'?(b.beamDamage??0):0)+(id==='mage-lightning'?(b.lightningDamage??0):0);
 s.manaCost*=1-(single?(b.singleEconomy??0):0)-(area?(b.areaEconomy??0):0)-(s.kind==='defense'?(b.defenseEconomy??0):0)-(id==='mage-beam'?(b.beamEconomy??0):0);
 if(single)s.range*=1+(b.singleRange??0);
 if(area){s.radius=s.radius===undefined?undefined:s.radius*(1+(b.areaRadius??0));if(s.halfAngle!==undefined)s.range*=1+(b.areaRadius??0);s.durationScale*=1-(b.areaHaste??0);}
 if(s.effectDuration&&s.kind==='defense')s.effectDuration*=1+(b.defenseDuration??0);
 if(b.duelist)s.damageScale*=single?1.12:area?.88:1;
 if(b.crowd&&id==='warrior-whirlwind'){s.range*=1.25;s.damageScale*=.9;}
 if(b.sniper&&id==='archer-aimed'){s.damageScale*=1.18;s.durationScale*=1.15;}
 if(b.ranger&&id==='archer-poison'){s.effectDuration!*=1.5;s.damageScale*=.88;}
 if(b.hunter&&(id==='archer-volley'||id==='archer-rain')){if(s.radius)s.radius*=1.25;s.damageScale*=.9;}
 if(b.pyromancer&&fire){if(s.radius)s.radius*=1.25;s.manaCost*=1.15;}
 if(b.frostlord&&ice)s.damageScale*=.92;
 if(b.arcanist&&id==='mage-beam'){s.manaCost*=.8;s.range*=.85;}
 s.manaCost=Math.round(s.manaCost*100)/100;
 return s;
}
