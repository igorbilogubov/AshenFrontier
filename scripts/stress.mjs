// Always a fresh, isolated local world. Existing saves cannot be selected by environment.
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {startCluster} from './postgres-runtime.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const dir=await mkdtemp(path.join(tmpdir(),'ashen-stress-'));
await writeFile(path.join(dir,'.stress-sandbox'),'temporary benchmark world\n',{mode:0o600});
const reports=path.join(root,'artifacts','performance');await mkdir(reports,{recursive:true});
const database=await startCluster(path.join(dir,'postgres'),{database:'ashen_stress'});
const child=spawn(process.execPath,['server.mjs'],{cwd:root,stdio:['inherit','pipe','inherit'],env:{...process.env,DATABASE_URL:database.url,PORT:process.env.STRESS_PORT||'4742',GAME_HOST:'127.0.0.1',GAME_PREVIEW_ALIAS:'0',GAME_DATA_DIR:dir,GAME_ALLOWED_ORIGINS:'',GAME_STRESS:'1',GAME_STRESS_REPORTS:reports,NODE_ENV:'development'}});
let announced=false;child.stdout.on('data',chunk=>{process.stdout.write(chunk);const match=String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/);if(match&&!announced){announced=true;console.log(`FPS stress: ${match[0]}/?stress=1&session=benchmark`);}});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
try {
  process.exitCode=await new Promise((resolve,reject)=>{child.once('exit',code=>resolve(code||0));child.once('error',reject);});
} finally { await database.stop(); await rm(dir,{recursive:true,force:true}); }
