import type {ClassId,HeroAttack,WorldEvent} from '../../shared/types.js';

export const SOUND_STORAGE_KEY='ashen-sound';
export const SOUND_BASE='/game/sounds';
export const SOUND_CUES=Object.freeze({
  swing:Object.freeze(['swing-1.ogg','swing-2.ogg','swing-3.ogg','whoosh.ogg']),
  hit:Object.freeze(['hit-1.ogg','hit-2.ogg','hit-3.ogg']),
  hurt:Object.freeze(['hurt.ogg']),
  miss:Object.freeze(['miss.ogg']),
  gold:Object.freeze(['gold-1.ogg','gold-2.ogg']),
  item:Object.freeze(['item.ogg']),
  heal:Object.freeze(['heal.ogg','potion.ogg']),
  level:Object.freeze(['level.ogg']),
  death:Object.freeze(['death.ogg']),
  kill:Object.freeze(['kill.ogg']),
  magic:Object.freeze(['magic.ogg']),
  portal:Object.freeze(['portal.ogg']),
  camp:Object.freeze(['camp.ogg']),
  shop:Object.freeze(['shop.ogg']),
  smith:Object.freeze(['smith.ogg']),
  click:Object.freeze(['click.ogg']),
  error:Object.freeze(['error.ogg']),
  success:Object.freeze(['success.ogg']),
  step:Object.freeze(['step-1.ogg','step-2.ogg','step-3.ogg'])
} as const);
export type SoundCue=keyof typeof SOUND_CUES;
export const SOUND_FILES=Object.freeze([...new Set(Object.values(SOUND_CUES).flat())]);

const VOLUME:Record<SoundCue,number>={
  swing:.55,hit:.5,hurt:.62,miss:.28,gold:.5,item:.45,heal:.5,level:.7,death:.7,kill:.42,
  magic:.5,portal:.55,camp:.4,shop:.4,smith:.45,click:.28,error:.5,success:.55,step:.18
};
const THROTTLE:Partial<Record<SoundCue,number>>={hit:70,hurt:90,swing:90,magic:110,step:240,gold:80,item:80,kill:120};

export function soundEnabled(){
  try{return localStorage.getItem(SOUND_STORAGE_KEY)!=='off';}catch{return true;}
}
export function persistSoundEnabled(on:boolean){
  try{localStorage.setItem(SOUND_STORAGE_KEY,on?'on':'off');}catch{}
}

export function cueForEvent(event:Pick<WorldEvent,'type'> & {text?:string}):SoundCue|null{
  switch(event.type){
    case 'hit':return 'hit';
    case 'hurt':return 'hurt';
    case 'miss':return 'miss';
    case 'loot':return 'gold';
    case 'item':return 'item';
    case 'heal':return 'heal';
    case 'level':return 'level';
    case 'death':return 'death';
    case 'kill':return 'kill';
    case 'portal':return 'portal';
    case 'camp':return 'camp';
    case 'shopOpen':return 'shop';
    case 'stashOpened':return 'shop';
    case 'smithOpen':return 'smith';
    case 'quest':return 'success';
    case 'notice':
      if(event.text?.includes('Заточка успешна'))return 'success';
      if(event.text?.includes('Заточка не удалась')||event.text?.includes('Не хватает'))return 'error';
      return null;
    default:return null;
  }
}
export function attackCue(classId:ClassId,attack:Pick<HeroAttack,'skillId'|'special'>|null|undefined):SoundCue{
  if(!attack)return 'swing';
  if(attack.skillId||classId==='mage')return 'magic';
  return 'swing';
}

export interface SoundPulse{
  attack?:HeroAttack|null;
  classId:ClassId;
  moveBlend:number;
  runBlend:number;
  dead:number|boolean;
  afk?:unknown;
}

export function createSoundBus(){
  let ctx:AudioContext|null=null,master:GainNode|null=null,muted=!soundEnabled(),unlocked=false;
  const buffers=new Map<string,AudioBuffer>(),pending=new Set<string>(),lastAt=new Map<SoundCue,number>();
  let lastAttackId:number|null=null,stepAt=0,index=0;

  const context=()=>{
    if(ctx)return ctx;
    const Ctor=typeof AudioContext==='function'?AudioContext:(globalThis as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
    if(!Ctor)return null;
    ctx=new Ctor();master=ctx.createGain();master.gain.value=muted?0:.62;master.connect(ctx.destination);return ctx;
  };
  const load=async(file:string)=>{
    if(buffers.has(file)||pending.has(file)||typeof fetch!=='function')return;
    pending.add(file);
    try{
      const audio=context();if(!audio)return;
      const data=await fetch(`${SOUND_BASE}/${file}`).then(r=>{if(!r.ok)throw new Error(file);return r.arrayBuffer();});
      buffers.set(file,await audio.decodeAudioData(data.slice(0)));
    }catch{/* keep going if a clip fails */}finally{pending.delete(file);}
  };

  const play=(cue:SoundCue,scale=1)=>{
    if(muted||!unlocked)return;
    const audio=context(),gain=master;if(!audio||!gain||audio.state==='suspended')return;
    const now=typeof performance==='object'?performance.now():Date.now();
    const wait=THROTTLE[cue]??0;if(wait&&now-(lastAt.get(cue)??0)<wait)return;lastAt.set(cue,now);
    const files=SOUND_CUES[cue],file=files[index++%files.length]!;
    const buffer=buffers.get(file);if(!buffer){void load(file);return;}
    const source=audio.createBufferSource(),voice=audio.createGain();
    source.buffer=buffer;source.playbackRate.value=.94+Math.random()*.12;
    voice.gain.value=VOLUME[cue]*scale;source.connect(voice);voice.connect(gain);source.start();
  };

  const unlock=()=>{
    const audio=context();if(!audio)return;
    unlocked=true;
    if(audio.state==='suspended')void audio.resume();
    for(const file of SOUND_FILES)void load(file);
  };

  return {
    unlock,
    play,
    handleEvent(event:WorldEvent,afk=false){
      const cue=cueForEvent(event);if(cue)play(cue,afk&&(cue==='hit'||cue==='swing'||cue==='kill'||cue==='magic')?0.38:1);
    },
    pulse(hero:SoundPulse){
      if(hero.attack&&hero.attack.id!==lastAttackId){
        lastAttackId=hero.attack.id;
        play(attackCue(hero.classId,hero.attack),hero.attack.automatic||hero.afk?0.38:0.85);
      }
      if(!hero.afk&&!hero.dead&&hero.moveBlend>.22){
        const now=typeof performance==='object'?performance.now():Date.now();
        const gap=hero.runBlend>.45?280:420;
        if(now-stepAt>=gap){stepAt=now;play('step');}
      }
    },
    setMuted(value:boolean){
      muted=value;persistSoundEnabled(!value);
      if(master)master.gain.value=muted?0:.62;
      if(!muted)unlock();
    },
    muted:()=>muted,
    enabled:()=>!muted
  };
}
export type SoundBus=ReturnType<typeof createSoundBus>;
