import {moveHero,stand} from './location.js';

export class NetworkGame{
  constructor(){
    this.player={x:.5,z:2,yaw:Math.PI*.25,targetYaw:Math.PI*.25,vx:0,vz:0,gait:0,moveBlend:0,runBlend:0,hp:100,maxHp:100,weapon:'sword',potions:3,coins:0,xp:0,kills:0,attack:null,dead:0,hurt:0,items:[],equipment:{}};
    this.mobs=[];this.players=[];this.projectiles=[];this.loot=[];this.events=[];this.pending=[];this.connected=false;this.seq=0;this.accumulator=0;this.stand=stand;this.receivedAt=0;this.lastAttack=0;this.retryDelay=600;this.closed=false;
    const session=new URLSearchParams(location.search).get('session');
    this.storage=session?sessionStorage:localStorage;this.tokenKey=`frontier-token:${location.origin}${session?':'+session:''}`;
    this.onStatus=()=>{};this.onChat=()=>{};
  }
  send(message){if(this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify(message));}
  connect(options={}){
    this.options={name:options.name||localStorage.getItem('frontier-name')||'Странник',classId:options.classId||'warrior'};
    this.token=options.token||this.storage.getItem(this.tokenKey)||'';
    this.closed=false;this.fatal=false;this.firstState=new Promise((resolve,reject)=>{this.resolveJoin=resolve;this.rejectJoin=reject;});this.open();return this.firstState;
  }
  open(){
    clearTimeout(this.retryTimer);this.connected=false;this.pending=[];this.seq=0;
    this.onStatus('connecting','Подключаемся к миру…');
    const socket=this.socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws`);
    let welcomed=false;
    const deadline=setTimeout(()=>socket.close(),7000);
    socket.onopen=()=>this.send({type:'join',protocol:2,...this.options,token:this.token||undefined});
    socket.onmessage=event=>{
      const m=JSON.parse(event.data);
      if(m.type==='welcome'){
        welcomed=true;this.id=m.id;this.token=m.token;this.storage.setItem(this.tokenKey,m.token);localStorage.setItem('frontier-name',this.options.name);this.onChat(m.chat,true);return;
      }
      if(m.type==='error'){
        if(m.code!=='full'){this.fatal=true;this.rejectJoin?.(new Error(m.text));}
        this.onStatus('error',m.text);return;
      }
      if(m.type==='state'&&welcomed){
        clearTimeout(deadline);this.connected=true;this.retryDelay=600;this.receivedAt=performance.now();
        this.pending=this.pending.filter(input=>input.seq>m.self.ack);
        const next=m.self;next.coins=next.gold;
        for(const input of this.pending)moveHero(next,.05,input);
        this.player=next;this.mobs=m.mobs;this.players=m.players;this.projectiles=m.projectiles;this.save=m.save;
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
  update(dt,input){
    if(!this.connected)return;
    if(performance.now()-this.receivedAt>3000){this.connected=false;this.socket.close();return;}
    this.accumulator+=dt;
    while(this.accumulator>=.05){
      this.accumulator-=.05;const frame={type:'input',x:input.x||0,z:input.z||0,aim:Number.isFinite(input.aim)?input.aim:null,seq:++this.seq};
      this.send(frame);this.pending.push(frame);if(this.pending.length>40){this.socket.close();this.pending=[];return;}
      moveHero(this.player,.05,frame);
    }
  }
  attack(yaw,special=false){if(this.connected&&performance.now()-this.lastAttack>100){this.lastAttack=performance.now();this.send({type:'attack',yaw,special});}}
  potion(){if(this.connected)this.send({type:'potion'});}
  toggleRun(){if(this.connected)this.send({type:'run',running:!this.player.running});}
  returnToCamp(){if(this.connected)this.send({type:'camp'});}
  weapon(id){if(this.connected)this.send({type:'weapon',weapon:id});}
  stopInput(){if(this.connected)this.send({type:'input',x:0,z:0,aim:null,seq:++this.seq});this.pending=[];}
}
