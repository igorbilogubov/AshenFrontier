import {mkdir,cp} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const result=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.json'],{cwd:root,stdio:'inherit'});
if(result.status!==0)process.exit(result.status||1);
await mkdir(new URL('../dist/public/game/',import.meta.url),{recursive:true});
// Node asset tests use the same vendor module identity as compiled graphics modules.
await cp(new URL('../public/game/vendor/',import.meta.url),new URL('../dist/public/game/vendor/',import.meta.url),{recursive:true,filter:source=>!source.endsWith('.d.ts')});
console.log('Strict TypeScript build ready in dist/');
