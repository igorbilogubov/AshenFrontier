import type {ClassId, SkillId} from '../../shared/types.js';

/** Shared presentation metadata and authoritative combat limits. */
export interface SkillDefinition {
  id: SkillId; classId: ClassId; slot: 'Q' | 'E'; name: string; description: string;
  manaCost: number; cooldown: number; durationScale: number; hitFraction: number;
  damageScale: number; range: number; radius?: number; halfAngle?: number;
  maxTargets: number; projectileSpeed?: number;
}
export const SKILLS: Readonly<Record<SkillId, Readonly<SkillDefinition>>> = Object.freeze({
  'warrior-cleave': {id:'warrior-cleave',classId:'warrior',slot:'Q',name:'Рассечение',description:'Удар сектором перед собой, до 3 целей.',manaCost:10,cooldown:4,durationScale:1.05,hitFraction:.52,damageScale:1.35,range:2.25,halfAngle:.78,maxTargets:3},
  'warrior-whirlwind': {id:'warrior-whirlwind',classId:'warrior',slot:'E',name:'Вихрь',description:'Круговой удар по 4 ближайшим целям.',manaCost:12,cooldown:5,durationScale:1.2,hitFraction:.58,damageScale:1.2,range:2.5,halfAngle:Math.PI,maxTargets:4},
  'archer-piercing': {id:'archer-piercing',classId:'archer',slot:'Q',name:'Пробивная стрела',description:'Стрела проходит сквозь 3 цели на одной линии.',manaCost:16,cooldown:5,durationScale:1.15,hitFraction:.48,damageScale:1.35,range:6.5,maxTargets:3,projectileSpeed:15},
  'archer-volley': {id:'archer-volley',classId:'archer',slot:'E',name:'Веерный залп',description:'Три расходящиеся стрелы, каждая цель поражается один раз.',manaCost:20,cooldown:7,durationScale:1.25,hitFraction:.54,damageScale:.82,range:5.8,maxTargets:3,projectileSpeed:13},
  'mage-fireball': {id:'mage-fireball',classId:'mage',slot:'Q',name:'Огненный шар',description:'Снаряд и взрыв радиусом 1,65, до 4 целей.',manaCost:24,cooldown:5,durationScale:1.2,hitFraction:.52,damageScale:1.4,range:5.8,radius:1.65,maxTargets:4,projectileSpeed:9},
  'mage-frost': {id:'mage-frost',classId:'mage',slot:'E',name:'Морозный импульс',description:'Волна вокруг мага: до 4 целей, замедление на 2 секунды.',manaCost:28,cooldown:8,durationScale:1.3,hitFraction:.62,damageScale:1.05,range:2.5,halfAngle:Math.PI,maxTargets:4},
});
export const skillsForClass=(classId: ClassId): readonly Readonly<SkillDefinition>[] => Object.values(SKILLS).filter(skill=>skill.classId===classId);
export const legacySkillId=(classId: ClassId): SkillId => classId==='warrior'?'warrior-whirlwind':classId==='archer'?'archer-piercing':'mage-fireball';
