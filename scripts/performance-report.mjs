import {readdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const directory=process.argv[2]||'artifacts/performance';
const reports=[];
for(const file of (await readdir(directory)).filter(file=>file.endsWith('.json')).sort()){
  const data=JSON.parse(await readFile(path.join(directory,file),'utf8'));
  if(data.valid&&data.scenario&&data.frames)reports.push({file,...data});
}
if(!reports.length)throw new Error('Run npm run stress and start a browser measurement first.');
const n=value=>typeof value==='number'?value.toFixed(2):'—';
const rows=reports.map(r=>`| ${r.recordedAt} | ${r.scenario.name} | ${n(r.frames.fps)} | ${n(r.frames.p95)} | ${n(r.frames.p99)} | ${r.frames.over50} | ${n(r.counters.cpuFrame.mean)} | ${n(r.gpu.milliseconds?.mean)} | ${n(r.server.tick.p95)} | ${r.file} |`);
const markdown=`# Ashen Frontier: измерения браузера\n\nАвтоматическая сводка. CPU submit и GPU query — разные метрики; FPS не вычисляется из CPU-времени. Полные условия и сырые интервалы хранятся в JSON.\n\n| Время UTC | Сценарий | FPS | p95 кадра, мс | p99, мс | >50 мс | CPU кадр, мс | GPU query, мс | p95 тика сервера, мс | Отчёт |\n|---|---|---:|---:|---:|---:|---:|---:|---:|---|\n${rows.join('\n')}\n`;
await writeFile(path.join(directory,'summary.md'),markdown);console.log(path.join(directory,'summary.md'));
