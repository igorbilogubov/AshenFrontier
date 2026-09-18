import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  RELOAD_STORAGE_KEY,RELOAD_TTL_MS,clearReloadResume,isSuccessorHealth,readReloadResume,shouldResumeAfk,storeReloadResume,waitUntilHealthy
} from '../dist/public/game/client-reload.js';

function memory(){
  const data=new Map();
  return {
    getItem(key){return data.has(key)?data.get(key):null;},
    setItem(key,value){data.set(key,String(value));},
    removeItem(key){data.delete(key);}
  };
}

test('reload resume keeps AFK only for the same hero and expires',()=>{
  const storage=memory();
  storeReloadResume('hero-a',true,storage,1_000);
  assert.equal(shouldResumeAfk(readReloadResume(storage,1_500),'hero-a'),true);
  assert.equal(shouldResumeAfk(readReloadResume(storage,1_500),'hero-b'),false);
  assert.equal(readReloadResume(storage,1_000+RELOAD_TTL_MS+1),null);
  storeReloadResume('hero-a',false,storage,2_000);
  assert.equal(shouldResumeAfk(readReloadResume(storage,2_100),'hero-a'),false);
  clearReloadResume(storage);
  assert.equal(readReloadResume(storage,2_200),null);
  assert.equal(storage.getItem(RELOAD_STORAGE_KEY),null);
});

test('healthy poll waits until /health reports ok',async()=>{
  let calls=0;
  const fetchImpl=async()=>{
    calls+=1;
    if(calls<3)throw new Error('down');
    return {ok:true,json:async()=>({ok:true,bootId:'new'})};
  };
  let now=0;
  assert.equal(await waitUntilHealthy(fetchImpl,5_000,()=>now+=200),true);
  assert.ok(calls>=3);
});

test('restart wait ignores the dying process even if it still says ok',async()=>{
  const replies=[{ok:true,bootId:'old'},{ok:false,restarting:true,bootId:'old'},{ok:true,bootId:'new'}];
  const fetchImpl=async(url)=>{
    if(!String(url).includes('/health'))return {ok:true,json:async()=>({})};
    const body=replies.shift()??{ok:true,bootId:'new'};
    return {ok:!!body.ok,json:async()=>body};
  };
  assert.equal(isSuccessorHealth({ok:true,bootId:'old'},'old'),false);
  assert.equal(isSuccessorHealth({ok:true,bootId:'new'},'old'),true);
  let now=0;
  assert.equal(await waitUntilHealthy(fetchImpl,5_000,()=>now+=200,'old'),true);
});

test('restart wait also requires CSS and client JS before reloading',async()=>{
  let cssOk=false;
  const fetchImpl=async(url)=>{
    const path=String(url);
    if(path.includes('/health'))return {ok:true,json:async()=>({ok:true,bootId:'new'})};
    if(path.includes('scene.css'))return {ok:cssOk,json:async()=>({})};
    if(path.includes('scene.js'))return {ok:true,json:async()=>({})};
    return {ok:false,json:async()=>({})};
  };
  let now=0;
  const pending=waitUntilHealthy(fetchImpl,5_000,()=>now+=200,'old');
  setTimeout(()=>{cssOk=true;},500);
  assert.equal(await pending,true);
});

test('account screen auto-enters the resumed hero after a world restart',async()=>{
  const source=await readFile(new URL('../public/game/account-interface.ts',import.meta.url),'utf8');
  assert.match(source,/readReloadResume\(sessionStorage\)/);
  assert.match(source,/Восстанавливаем героя после обновления мира/);
  assert.match(source,/waitUntilHealthy\(fetch,20_000\)/);
  const network=await readFile(new URL('../public/game/network.ts',import.meta.url),'utf8');
  assert.match(network,/m\.type==='reload'\|\|\(m\.type==='error'&&m\.code==='restart'\)/);
  assert.match(network,/event\.code===1012/);
  assert.match(network,/previous=this\.bootId/);
  const server=await readFile(new URL('../server.ts',import.meta.url),'utf8');
  assert.match(server,/restarting:true/);
  assert.match(server,/script-src 'self' 'unsafe-inline'/);
  assert.match(server,/extension==='\.html'\?'no-store'/);
  assert.doesNotMatch(server,/code:'restart'/);
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  assert.match(html,/ashen-boot-retry/);
  assert.match(html,/cssReady/);
  const scene=await readFile(new URL('../public/game/scene.ts',import.meta.url),'utf8');
  assert.match(scene,/ashenBooted:true/);
});
