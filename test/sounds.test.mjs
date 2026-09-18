import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SOUND_BASE,SOUND_CUES,SOUND_FILES,SOUND_STORAGE_KEY,attackCue,cueForEvent,createSoundBus} from '../dist/public/game/sounds.js';

const folder=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','public/game/sounds');

test('every catalogued clip exists as a compact mp3 in the public tree',async()=>{
  const names=new Set(await readdir(folder));
  assert.equal(SOUND_BASE,'/game/sounds');
  assert.equal(SOUND_STORAGE_KEY,'ashen-sound');
  for(const file of SOUND_FILES){
    assert(file.endsWith('.mp3'),file);
    assert(names.has(file),file);
    const size=(await stat(path.join(folder,file))).size;
    assert(size>700&&size<40000,`${file} ${size}`);
  }
  assert.equal(SOUND_FILES.length,28);
});

test('world events pick a cue; unknown notices stay silent',()=>{
  assert.equal(cueForEvent({type:'hit'}),'hit');
  assert.equal(cueForEvent({type:'hurt'}),'hurt');
  assert.equal(cueForEvent({type:'miss'}),'miss');
  assert.equal(cueForEvent({type:'loot'}),'gold');
  assert.equal(cueForEvent({type:'item'}),'item');
  assert.equal(cueForEvent({type:'heal'}),'heal');
  assert.equal(cueForEvent({type:'level'}),'level');
  assert.equal(cueForEvent({type:'death'}),'death');
  assert.equal(cueForEvent({type:'kill'}),'kill');
  assert.equal(cueForEvent({type:'portal'}),'portal');
  assert.equal(cueForEvent({type:'camp'}),'camp');
  assert.equal(cueForEvent({type:'shopOpen'}),'shop');
  assert.equal(cueForEvent({type:'stashOpened'}),'shop');
  assert.equal(cueForEvent({type:'smithOpen'}),'smith');
  assert.equal(cueForEvent({type:'quest'}),'success');
  assert.equal(cueForEvent({type:'notice',text:'Заточка успешна: +3'}),'success');
  assert.equal(cueForEvent({type:'notice',text:'Заточка не удалась. Заточка сброшена'}),'error');
  assert.equal(cueForEvent({type:'notice',text:'Не хватает золота'}),'error');
  assert.equal(cueForEvent({type:'notice',text:'Лагерь безопасен'}),null);
  assert.equal(cueForEvent({type:'skillImpact'}),null);
  assert.deepEqual([...SOUND_CUES.swing],['swing-1.mp3','swing-2.mp3','swing-3.mp3','whoosh.mp3']);
});

test('new attacks choose swing or magic by class and skill',()=>{
  assert.equal(attackCue('warrior',{special:false}),'swing');
  assert.equal(attackCue('archer',{special:false}),'swing');
  assert.equal(attackCue('mage',{special:false}),'magic');
  assert.equal(attackCue('warrior',{skillId:'warrior-cleave',special:true}),'magic');
});

test('sound bus stays quiet in Node without an audio context',()=>{
  const bus=createSoundBus();
  assert.equal(typeof bus.unlock,'function');
  bus.unlock();
  bus.handleEvent({type:'hit',amount:4,id:1,x:0,z:0});
  bus.pulse({attack:{id:1,age:0,duration:.4,yaw:0,hit:false,special:false},classId:'warrior',moveBlend:.8,runBlend:0,dead:0,afk:null});
  bus.setMuted(true);assert.equal(bus.enabled(),false);
  bus.setMuted(false);assert.equal(bus.enabled(),true);
});

test('the game HTTP server allows mp3 audio files',async()=>{
  const src=await readFile(new URL('../server.ts',import.meta.url),'utf8');
  assert.match(src,/\.mp3':'audio\/mpeg'/);
});
