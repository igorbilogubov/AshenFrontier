import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const files=['server.mjs','world.mjs','public/rules.js'];
for(const name of await readdir('public/game'))if(name.endsWith('.js'))files.push('public/game/'+name);
for(const file of files){const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(result.status)process.exit(result.status);}
console.log(`Syntax OK: ${files.length} JavaScript modules`);
