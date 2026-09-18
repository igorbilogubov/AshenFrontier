import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SPEECH_HEIGHT,SPEECH_MS,liveChatEntries,speakerOf} from '../dist/public/game/chat-speech.js';

test('history chat stays silent; live lines keep the speaker id',()=>{
  const history=[{name:'Игорь',text:'привет',t:1,id:'a'},{name:'Борис',text:'здесь',t:2,id:'b'}];
  assert.deepEqual(liveChatEntries(history,true),[]);
  assert.deepEqual(liveChatEntries(history,false),history);
  assert.deepEqual(liveChatEntries([{name:'Игорь',text:'',t:3,id:'a'}],false),[]);
});

test('speech attaches to the sending hero, including self, and lasts five seconds',()=>{
  const self={id:'self',name:'Игорь'};
  const others=[{id:'b',name:'Борис'},{id:'c',name:'Вера'}];
  assert.equal(speakerOf({id:'self',name:'Игорь'},self,others),'self');
  assert.equal(speakerOf({id:'b',name:'Борис'},self,others),'b');
  assert.equal(speakerOf({name:'Вера'},self,others),'c');
  assert.equal(speakerOf({name:'Игорь'},self,others),'self');
  assert.equal(speakerOf({id:'gone',name:'Нет'},self,others),null);
  assert.equal(SPEECH_MS,5000);assert.equal(SPEECH_HEIGHT,3.15);
});

test('server chat packets carry the hero id and the client plays a dedicated cue',async()=>{
  const server=await readFile(new URL('../server.ts',import.meta.url),'utf8');
  const scene=await readFile(new URL('../public/game/scene.ts',import.meta.url),'utf8');
  const css=await readFile(new URL('../public/game/scene.css',import.meta.url),'utf8');
  const sounds=await readFile(new URL('../public/game/sounds.ts',import.meta.url),'utf8');
  assert.match(server,/id:entry\.p\.id/);
  assert.match(scene,/sound\.play\('chat'\)/);
  assert.match(scene,/className='speech-bubble'/);
  assert.match(css,/\.speech-bubble\{/);
  assert.match(sounds,/chat:Object\.freeze\(\['chat\.mp3'\]\)/);
});
