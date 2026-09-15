import {defaultAfkPreferences} from './afk-preferences.js';
import {moveHero,stand} from './location.js';
import {sameLocation} from './world-layout.js';
import {characterStats} from '../rules.js';
import type {SelfSnapshot,PublicPlayer,PublicMob,PublicProjectile,WorldEvent,ChatEntry,ClientMessage,ServerMessage,ClassId,WeaponId,HeroInput,SkillId,GroundDrop} from '../../shared/types.js';

export type ClientPlayer=SelfSnapshot & {coins:number};
export interface ConnectionOptions {name?:string;classId?:ClassId;token?:string}
export type NetworkStatus='connecting'|'online'|'error';
type InputFrame=Extract<ClientMessage,{type:'input'}>;
type SaveState=Extract<ServerMessage,{type:'state'}>['save'];
interface LegacyLoot {id:number;x:number;z:number}
function initialPlayer():ClientPlayer {
  return {...characterStats({classId:'warrior',level:1}),afkPreferences:defaultAfkPreferences('warrior'),schemaVersion:3,id:'',name:'Странник',classId:'warrior',level:1,
    x:.5,z:4,yaw:Math.PI*.25,targetYaw:Math.PI*.25,vx:0,vz:0,gait:0,moveBlend:0,runBlend:0,hp:100,weapon:'sword',potions:3,
    coins:0,gold:0,xp:0,kills:0,attack:null,dead:0,hurt:0,items:[],pendingItems:[],stash:[],equipment:{},mana:40,manaPotions:3,
    potionCooldown:0,manaPotionCooldown:0,specialCooldown:0,combatUntil:0,attackSerial:0,running:false,questKills:0,boss:false,questClaimed:false,ack:0};
}


