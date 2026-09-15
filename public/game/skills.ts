import type {ClassId, SkillId} from '../../shared/types.js';

/** Shared presentation metadata and authoritative combat limits. */
export interface SkillDefinition {
  id: SkillId; classId: ClassId; slot: '1' | '2' | '3' | '4'; name: string; description: string;
  manaCost: number; cooldown: number; durationScale: number; hitFraction: number;
  damageScale: number; range: number; radius?: number; halfAngle?: number;
  maxTargets: number; projectileSpeed?: number;
}
export const SKILLS: Readonly<Record<SkillId, Readonly<SkillDefinition>>> = Object.freeze({
  'warrior-cleave': {id:'warrior-cleave',classId:'warrior',slot:'1',name:'Рассечение',description:'Удар сектором перед собой, до 3 целей.',manaCost:9,cooldown:0,durationScale:1.05,hitFraction:.52,damageScale:1.13,range:2.25,halfAngle:.78,maxTargets:3},
  'warrior-whirlwind': {id:'warrior-whirlwind',classId:'warrior',slot:'2',name:'Вихрь',description:'Круговой удар по 4 ближайшим целям.',manaCost:12,cooldown:0,durationScale:1.2,hitFraction:.58,damageScale:.95,range:2.5,halfAngle:Math.PI,maxTargets:4},
  'archer-piercing': {id:'archer-piercing',classId:'archer',slot:'1',name:'Пробивная стрела',description:'Стрела проходит сквозь 3 цели на одной линии.',manaCost:12,cooldown:0,durationScale:1.15,hitFraction:.48,damageScale:1.15,range:6.5,maxTargets:3,projectileSpeed:15},
  'archer-volley': {id:'archer-volley',classId:'archer',slot:'2',name:'Веерный залп',description:'Три расходящиеся стрелы, каждая цель поражается один раз.',manaCost:14,cooldown:0,durationScale:1.25,hitFraction:.54,damageScale:.78,range:5.8,maxTargets:3,projectileSpeed:13},
  'mage-fireball': {id:'mage-fireball',classId:'mage',slot:'1',name:'Огненный шар',description:'Снаряд и взрыв радиусом 1,65, до 4 целей.',manaCost:17,cooldown:0,durationScale:1.2,hitFraction:.52,damageScale:1.1,range:5.8,radius:1.65,maxTargets:4,projectileSpeed:9},
  'mage-frost': {id:'mage-frost',classId:'mage',slot:'2',name:'Морозный импульс',description:'Волна вокруг мага: до 4 целей, замедление на 2 секунды.',manaCost:18,cooldown:0,durationScale:1.3,hitFraction:.62,damageScale:.92,range:2.5,halfAngle:Math.PI,maxTargets:4},
  'warrior-thrust': {id:'warrior-thrust',classId:'warrior',slot:'3',name:'Выпад',description:'Сильный узкий выпад по одной цели перед собой.',manaCost:10,cooldown:0,durationScale:1.15,hitFraction:.57,damageScale:1.3,range:3,halfAngle:.33,maxTargets:1},
  'warrior-shockwave': {id:'warrior-shockwave',classId:'warrior',slot:'4',name:'Ударная волна',description:'Узкая волна земли впереди, до 4 целей.',manaCost:22,cooldown:9,durationScale:1.4,hitFraction:.67,damageScale:1.5,range:4.2,halfAngle:.36,maxTargets:4},
  'archer-frost-shot': {id:'archer-frost-shot',classId:'archer',slot:'3',name:'Морозная стрела',description:'Одна дальняя стрела замедляет цель на 2,5 секунды.',manaCost:12,cooldown:0,durationScale:1.2,hitFraction:.52,damageScale:1.13,range:7.2,maxTargets:1,projectileSpeed:14},
  'archer-rain': {id:'archer-rain',classId:'archer',slot:'4',name:'Дождь стрел',description:'Через 0,45 с поражает до 4 целей в области впереди.',manaCost:26,cooldown:10,durationScale:1.45,hitFraction:.61,damageScale:1.18,range:5.3,radius:1.75,maxTargets:4},
  'mage-lightning': {id:'mage-lightning',classId:'mage',slot:'3',name:'Цепная молния',description:'Ток перескакивает между 3 близкими целями с падением урона.',manaCost:18,cooldown:0,durationScale:1.28,hitFraction:.55,damageScale:1.08,range:5.2,radius:1.9,maxTargets:3},
  'mage-meteor': {id:'mage-meteor',classId:'mage',slot:'4',name:'Метеор',description:'Через 0,7 с падает в область впереди, до 5 целей.',manaCost:38,cooldown:12,durationScale:1.6,hitFraction:.65,damageScale:1.72,range:5.1,radius:1.9,maxTargets:5},
});
export const skillsForClass=(classId: ClassId): readonly Readonly<SkillDefinition>[] => Object.values(SKILLS).filter(skill=>skill.classId===classId);
export const legacySkillId=(classId: ClassId): SkillId => classId==='warrior'?'warrior-whirlwind':classId==='archer'?'archer-piercing':'mage-fireball';
