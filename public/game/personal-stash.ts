export const PERSONAL_CHEST=Object.freeze({id:'camp-chest',name:'Личный сундук',x:-4,z:-5.4,range:1.5});
// The chest has its own collider; the west side is the walkable interaction face.
export const CHEST_APPROACH=Object.freeze({x:-5.05,z:-5.4});
export const CHEST_DOOR_OUTSIDE=Object.freeze({x:-5.65,z:-2.2});
export const CHEST_DOOR_INSIDE=Object.freeze({x:-5.65,z:-3.1});
export const inChestRoom=(p:{x:number;z:number})=>p.x>-7.3&&p.x<-2.7&&p.z>-6.5&&p.z<-2.7;
