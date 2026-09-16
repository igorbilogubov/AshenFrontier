import {TRAVEL_PORTALS} from './travel.js';
import {AFK_SPOTS} from './afk.js';
import {ALL_PORTALS} from './stadium.js';
import {sameLocation} from './world-layout.js';
import {drawWorldMapBackdrop,minimapProjection} from './minimap-world.js';
import type {Point,PublicMob,PublicPlayer,SelfSnapshot} from '../../shared/types.js';

export interface MinimapGame {
  player:Pick<SelfSnapshot,'x'|'z'|'yaw'|'afk'|'afkRadius'>;
  mobs:readonly Pick<PublicMob,'x'|'z'|'state'|'eliteId'|'bossId'>[];
  players:readonly Pick<PublicPlayer,'x'|'z'|'id'>[];
  id:string|null;
}
export const MINIMAP_LEGEND=Object.freeze([
  {kind:'travel',symbol:'◎',label:'Телепорт',color:'#8cf6e1'},
  {kind:'spot',symbol:'①',label:'Споты',color:'#a3e9ac'},
  {kind:'dungeon',symbol:'▣',label:'Данж / выход',color:'#dab5ff'},
  {kind:'passage',symbol:'➜',label:'Переход',color:'#8de6ec'},
  {kind:'stadium',symbol:'◇',label:'Стадиум',color:'#9fbfff'},
  {kind:'elite',symbol:'◆',label:'Элита',color:'#ffcd74'},
  {kind:'boss',symbol:'♛',label:'Босс',color:'#ec9dff'},
  {kind:'player',symbol:'▲',label:'Вы',color:'#fff2c9'},
] as const);
type MarkerKind=Exclude<typeof MINIMAP_LEGEND[number]['kind'],'player'>;
interface MapMarker extends Point {id:string;kind:MarkerKind;label:string;radius?:number;number?:number}
const COLORS=Object.fromEntries(MINIMAP_LEGEND.map(entry=>[entry.kind,entry.color])) as Record<typeof MINIMAP_LEGEND[number]['kind'],string>;

/** Ordinary mobs never enter the rendering list, even if a full-world snapshot is supplied. */
export function minimapMarkers(position:Point,mobs:MinimapGame['mobs']):MapMarker[]{
  const spots:MapMarker[]=AFK_SPOTS.filter(spot=>sameLocation(spot,position)).map((spot,i)=>({...spot,kind:'spot',label:spot.name,number:i+1}));
  const portals:MapMarker[]=ALL_PORTALS.filter(portal=>sameLocation(portal,position)).map(portal=>{
    const kind=portal.id.includes('dungeon')?'dungeon':portal.id.includes('stadium')?'stadium':'passage';
    const label=kind==='dungeon'?(portal.id.startsWith('enter-')?`Данж ${portal.minLevel??1}+`:'Выход'):portal.destinationName;
    return {...portal,kind,label};
  });
  const enemies:MapMarker[]=mobs.filter(mob=>mob.state!=='dead'&&(mob.eliteId||mob.bossId)&&sameLocation(mob,position)).map((mob,i)=>({...mob,id:`enemy-${i}`,kind:mob.bossId?'boss':'elite',label:''}));
  const travel:MapMarker[]=TRAVEL_PORTALS.filter(portal=>sameLocation(portal,position)).map(portal=>({...portal,kind:'travel',label:'Телепорт'}));
  return [...spots,...portals,...travel,...enemies];
}

interface Box {x:number;y:number;w:number;h:number}
const overlaps=(a:Box,b:Box)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;

