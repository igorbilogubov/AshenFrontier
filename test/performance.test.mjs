import test from 'node:test';
import assert from 'node:assert/strict';
import {distribution,frameSummary,hudPerformance} from '../dist/public/game/performance-metrics.js';

test('frame statistics retain long stalls and use duration-weighted FPS',()=>{
  const result=frameSummary([16,16,700]);
  assert.equal(result.count,3);assert.equal(result.p50,16);assert.equal(result.p95,700);assert.equal(result.max,700);
  assert.equal(result.over100,1);assert.equal(result.over50,1);assert.equal(result.over33,1);
  assert.equal(result.fps,3000/732);
});
test('empty measurements are unavailable instead of zero-cost claims; percentiles do not mutate samples',()=>{
  assert.equal(frameSummary([]).fps,null);assert.equal(distribution([]).p95,null);
  const values=[30,10,20];assert.equal(distribution(values).p50,20);assert.deepEqual(values,[30,10,20]);
});
test('performance distributions filter invalid timings and use nearest-rank percentiles',()=>{
  const values=Array.from({length:100},(_,i)=>i+1);values.push(NaN,Infinity,-1);
  const result=distribution(values);assert.equal(result.count,100);assert.equal(result.p95,95);assert.equal(result.p99,99);
});
test('HUD readout shows FPS, heap, frame-budget CPU and GPU counts without claiming disk load',()=>{
  assert.equal(hudPerformance({fps:59.6,cpuMs:8.3,heapBytes:48*1048576,drawCalls:18,triangles:140400}),'60 FPS · 48 МБ\nЦП 50% · GPU 18 / 140к');
  assert.equal(hudPerformance({fps:30,cpuMs:33.3,drawCalls:9,triangles:800}),'30 FPS\nЦП 200% · GPU 9 / 800');
});


test('stress mode refuses existing game directories and public/production hosts',async()=>{
  const {assertStressSandbox}=await import('../dist/stress/controller.js');
  await assert.rejects(assertStressSandbox('/not-a-stress-sandbox','127.0.0.1'),/isolated/);
  await assert.rejects(assertStressSandbox('/not-a-stress-sandbox','0.0.0.0'),/isolated/);
});
