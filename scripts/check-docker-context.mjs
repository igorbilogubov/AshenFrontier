import {access,readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [dockerfile,ignoreFile]=await Promise.all([
  readFile(path.join(root,'Dockerfile'),'utf8'),
  readFile(path.join(root,'.dockerignore'),'utf8'),
]);

const ignoreRules=ignoreFile.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#'));
if(ignoreRules[0]!=='**'||ignoreRules.slice(1).some(rule=>!rule.startsWith('!'))){
  throw new Error('.dockerignore must remain an explicit allowlist beginning with **');
}
const allowed=new Set(ignoreRules.slice(1).map(rule=>rule.slice(1)));

const logicalLines=[];
for(const physical of dockerfile.split(/\r?\n/)){
  const previous=logicalLines.at(-1);
  if(previous?.endsWith('\\'))logicalLines[logicalLines.length-1]=previous.slice(0,-1)+physical.trimStart();
  else logicalLines.push(physical.trim());
}

const sources=new Set();
for(const line of logicalLines){
  if(!/^COPY\s/i.test(line))continue;
  let fields=line.replace(/^COPY\s+/i,'').trim().split(/\s+/);
  let stageCopy=false;
  while(fields[0]?.startsWith('--')){
    if(fields.shift().startsWith('--from='))stageCopy=true;
  }
  if(stageCopy)continue;
  if(fields.length<2||fields.some(field=>/[\[\]",]/.test(field)))throw new Error(`Unsupported Docker COPY form: ${line}`);
  fields.pop();
  for(const source of fields)sources.add(source.replace(/^\.\//,'').replace(/\/$/,''));
}

const required=new Set();
for(const source of sources){
  if(!source||source==='.'||source.includes('*'))throw new Error(`Docker COPY source must be an explicit path: ${source||'<empty>'}`);
  await access(path.join(root,source));
  const parts=source.split('/');
  for(let index=1;index<parts.length;index++)required.add(parts.slice(0,index).join('/')+'/');
  if((await stat(path.join(root,source))).isDirectory()){
    required.add(source+'/');
    required.add(source+'/**');
  }else required.add(source);
}

const missing=[...required].filter(rule=>!allowed.has(rule)).sort();
if(missing.length)throw new Error(`Docker COPY paths excluded by .dockerignore: ${missing.join(', ')}`);
console.log(`Docker context OK: ${sources.size} local COPY sources are allowlisted`);
