import http from 'node:http';
import net from 'node:net';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const root=fileURLToPath(new URL('../../',import.meta.url));
const port=Number(process.env.GODOT_WEB_PORT||4741);
const backendPort=Number(process.env.GODOT_SERVER_PORT||4733);
const publicRoot=path.join(root,'artifacts/godot-web');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.wasm':'application/wasm','.pck':'application/octet-stream','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const filename=path.resolve(publicRoot,'.'+(pathname==='/'?'/index.html':pathname));
    if(!filename.startsWith(publicRoot+path.sep)||!types[path.extname(filename)]||!['GET','HEAD'].includes(req.method)){res.writeHead(404);res.end();return;}
    const info=await stat(filename);
    res.writeHead(200,{'Content-Type':types[path.extname(filename)],'Content-Length':info.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:await readFile(filename));
  }catch{res.writeHead(404);res.end('Godot web build not found. Run npm run godot:export first.');}
});
server.on('upgrade',(req,socket,head)=>{
  if(req.url!=='/ws'){socket.destroy();return;}
  const upstream=net.connect(backendPort,'127.0.0.1',()=>{
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`+Object.entries(req.headers).map(([k,v])=>`${k}: ${v}\r\n`).join('')+'\r\n');
    if(head.length)upstream.write(head);
    socket.pipe(upstream);upstream.pipe(socket);
  });
  upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());socket.on('close',()=>upstream.destroy());
});
// Bind the preview port before spawning a backend, so conflicts never stop another task.
server.listen(port,'127.0.0.1',()=>{
  const backend=spawn(process.execPath,['server.mjs'],{cwd:root,stdio:'inherit',env:{...process.env,PORT:String(backendPort),GAME_HOST:'127.0.0.1',GAME_PREVIEW_ALIAS:'0',GAME_DATA_DIR:path.join(root,'data/godot-prototype'),GAME_ALLOWED_ORIGINS:`http://127.0.0.1:${port},http://localhost:${port}`}});
  console.log(`Godot web: http://127.0.0.1:${port}/ | Three.js comparison: http://127.0.0.1:${backendPort}/`);
  let stopping=false;
  const stop=()=>{if(stopping)return;stopping=true;server.close();backend.kill('SIGTERM');};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
  backend.on('error',error=>{console.error(error.message);server.close();process.exitCode=1;});
  backend.on('exit',code=>{server.close();process.exitCode=code||0;});
});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
