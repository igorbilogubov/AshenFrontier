import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const files=['server.mjs'];
for(const dir of ['scripts','test'])for(const name of await readdir(dir))if(name.endsWith('.mjs'))files.push(dir+'/'+name);
for(const name of await readdir('scripts/godot'))if(name.endsWith('.mjs'))files.push('scripts/godot/'+name);
for(const file of files){const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(result.status)process.exit(result.status);}
console.log(`Syntax OK: ${files.length} JavaScript modules`);
