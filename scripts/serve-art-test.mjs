// Compatibility command: start or reuse the same game, never a separate local simulation.
const port=Number(process.env.PORT||4731);
let running=false;
try{const response=await fetch(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(1000)});running=(await response.json()).world==='ashen-opushka-3d';}catch{}
if(running)console.log(`Общий 3D-мир уже запущен: http://127.0.0.1:${port}/`);
else await import('./start.mjs');
