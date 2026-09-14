// World coordinates are metres. Only this module defines physical obstacles.
const spawns=[{x:7.6,z:1.8},{x:10.4,z:-4},{x:12.4,z:6.4},{x:15.4,z:1.4},{x:18.2,z:-6.2},{x:20.7,z:4.9},{x:25,z:-1.2}];
let seed=917493;
const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
const trees=[];
for(let i=0;i<150;i++){
  const edge=i<65;let x=edge?-14+random()*50:-10+random()*40,z=(random()-.5)*(edge?43:28);
  if(edge&&x>-12&&x<32&&Math.abs(z)<16)z=(z>0?1:-1)*(16+random()*6);
  const path=Math.abs(z-1-Math.sin(x*.25)*.9);
  const coversFight=spawns.some(s=>{const dx=x-s.x,dz=z-s.z,depth=dx*Math.sin(.55)+dz*Math.cos(.55),side=dx*Math.cos(.55)-dz*Math.sin(.55);return depth>0&&depth<7&&Math.abs(side)<2.8;});
  const coversTrail=x>2&&x<29&&z>1+Math.sin(x*.25)*.9&&path<7;
  if(!edge&&(path<3||coversFight||coversTrail||Math.hypot(x+1,z)<7||spawns.some(s=>Math.hypot(s.x-x,s.z-z)<3)||Math.hypot(x-25,z+1.2)<4.5))continue;
  trees.push(Object.freeze({x,z,s:.7+random()*.55,solid:!edge}));
}
export const TREE_POSITIONS=Object.freeze(trees);
export const OBSTACLES=Object.freeze([
  {x:-5,z:-4.6,w:4.8,d:4},{x:-2.3,z:-.6,r:1.02},{x:-4,z:-.5,r:.6},{x:-2.1,z:-2.25,r:.6},{x:-.4,z:-4.2,r:.6},
  ...[[22.6,-3.4],[28,-3.4],[28,2.5]].map(([x,z])=>({x,z,r:.42})),
  ...[[23,-4.7,2.3],[27,-4.7,2],[28.8,.3,.6]].map(([x,z,w])=>({x,z,w,d:.6})),
  ...[[8.5,-8,.85],[14,10,.9],[18.5,6.5,.65],[20,-10,1.1],[29,8,.8],[10,-11,.6]].map(([x,z,r])=>({x,z,r:r*.8})),
  ...trees.filter(t=>t.solid).map(({x,z})=>({x,z,r:.32}))
].map(Object.freeze));
