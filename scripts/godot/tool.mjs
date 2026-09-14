import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../../',import.meta.url));
const executable=process.env.GODOT_BIN||(process.platform==='darwin'?'/Applications/Godot.app/Contents/MacOS/Godot':'godot');
const project=path.join(root,'godot-prototype');
const action=process.argv[2]||'run';
const run=args=>{const result=spawnSync(executable,['--path',project,...args],{stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);};
if(action==='import')run(['--headless','--editor','--import']);
else if(action==='export'){
  mkdirSync(path.join(root,'artifacts/godot-web'),{recursive:true});
  run(['--headless','--editor','--export-release','Web',path.join(root,'artifacts/godot-web/index.html')]);
}else if(action==='export-macos'){
  mkdirSync(path.join(root,'artifacts/godot-macos'),{recursive:true});
  run(['--headless','--editor','--export-release','macOS',path.join(root,'artifacts/godot-macos/Ashen Frontier Godot.app')]);
}else if(action==='editor')run(['--editor']);
else run(process.argv.slice(3));
