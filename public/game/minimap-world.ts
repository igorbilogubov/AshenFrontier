import {lateRegionAt} from './late-world.js';
import {dungeonAt} from './dungeons.js';
import {WASTELAND_ROADS} from './wasteland.js';
import {SNOW_ROADS} from './snow.js';
import {WORLD_CLEARINGS,WORLD_ROADS,boundsForPosition,locationAt} from './world-layout.js';
import {STADIUM_PENS,STADIUM_HUB} from './stadium.js';
import type {Position} from './motion.js';

/** One projection for scenery and markers; equal world distances stay equal on screen. */
export function minimapProjection(width:number,height:number,position:Position){
  const bounds=boundsForPosition(position);
  const scale=Math.max(0,Math.min((width-28)/(bounds.maxX-bounds.minX),(height-28)/(bounds.maxZ-bounds.minZ)));
  const left=(width-(bounds.maxX-bounds.minX)*scale)/2,top=(height-(bounds.maxZ-bounds.minZ)*scale)/2;
  return {bounds,scale,left,top,at:(p:Position)=>({x:left+(p.x-bounds.minX)*scale,y:top+(p.z-bounds.minZ)*scale})};
}

/** Muted geometry keeps points of interest more prominent than scenery. */
export function drawWorldMapBackdrop(ctx:CanvasRenderingContext2D,width:number,height:number,position:Position={x:0,z:0}){
  const {bounds,scale,left,top,at}=minimapProjection(width,height,position),location=locationAt(position);
  const late=lateRegionAt(position),dungeon=dungeonAt(position);
  const w=(bounds.maxX-bounds.minX)*scale,h=(bounds.maxZ-bounds.minZ)*scale;
  ctx.save();ctx.clearRect(0,0,width,height);ctx.fillStyle='#111b1e';ctx.fillRect(0,0,width,height);
  ctx.fillStyle=dungeon?'#20272c':location==='snow'?'#23343f':location==='wasteland'?'#342f26':'#20302b';ctx.fillRect(left,top,w,h);
  ctx.strokeStyle='#455653';ctx.lineWidth=1;ctx.strokeRect(left,top,w,h);
  ctx.beginPath();ctx.rect(left,top,w,h);ctx.clip();
  if(location==='forest')for(const field of WORLD_CLEARINGS){const p=at(field);ctx.fillStyle=field.id==='camp'?'#435345':'#2d4236';ctx.beginPath();ctx.arc(p.x,p.y,field.radius*scale,0,Math.PI*2);ctx.fill();}
  const roads=late?.roads??(location==='forest'?WORLD_ROADS:location==='snow'?SNOW_ROADS:location==='wasteland'?WASTELAND_ROADS:[]);
  ctx.strokeStyle='#6d7969';ctx.lineCap='round';ctx.lineJoin='round';
  for(const road of roads){ctx.lineWidth=Math.max(1.2,road.width*scale*.45);ctx.beginPath();road.points.forEach((point,i)=>{const p=at(point);if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});ctx.stroke();}
  if(location==='stadium'){
    for(const pen of STADIUM_PENS){const p=at(pen);ctx.fillStyle='#2f4140';ctx.fillRect(p.x-pen.width*scale/2,p.y-pen.depth*scale/2,pen.width*scale,pen.depth*scale);ctx.strokeStyle='#71857c';ctx.lineWidth=1.2;ctx.strokeRect(p.x-pen.width*scale/2,p.y-pen.depth*scale/2,pen.width*scale,pen.depth*scale);}
    const hub=at(STADIUM_HUB);ctx.strokeStyle='#7c8067';ctx.beginPath();ctx.arc(hub.x,hub.y,STADIUM_HUB.r*scale,0,Math.PI*2);ctx.stroke();
  }
  if(dungeon){
    const entry=at(dungeon.entry);ctx.fillStyle='#31473b';ctx.fillRect(left,top,17*scale,h);
    ctx.fillStyle='#f0dc9f';ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText('ВХОД',entry.x,top+12);
    for(const wall of dungeon.walls){const p=at(wall);ctx.fillStyle='#677573';ctx.fillRect(p.x-(wall.w??1.6)*scale/2,p.y-(wall.d??1.6)*scale/2,Math.max(1,(wall.w??1.6)*scale),Math.max(1,(wall.d??1.6)*scale));}
  }
  ctx.restore();
}
