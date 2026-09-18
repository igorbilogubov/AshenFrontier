/** Nearest-rank percentiles; includes every finite nonnegative sample, including stalls. */
export function distribution(samples:readonly number[]){
  const values=samples.filter(n=>Number.isFinite(n)&&n>=0).sort((a,b)=>a-b),count=values.length;
  const percentile=(fraction:number)=>count?values[Math.max(0,Math.ceil(count*fraction)-1)]:null;
  return {count,mean:count?values.reduce((a,b)=>a+b,0)/count:null,p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),max:count?values[count-1]:null};
}
export function frameSummary(samples:readonly number[]){
  const valid=samples.filter(n=>Number.isFinite(n)&&n>=0),stats=distribution(valid),total=valid.reduce((a,b)=>a+b,0);
  return {...stats,fps:total>0?stats.count*1000/total:null,over33:valid.filter(n=>n>1000/30).length,over50:valid.filter(n=>n>50).length,over100:valid.filter(n=>n>100).length};
}
export type Distribution=ReturnType<typeof distribution>;
export const HUD_PERF_HINT='FPS — кадры в секунду. ОЗУ — куча JavaScript этой вкладки, не вся память компьютера. ЦП — доля бюджета кадра 16,7 мс (поток игры, не все ядра). GPU — вызовы рисования и треугольники кадра, не процент видеокарты. Загрузку диска браузер не показывает.';
export function jsHeapBytes(){
  const memory=(performance as Performance & {memory?:{usedJSHeapSize:number}}).memory;
  const bytes=memory?.usedJSHeapSize;
  return Number.isFinite(bytes)?bytes:undefined;
}
export function hudPerformance(stats:{fps:number;cpuMs:number;heapBytes?:number;drawCalls:number;triangles:number}){
  const fps=Math.max(0,Math.round(stats.fps));
  const cpu=Math.max(0,Math.min(999,Math.round(stats.cpuMs*6)));
  const ram=stats.heapBytes!=null?` · ${Math.max(1,Math.round(stats.heapBytes/1048576))} МБ`:'';
  const tris=stats.triangles>=1000?`${Math.round(stats.triangles/1000)}к`:String(Math.max(0,Math.round(stats.triangles)));
  return `${fps} FPS${ram}\nЦП ${cpu}% · GPU ${Math.max(0,Math.round(stats.drawCalls))} / ${tris}`;
}
