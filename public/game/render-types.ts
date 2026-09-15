import type {ClassId,HeroAttack,WeaponId} from '../../shared/types.js';
/** Animation consumes presentation state, independent of inventory and transport. */
export interface WarriorPose {
  weapon:WeaponId; classId?:ClassId; dead:number|boolean;
  attack:Pick<HeroAttack,'age'|'duration'> & {id?:number} | null;
  moveBlend:number; runBlend:number; gait:number; hurt:number;
}
