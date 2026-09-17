/** One enlarged hunting pack per ordinary species. Extra homes append after dungeons. */
export const LARGE_SPOT_RADIUS=8.4;
export const LARGE_PACK_EXTRA=6;
export const LARGE_PACK_SIZE=12;
export const FOREST_PACK_BASE=855;
export const SNOW_PACK_BASE=873;
export const WASTELAND_PACK_BASE=897;
export const LATE_PACK_BASE=921;
export function packRing(x:number,z:number,radius=6.2,phase=.5):readonly (readonly [number,number])[]{
  return Object.freeze(Array.from({length:LARGE_PACK_EXTRA},(_,i)=>{
    const a=(i+phase)*Math.PI/3;
    return Object.freeze([x+Math.cos(a)*radius,z+Math.sin(a)*radius] as const);
  }));
}
export function extraIds(base:number,rank:number):readonly number[]{
  return Object.freeze(Array.from({length:LARGE_PACK_EXTRA},(_,j)=>base+rank*LARGE_PACK_EXTRA+j));
}
