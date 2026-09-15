import {WORLD_BOUNDS,WORLD_CLEARINGS,WORLD_ROADS,WORLD_LANDMARKS} from './world-layout.js';
import type {Position} from './motion.js';

/** Draw before actors/AFK rings; coordinates match scene.mapPosition's padding. */
export function drawWorldMapBackdrop(ctx:CanvasRenderingContext2D,width:number,height:number){
  const sx=(width-20)/(WORLD_BOUNDS.maxX-WORLD_BOUNDS.minX),sz=(height-16)/(WORLD_BOUNDS.maxZ-WORLD_BOUNDS.minZ);
  const at=(p:Position)=>({x:10+(p.x-WORLD_BOUNDS.minX)*sx,y:8+(p.z-WORLD_BOUNDS.minZ)*sz});
  ctx.save();ctx.clearRect(0,0,width,height);ctx.fillStyle='#1c3027';ctx.fillRect(0,0,width,height);
  for(const field of WORLD_CLEARINGS){const p=at(field);ctx.fillStyle=field.id==='camp'?'#50624a':'#3c5140';ctx.beginPath();ctx.ellipse(p.x,p.y,field.radius*sx,field.radius*sz,0,0,Math.PI*2);ctx.fill();}
  ctx.strokeStyle='#948368';ctx.lineCap='round';ctx.lineJoin='round';
  for(const road of WORLD_ROADS){ctx.lineWidth=Math.max(.9,road.width*Math.min(sx,sz)*.5);ctx.beginPath();road.points.forEach((point,i)=>{const p=at(point);if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);});ctx.stroke();}
  ctx.strokeStyle='#c2b99a';ctx.lineWidth=1;
  for(const landmark of WORLD_LANDMARKS){const p=at(landmark);ctx.strokeRect(p.x-2,p.y-2,4,4);}
  const camp=at({x:-1,z:0});ctx.fillStyle='#d6c39c';ctx.fillRect(camp.x-2,camp.y-2,4,4);
  const ruin=at({x:25,z:-1.2});ctx.strokeStyle='#b59c74';ctx.strokeRect(ruin.x-3,ruin.y-3,6,6);
  ctx.restore();
}