export function drawMinimap(ctx:CanvasRenderingContext2D,width:number,height:number,game:MinimapGame){
  drawWorldMapBackdrop(ctx,width,height,game.player);
  const {at,scale}=minimapProjection(width,height,game.player),markers=minimapMarkers(game.player,game.mobs);
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  // Rings retain the real spot radius; numbered badges stay readable at any world scale.
  for(const marker of markers)if(marker.kind==='spot'){
    const p=at(marker);ctx.fillStyle='#87d69b22';ctx.strokeStyle='#97dbaa';ctx.lineWidth=1.3;
    ctx.beginPath();ctx.arc(p.x,p.y,Math.max(9,(marker.radius??0)*scale),0,Math.PI*2);ctx.fill();ctx.stroke();
  }
  if(game.player.afk){
    const p=at(game.player.afk.anchor??game.player);ctx.strokeStyle='#f1dfa0';ctx.lineWidth=1.5;ctx.setLineDash([3,3]);ctx.beginPath();ctx.arc(p.x,p.y,(game.player.afkRadius??0)*scale,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
  }
  const occupied:Box[]=markers.map(marker=>{const p=at(marker);return {x:p.x-9,y:p.y-9,w:18,h:18};});
  const hero=at(game.player);occupied.push({x:hero.x-9,y:hero.y-9,w:18,h:18});
  for(const marker of markers){
    const p=at(marker),color=COLORS[marker.kind];
    ctx.fillStyle='#122022';ctx.strokeStyle=color;ctx.lineWidth=2;
    if(marker.kind==='spot'){
      ctx.beginPath();ctx.arc(p.x,p.y,6.5,0,Math.PI*2);ctx.fill();ctx.fillStyle=color;ctx.font='bold 10px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(marker.number),p.x,p.y+.5);
    }else if(marker.kind==='travel'){
      ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.stroke();
    }else if(marker.kind==='dungeon'){
      ctx.fillRect(p.x-6,p.y-7,12,14);ctx.strokeRect(p.x-6,p.y-7,12,14);ctx.fillStyle=color;ctx.fillRect(p.x-2,p.y-3,4,10);
    }else if(marker.kind==='passage'){
      ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(p.x-3,p.y);ctx.lineTo(p.x+3,p.y);ctx.moveTo(p.x,p.y-3);ctx.lineTo(p.x+3,p.y);ctx.lineTo(p.x,p.y+3);ctx.stroke();
    }else if(marker.kind==='boss'){
      ctx.beginPath();ctx.moveTo(p.x-6,p.y+5);ctx.lineTo(p.x-7,p.y-5);ctx.lineTo(p.x-3,p.y-1);ctx.lineTo(p.x,p.y-7);ctx.lineTo(p.x+3,p.y-1);ctx.lineTo(p.x+7,p.y-5);ctx.lineTo(p.x+6,p.y+5);ctx.closePath();ctx.fill();ctx.stroke();
    }else{
      const radius=marker.kind==='elite'?5:7;ctx.beginPath();ctx.moveTo(p.x,p.y-radius);ctx.lineTo(p.x+radius,p.y);ctx.lineTo(p.x,p.y+radius);ctx.lineTo(p.x-radius,p.y);ctx.closePath();if(marker.kind==='elite')ctx.fillStyle=color;ctx.fill();ctx.stroke();
    }
  }
  // Place route names only in empty space; never cover an icon to fit a label.
  ctx.font='bold 10px sans-serif';ctx.textBaseline='middle';ctx.textAlign='left';
  for(const marker of markers.filter(m=>m.kind==='dungeon'||m.kind==='passage'||m.kind==='stadium'||m.kind==='travel')){
    const p=at(marker),w=ctx.measureText(marker.label).width+8,h=16;
    const candidates=[{x:p.x-w/2,y:p.y+11,w,h},{x:p.x-w/2,y:p.y-27,w,h},{x:p.x+12,y:p.y-8,w,h},{x:p.x-w-12,y:p.y-8,w,h}];
    const box=candidates.find(b=>b.x>=3&&b.y>=3&&b.x+b.w<=width-3&&b.y+b.h<=height-3&&!occupied.some(other=>overlaps(b,other)));
    if(!box)continue;occupied.push(box);ctx.fillStyle='#0e181ded';ctx.fillRect(box.x,box.y,w,h);ctx.fillStyle=COLORS[marker.kind];ctx.fillText(marker.label,box.x+4,box.y+8);
  }
  for(const other of game.players){
    if(other.id===game.id||!sameLocation(other,game.player))continue;
    const p=at(other);ctx.fillStyle='#92cddd';ctx.strokeStyle='#10191d';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fill();ctx.stroke();
  }
  ctx.translate(hero.x,hero.y);ctx.rotate(-game.player.yaw);ctx.fillStyle=COLORS.player;ctx.strokeStyle='#10191d';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(0,8);ctx.lineTo(-5,-5);ctx.lineTo(0,-2);ctx.lineTo(5,-5);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
}