export class NetworkGame{
  player:ClientPlayer;
  mobs:PublicMob[];players:PublicPlayer[];projectiles:PublicProjectile[];loot:LegacyLoot[];events:WorldEvent[];pending:InputFrame[];
  connected:boolean;seq:number;accumulator:number;stand:typeof stand;receivedAt:number;lastAttack:number;retryDelay:number;closed:boolean;
  storage:Storage;tokenKey:string;serverTime:number;
  onStatus:(status:NetworkStatus,message:string)=>void;
  onChat:(entries:ChatEntry[],replace?:boolean)=>void;
  socket:WebSocket|undefined;
  options:{name:string;classId:ClassId}={name:'Странник',classId:'warrior'};
  token='';id='';fatal=false;
  save:SaveState|undefined;
  groundLoot:GroundDrop[]=[];
  retryTimer:ReturnType<typeof setTimeout>|undefined;
  firstState:Promise<void>|undefined;
  resolveJoin:(()=>void)|null=null;
  rejectJoin:((reason:Error)=>void)|null=null;
  constructor(){
    this.player=initialPlayer();
    this.mobs=[];this.players=[];this.projectiles=[];this.loot=[];this.events=[];this.pending=[];this.connected=false;this.seq=0;this.accumulator=0;this.stand=stand;this.receivedAt=0;this.lastAttack=0;this.retryDelay=600;this.closed=false;
    const session=new URLSearchParams(location.search).get('session');
    this.storage=session?sessionStorage:localStorage;this.tokenKey=`frontier-token:${location.origin}${session?':'+session:''}`;
    this.onStatus=()=>{};this.onChat=()=>{};this.serverTime=0;
  }
  send(message:ClientMessage){if(this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify(message));}
  connect(options:ConnectionOptions={}){
    this.options={name:options.name||localStorage.getItem('frontier-name')||'Странник',classId:options.classId||'warrior'};
    // An explicitly empty key means create a hero, even after an old key failed.
    this.token=options.token!==undefined?options.token:this.storage.getItem(this.tokenKey)||'';
    this.closed=false;this.fatal=false;this.firstState=new Promise<void>((resolve,reject)=>{this.resolveJoin=resolve;this.rejectJoin=reject;});this.open();return this.firstState;
  }
  open(){
    clearTimeout(this.retryTimer);this.connected=false;this.pending=[];this.seq=0;
    this.onStatus('connecting','Подключаемся к миру…');
    this.socket?.close();
    const socket=this.socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws`);
    let welcomed=false;
    const deadline=setTimeout(()=>socket.close(),7000);
    socket.onopen=()=>this.send({type:'join',protocol:2,...this.options,token:this.token||undefined});
    socket.onmessage=event=>{
      if(this.socket!==socket)return;
      // The authoritative server owns this protocol; reject malformed envelopes before applying them.
      let m:ServerMessage;
      try {
        const raw:unknown=JSON.parse(String(event.data));
        if(!raw||typeof raw!=='object'||!('type' in raw)||typeof raw.type!=='string')return;
        m=raw as ServerMessage;
      } catch {socket.close(1002,'Invalid server message');return;}
      if(m.type==='welcome'){
        welcomed=true;this.id=m.id;this.token=m.token;this.storage.setItem(this.tokenKey,m.token);localStorage.setItem('frontier-name',this.options.name);this.onChat(m.chat,true);return;
      }
      if(m.type==='error'){
        if(m.code!=='full'&&m.code!=='storage_unavailable'){this.fatal=true;this.rejectJoin?.(new Error(m.text));}
        this.onStatus('error',m.text);return;
      }
      if(m.type==='state'&&welcomed&&m.self){
        clearTimeout(deadline);this.connected=true;this.retryDelay=600;this.receivedAt=performance.now();
        const self=m.self;
        const teleported=!sameLocation(this.player,self)||m.events.some(event=>event.type==='portal'||event.type==='camp');
        this.pending=teleported?[]:this.pending.filter(input=>input.seq>self.ack);
        this.serverTime=m.t;
        const next:ClientPlayer={...self,coins:self.gold};
        if(next.afk||next.interactionTarget)this.pending=[];else for(const input of this.pending)moveHero(next,.05,input);
        this.player=next;this.mobs=m.mobs;this.players=m.players;this.projectiles=m.projectiles;this.save=m.save;
        this.groundLoot=m.groundLoot||[];
        this.events.push(...m.events);this.onStatus('online',m.save.ok?'В общем мире':'Ошибка сохранения — не закрывайте игру');
        this.resolveJoin?.();this.resolveJoin=null;return;
      }
      if(m.type==='chat')this.onChat([m.entry]);
    };
    socket.onclose=()=>{
      clearTimeout(deadline);if(this.socket!==socket)return;this.connected=false;this.pending=[];
      if(this.closed||this.fatal)return;
      this.onStatus('connecting','Связь потеряна. Возвращаемся тем же героем…');
      this.retryTimer=setTimeout(()=>this.open(),this.retryDelay);this.retryDelay=Math.min(4000,this.retryDelay*1.7);
    };
    socket.onerror=()=>{};
  }
  update(dt:number,input:Partial<HeroInput>){
    if(!this.connected)return;
    if(performance.now()-this.receivedAt>3000){this.connected=false;this.socket?.close();return;}
    this.accumulator+=dt;
    while(this.accumulator>=.05){
      this.accumulator-=.05;const frame:InputFrame={type:'input',x:input.x||0,z:input.z||0,aim:typeof input.aim==='number'&&Number.isFinite(input.aim)?input.aim:null,seq:++this.seq};
      this.send(frame);this.pending.push(frame);if(this.pending.length>40){this.socket?.close();this.pending=[];return;}
      if(!this.player.afk&&!this.player.interactionTarget)moveHero(this.player,.05,frame);
    }
  }
  attack(yaw:number,special=false,targetId?:number){if(this.connected&&performance.now()-this.lastAttack>100){this.lastAttack=performance.now();this.send({type:'attack',yaw,special,...(targetId!==undefined?{targetId}:{})});}}
  skill(skillId:SkillId,yaw:number,aim:{targetId?:number;target?:{x:number;z:number}}={}){if(this.connected)this.send({type:'skill',skillId,yaw,...aim});}
  setAfk(enabled:boolean){if(this.connected)this.send({type:'afk',enabled});}
  potion(kind:'hp'|'mana'='hp'){if(this.connected)this.send({type:'potion',kind});}
  toggleRun(){if(this.connected)this.send({type:'run',running:!this.player.running});}
  returnToCamp(){if(this.connected)this.send({type:'camp'});}
  weapon(id:WeaponId){if(this.connected)this.send({type:'weapon',weapon:id});}
  stopInput(){if(this.connected)this.send({type:'input',x:0,z:0,aim:null,seq:++this.seq});this.pending=[];}
}
