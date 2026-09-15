import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

export async function until(predicate,{timeout=10000,message='Timed out waiting for server state'}={}){
  const end=Date.now()+timeout;
  while(!predicate()){
    assert(Date.now()<end,message);
    await delay(20);
  }
}

export async function startTestServer(database,{dataDir,environment={}}={}){
  const temporaryDir=dataDir?null:await mkdtemp(path.join(tmpdir(),'ashen-network-'));
  const child=spawn(process.execPath,['server.mjs'],{
    cwd:new URL('../..',import.meta.url),
    env:{...process.env,PORT:'0',GAME_HOST:'127.0.0.1',GAME_PREVIEW_ALIAS:'0',DATABASE_URL:database.url,GAME_DATA_DIR:dataDir||temporaryDir,...environment},
    stdio:['ignore','pipe','pipe']
  });
  let output='';
  child.stdout.on('data',data=>output+=data);
  child.stderr.on('data',data=>output+=data);
  try{
    await until(()=>/http:\/\/127\.0\.0\.1:\d+/.test(output)||child.exitCode!==null||child.signalCode!==null,{timeout:10000,message:'Timed out waiting for PostgreSQL server startup'});
    assert.equal(child.exitCode,null,output.replaceAll(database.url,'[test database]'));
    assert.equal(child.signalCode,null,output.replaceAll(database.url,'[test database]'));
    return {child,temporaryDir,url:output.match(/http:\/\/127\.0\.0\.1:\d+/)[0]};
  }catch(error){await stopTestServer({child,temporaryDir});throw error;}
}

export async function stopTestServer(server){
  if(!server)return;
  if(server.child.exitCode===null&&server.child.signalCode===null){
    const ended=once(server.child,'exit');server.child.kill('SIGTERM');await ended;
  }
  if(server.temporaryDir)await rm(server.temporaryDir,{recursive:true,force:true});
}
