import type {ClassId,HeroAttack,WeaponId,ItemAppearance} from '../../shared/types.js';
/** Animation consumes presentation state, independent of inventory and transport. */
export interface WarriorPose {
  appearance?:ItemAppearance; weapon:WeaponId; classId?:ClassId; dead:number|boolean;
  attack:Pick<HeroAttack,'age'|'duration'> & {id?:number;skillId?:HeroAttack['skillId']} | null;
  moveBlend:number; runBlend:number; gait:number; hurt:number;
}
