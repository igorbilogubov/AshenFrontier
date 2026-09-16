import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/public/game/vendor/three.module.js';
import {createSnowEnvironment} from '../dist/public/game/snow-environment.js';
import {SNOW_BOUNDS,SNOW_ENTRY,SNOW_PASSAGES} from '../dist/public/game/snow.js';
import {possibleLoot} from '../dist/public/game/possible-loot.js';

test('snow environment keeps the gameplay ground level and disables its effects outside the region',()=>{
 const scene=new T.Scene(),snow=createSnowEnvironment(scene);
 assert.equal(snow.root.visible,false);
 const positions=snow.ground.geometry.attributes.position;
 for(let i=0;i<positions.count;i++){const x=positions.getX(i),z=positions.getZ(i);if(x>=SNOW_BOUNDS.minX&&x<=SNOW_BOUNDS.maxX&&z>=SNOW_BOUNDS.minZ&&z<=SNOW_BOUNDS.maxZ)assert.ok(Math.abs(positions.getY(i)+.04)<.001);}
 snow.animate(10,SNOW_ENTRY,true);assert.equal(snow.root.visible,true);
 let particles;snow.root.traverse(object=>{if(object instanceof T.Points)particles=object;});
 assert.ok(particles);assert.equal(particles.geometry.attributes.position.count,240);
 const values=particles.geometry.attributes.position.array;
 for(let i=0;i<values.length;i+=3){assert.ok(Math.abs(values[i]-SNOW_ENTRY.x)<=16.01);assert.ok(values[i+1]>=0&&values[i+1]<=8);assert.ok(Math.abs(values[i+2]-SNOW_ENTRY.z)<=14.01);}
 snow.animate(11,{x:0,z:0},false);assert.equal(snow.root.visible,false);
 assert.deepEqual(snow.passages.map(p=>p.portal.id),SNOW_PASSAGES.map(p=>p.id));
 scene.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){for(const material of Array.isArray(o.material)?o.material:[o.material])material.dispose();}});
});

test('snow elite loot advertises blue categories without promising them on ordinary monsters',()=>{
 assert.equal(possibleLoot('yak').categories.some(category=>category.rarity===2),false);
 const elite=possibleLoot('yak','frost-matriarch');
 assert.ok(elite.categories.some(category=>category.rarity===2&&category.chance===.03));
 assert.equal(elite.itemChance,.13);
});
