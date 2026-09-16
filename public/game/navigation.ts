import {stand,distance} from './location.js';
import {sameLocation,boundsForPosition} from './world-layout.js';
import type {Point} from '../../shared/types.js';
/** Body-width clearance, unlike projectile line of sight. */
export function walkSegment(a:Point,b:Point){
 if(!sameLocation(a,b))return false;
 const n=Math.max(1,Math.ceil(distance(a,b)/.3));
 for(let i=1;i<=n;i++)if(!stand(a.x+(b.x-a.x)*i/n,a.z+(b.z-a.z)*i/n))return false;
 return true;
}
/** Bounded A* on metre grid; the client never supplies a trusted route. */
export function findWalkPath(start:Point,goal:Point):Point[]|null {
 if(!sameLocation(start,goal)||!stand(goal.x,goal.z))return null;
 if(walkSegment(start,goal))return [{...goal}];
 const bounds=boundsForPosition(start),width=Math.ceil(bounds.maxX-bounds.minX)+1;
 const key=(p:Point)=>Math.round(p.z-bounds.minZ)*width+Math.round(p.x-bounds.minX);
 const valid=new Map<number,boolean>();
 const allowed=(p:Point)=>{const id=key(p);if(!valid.has(id))valid.set(id,p.x>bounds.minX&&p.x<bounds.maxX&&p.z>bounds.minZ&&p.z<bounds.maxZ&&stand(p.x,p.z));return valid.get(id)!;};
 type Node=Point&{g:number;f:number;parent:Node|null};
 const heap:Node[]=[],best=new Map<number,number>();
 const push=(n:Node)=>{let i=heap.length;heap.push(n);while(i){const parent=(i-1)>>1;if(heap[parent].f<=n.f)break;heap[i]=heap[parent];i=parent;}heap[i]=n;};
 const pop=()=>{const n=heap[0],last=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].f<heap[c].f)c++;if(heap[c].f>=last.f)break;heap[i]=heap[c];i=c;}heap[i]=last;}return n;};
 const sx=Math.round(start.x),sz=Math.round(start.z);
 for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const p={x:sx+dx,z:sz+dz};if(allowed(p)&&walkSegment(start,p)){const g=distance(start,p);best.set(key(p),g);push({...p,g,f:g+distance(p,goal),parent:null});}}
 for(let visits=0;heap.length&&visits<12000;visits++){
  const n=pop();if(n.g!==best.get(key(n)))continue;
  if(distance(n,goal)<=1.6&&walkSegment(n,goal)){
   const route:Point[]=[goal];for(let p:Node|null=n;p;p=p.parent)route.push({x:p.x,z:p.z});route.reverse();
   const smooth:Point[]=[];let previous=start;
   for(let i=0;i<route.length;){let j=i;while(j+1<route.length&&walkSegment(previous,route[j+1]))j++;smooth.push(route[j]);previous=route[j];i=j+1;}
   return smooth;
  }
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
   if(!dx&&!dz)continue;const p={x:n.x+dx,z:n.z+dz};if(!allowed(p))continue;
   const g=n.g+Math.hypot(dx,dz),id=key(p);if(g>=(best.get(id)??Infinity)||!walkSegment(n,p))continue;
   best.set(id,g);push({...p,g,f:g+distance(p,goal),parent:n});
  }
 }
 return null;
}
