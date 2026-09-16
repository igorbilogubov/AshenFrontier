import {WASTELAND_BOUNDS,WASTELAND_ROADS,WASTELAND_LANDMARKS} from './wasteland.js';
import {SNOW_BOUNDS,SNOW_ROADS,SNOW_LANDMARKS} from './snow.js';
import {WORLD_BOUNDS,WORLD_CLEARINGS,WORLD_ROADS,WORLD_LANDMARKS,locationAt} from './world-layout.js';
import {STADIUM_BOUNDS,STADIUM_PENS,STADIUM_HUB} from './stadium.js';
import type {Position} from './motion.js';

/** Draw before actors/AFK rings; coordinates match scene.mapPosition's padding. */
export function drawWorldMapBackdrop(ctx:CanvasRenderingContext2D,width:number,height:number,position:Position={x:0,z:0}){
  if(locationAt(position)==='wasteland'){drawWastelandMap(ctx,width,height);return;}
  if(locationAt(position)==='snow'){drawSnowMap(ctx,width,height);return;}
  if(locationAt(position)==='stadium'){drawStadiumMap(ctx,width,height);return;}
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

function drawStadiumMap(ctx:CanvasRenderingContext2D,width:number,height:number){
  const sx=(width-20)/(STADIUM_BOUNDS.maxX-STADIUM_BOUNDS.minX),sz=(height-16)/(STADIUM_BOUNDS.maxZ-STADIUM_BOUNDS.minZ);
  const at=(p:Position)=>({x:10+(p.x-STADIUM_BOUNDS.minX)*sx,y:8+(p.z-STADIUM_BOUNDS.minZ)*sz});
  ctx.save();ctx.clearRect(0,0,width,height);ctx.fillStyle='#303d3a';ctx.fillRect(0,0,width,height);
  ctx.strokeStyle='#9c9a80';ctx.lineWidth=1.2;ctx.strokeRect(10,8,width-20,height-16);
  for(const pen of STADIUM_PENS){
    const p=at(pen),left=p.x-pen.width*sx/2,top=p.y-pen.depth*sz/2;
    ctx.fillStyle=pen.tint;ctx.globalAlpha=.35;ctx.fillRect(left,top,pen.width*sx,pen.depth*sz);ctx.globalAlpha=1;
    ctx.strokeStyle=pen.tint;ctx.beginPath();ctx.moveTo(p.x-2.4*sx,top+pen.depth*sz);ctx.lineTo(left,top+pen.depth*sz);ctx.lineTo(left,top);ctx.lineTo(left+pen.width*sx,top);ctx.lineTo(left+pen.width*sx,top+pen.depth*sz);ctx.lineTo(p.x+2.4*sx,top+pen.depth*sz);ctx.stroke();
    ctx.fillStyle='#e1d6b8';ctx.font='bold 9px Georgia';ctx.textAlign='center';ctx.fillText(pen.rank,p.x,top-3);
  }
  const hub=at(STADIUM_HUB);ctx.strokeStyle='#bdac7b';ctx.beginPath();ctx.ellipse(hub.x,hub.y,STADIUM_HUB.r*sx,STADIUM_HUB.r*sz,0,0,Math.PI*2);ctx.stroke();
  ctx.restore();
}

function drawSnowMap(ctx:CanvasRenderingContext2D,width:number,height:number){
  const sx=(width-20)/(SNOW_BOUNDS.maxX-SNOW_BOUNDS.minX),sz=(height-16)/(SNOW_BOUNDS.maxZ-SNOW_BOUNDS.minZ);
  const at=(p:Position)=>({x:10+(p.x-SNOW_BOUNDS.minX)*sx,y:8+(p.z-SNOW_BOUNDS.minZ)*sz});
  ctx.save();ctx.clearRect(0,0,width,height);ctx.fillStyle='#334b57';ctx.fillRect(0,0,width,height);
  const lake=at({x:367,z:39});ctx.fillStyle='#567f90';ctx.beginPath();ctx.ellipse(lake.x,lake.y,15*sx,8*sz,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#a4bfca';ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=1.4;
  for(const road of SNOW_ROADS){ctx.beginPath();road.points.forEach((point,i)=>{const p=at(point);if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});ctx.stroke();}
  for(const landmark of SNOW_LANDMARKS){const p=at(landmark);ctx.strokeRect(p.x-2,p.y-2,4,4);}ctx.restore();
}

function drawWastelandMap(ctx:CanvasRenderingContext2D,width:number,height:number){
 const sx=(width-20)/160,sz=(height-16)/160,at=(p:Position)=>({x:10+(p.x-WASTELAND_BOUNDS.minX)*sx,y:8+(p.z-WASTELAND_BOUNDS.minZ)*sz});
 ctx.save();ctx.clearRect(0,0,width,height);ctx.fillStyle='#3d3a30';ctx.fillRect(0,0,width,height);ctx.strokeStyle='#bca27d';ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=1.4;
 for(const road of WASTELAND_ROADS){ctx.beginPath();road.points.forEach((p,i)=>{const q=at(p);if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);});ctx.stroke();}
 for(const mark of WASTELAND_LANDMARKS){const p=at(mark);ctx.strokeStyle='#cfb786';ctx.strokeRect(p.x-2,p.y-2,4,4);}
 const camp=at({x:526,z:0});ctx.fillStyle='#839e91';ctx.beginPath();ctx.ellipse(camp.x,camp.y,6*sx,6*sz,0,0,Math.PI*2);ctx.fill();ctx.restore();
}
