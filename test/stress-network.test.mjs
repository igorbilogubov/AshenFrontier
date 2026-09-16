import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {once} from 'node:events';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {WebSocket} from 'ws';
import {createTestDatabase,hasTestDatabase} from './helpers/postgres.mjs';
import {startTestServer,stopTestServer,until} from './helpers/network.mjs';
import {testPlayer} from './helpers/network.mjs';

async function observer(server){
  const login=await testPlayer(server,{name:'Наблюдатель',classId:'warrior'});
  const client={ws:new WebSocket(server.url.replace('http:','ws:')+'/ws',{origin:server.url,headers:login.headers}),welcome:null,state:null};
  client.ws.on('message',raw=>{
    const message=JSON.parse(String(raw));
    if(message.type==='welcome')client.welcome=message;
    if(message.type==='state')client.state=message;
  });
  await once(client.ws,'open');
  client.ws.send(JSON.stringify({type:'join',protocol:3,heroId:login.heroId}));
  await until(()=>client.welcome&&client.state,{message:'Stress observer did not join'});
  return client;
}
async function scenario(server,players,mode,equipment){
  const response=await fetch(server.url+'/__stress/scenario',{
    method:'POST',headers:{Origin:server.url,'Content-Type':'application/json'},
    body:JSON.stringify({players,mode,equipment})
  });
  const body=await response.json();
  assert.equal(response.status,200,JSON.stringify(body));
  assert.equal(body.players,players);
  assert.equal(body.bots,players-1);
  return body;
}
async function sustainedAfk(server){
  await new Promise(resolve=>setTimeout(resolve,1300));
  const response=await fetch(server.url+'/__stress/info');
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.server.players,16);
  assert.equal(body.server.activeAfk,16,'Queued camp movement cancelled the AFK benchmark after transition');
}

test('isolated PostgreSQL stress profiles survive 1 → 16 AFK → 1 → 16 AFK without reissuing item instances',
  {skip:!hasTestDatabase,timeout:90000},async()=>{
    const database=await createTestDatabase(),dataDir=await mkdtemp(path.join(tmpdir(),'ashen-stress-network-'));
    await writeFile(path.join(dataDir,'.stress-sandbox'),'temporary benchmark world\n');
    let server,client;
    try{
      server=await startTestServer(database,{dataDir,environment:{GAME_STRESS:'1',GAME_STRESS_REPORTS:dataDir}});
      client=await observer(server);
      await scenario(server,1,'camp','legacy-warrior');
      const first=await scenario(server,16,'afk','mixed-warrior');
      assert.equal(first.activeAfk,16);
      await sustainedAfk(server);
      await until(()=>client.state?.self.afk&&client.state.self.items.length===10,{timeout:10000,message:'First AFK profile was not published'});
      const firstIds=new Set(client.state.self.items.map(item=>item.id));

      await scenario(server,1,'camp','legacy-warrior');
      await until(()=>!client.state?.self.afk&&client.state?.self.items.length===2,{timeout:10000,message:'Camp profile was not published'});
      const second=await scenario(server,16,'afk','mixed-warrior');
      assert.equal(second.activeAfk,16);
      await sustainedAfk(server);
      await until(()=>client.state?.self.afk&&client.state.self.items.length===10&&client.state.self.items.every(item=>!firstIds.has(item.id)),
        {timeout:10000,message:'Fresh immutable item instances were not published'});
      // /health intentionally returns 503 while a valid economic commit is
      // pending. Loaded test workers can overlap that brief barrier; only retry
      // this specific state, never a lost writer or an unavailable database.
      const healthDeadline=Date.now()+5000;
      while(true){
        const health=await fetch(server.url+'/health'),body=await health.json();
        if(health.status===200)break;
        assert.equal(body.storage?.writer,true,JSON.stringify(body));
        assert.equal(body.storage?.pending,true,JSON.stringify(body));
        assert(Date.now()<healthDeadline,'Stress profile did not reach durable healthy state');
        await new Promise(resolve=>setTimeout(resolve,50));
      }
      assert(client.state.self.items.every(item=>!firstIds.has(item.id)));
    }finally{
      if(client&&client.ws.readyState!==WebSocket.CLOSED){const ended=once(client.ws,'close');client.ws.close();await ended;}
      await stopTestServer(server);await database.close();await rm(dataDir,{recursive:true,force:true});
    }
  });
