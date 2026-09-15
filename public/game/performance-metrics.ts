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
