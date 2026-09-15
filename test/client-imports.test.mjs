import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),compiled=path.join(root,'dist/public'),source=path.join(root,'public');
async function files(dir){const out=[];for(const entry of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())out.push(...await files(p));else if(p.endsWith('.js'))out.push(p);}return out;}
const exists=async p=>stat(p).then(s=>s.isFile(),()=>false);
test('compiled browser modules resolve every static relative import inside the public tree',async()=>{
 for(const file of await files(compiled)){
  const text=await readFile(file,'utf8');
  for(const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*)['"](\.[^'"]+)['"]/g)){
   const target=path.resolve(path.dirname(file),match[1]),relative=path.relative(compiled,target);
   assert(!relative.startsWith('..'),`private server import exposed to browser: ${path.relative(root,file)} -> ${match[1]}`);
   assert(await exists(target)||await exists(path.join(source,relative)),`missing browser dependency: ${relative}`);
  }
 }
});
