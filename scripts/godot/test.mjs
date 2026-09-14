import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';

const root=fileURLToPath(new URL('../../',import.meta.url));
const data=await mkdtemp(path.join(tmpdir(),'ashen-godot-qa-'));
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:'0',GAME_HOST:'127.0.0.1',GAME_PREVIEW_ALIAS:'0',GAME_DATA_DIR:data},stdio:['ignore','pipe','pipe']});
let output='';
server.stdout.on('data',chunk=>{output+=chunk;});
server.stderr.on('data',chunk=>process.stderr.write(chunk));
let test;
try{
  const start=Date.now();
  while(!/http:\/\/127\.0\.0\.1:(\d+)/.test(output)){
    if(Date.now()-start>10000||server.exitCode!==null)throw new Error('QA server did not start');
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  const port=output.match(/http:\/\/127\.0\.0\.1:(\d+)/)[1];
  const godot=process.env.GODOT_BIN||(process.platform==='darwin'?'/Applications/Godot.app/Contents/MacOS/Godot':'godot');
  test=spawn(godot,['--headless','--log-file',path.join(data,'godot.log'),'--path',path.join(root,'godot-prototype'),'--max-fps','60','--script','res://tests/smoke.gd','--',`--server=ws://127.0.0.1:${port}/ws`,`--qa-session=${randomUUID()}`],{stdio:'inherit'});
  const timer=setTimeout(()=>test.kill('SIGTERM'),60000);
  const [code]=await once(test,'exit');
  clearTimeout(timer);
  process.exitCode=code??1;
}finally{
  if(test?.exitCode===null)test.kill('SIGTERM');
  if(server.exitCode===null){
    const stopped=once(server,'exit');
    server.kill('SIGTERM');
    await stopped;
  }
  await rm(data,{recursive:true,force:true});
}
