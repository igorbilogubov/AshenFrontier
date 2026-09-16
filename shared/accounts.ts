import type {ClassId} from './types.js';

export const MAX_CHARACTERS=5;
export interface Account {id:string;email:string;name:string}
export interface CharacterSummary {id:string;name:string;classId:ClassId;level:number}
export interface GoogleIdentity {sub:string;email:string;name:string}
