import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_LEVEL,baseXp,baseExperience,targetKills,xpNeeded,experienceMultiplier,mobExperience} from '../dist/public/game/progression-curve.js';
import {FIELD_BALANCE,fieldBalance} from '../dist/public/game/field-balance.js';

test('level curve is integer, increasing, capped at 100 and visibly paced early',()=>{
  assert.equal(MAX_LEVEL,100);
  assert.equal(xpNeeded(100),0);assert.equal(xpNeeded(101),0);
  assert.equal(xpNeeded(0),xpNeeded(1));assert.equal(xpNeeded(Number.NaN),xpNeeded(1));
  assert.equal(targetKills(1),20);assert.equal(targetKills(19),200);
  assert.equal(targetKills(20),300);assert.equal(targetKills(39),946);
  assert.equal(targetKills(40),1000);assert.equal(targetKills(59),1646);
  assert.equal(targetKills(60),1700);assert.equal(targetKills(79),2416);
  assert.equal(targetKills(80),2450);assert.equal(targetKills(99),2548);
  for(let level=1;level<MAX_LEVEL;level++){
    assert(Number.isSafeInteger(xpNeeded(level)));assert(xpNeeded(level)>0);
    if(level>1)assert(xpNeeded(level)>xpNeeded(level-1),`level ${level}`);
  }
});

test('equal-level XP baseline grows predictably and old-zone penalty starts after ten levels',()=>{
  assert.equal(baseXp(1),13);assert.equal(baseXp(40),892);assert.equal(baseXp(100),5512);
  assert.equal(baseExperience(55),baseXp(55));
  assert.equal(experienceMultiplier(20,10),1);
  assert.equal(mobExperience(20,10,100),100);
  assert.equal(mobExperience(21,10,100),96);
  assert.equal(mobExperience(25,10,100),80);
  assert.equal(mobExperience(30,10,100),55);
  assert.equal(mobExperience(40,10,100),25);
  assert.equal(mobExperience(50,10,100),10);
  assert.equal(mobExperience(99,1,1),1);
  assert.equal(mobExperience(99,1,0),0);
  assert.equal(mobExperience(1,20,baseXp(20)),baseXp(20),'higher-level enemies do not lose XP');
});

test('field catalog is complete, immutable and follows the authored level ladder',()=>{
  assert.deepEqual(Object.keys(FIELD_BALANCE).sort(),['alpha','ash-jackal','bear','boar','frost-spider','ice-golem','lynx','monitor-lizard','scarab','scorpion','wolf','yak'].sort());
  assert.deepEqual(Object.values(FIELD_BALANCE).map(config=>config.level).sort((a,b)=>a-b),[1,4,7,9,10,14,18,22,25,29,34,39]);
  for(const [type,config] of Object.entries(FIELD_BALANCE)){
    assert.equal(fieldBalance(type),config);assert(Object.isFrozen(config));
    assert.equal(config.xp,baseXp(config.level),type);
    assert(config.hp>0&&config.damage>0&&config.coins>0,type);
  }
  assert(Object.isFrozen(FIELD_BALANCE));
});

test('kill-count normalization targets about three months at the measured isolated-spawn throughput',()=>{
  const bands=[[1,20],[20,40],[40,60],[60,80],[80,100]];
  const hours=bands.map(([from,to])=>Array.from({length:to-from},(_,index)=>targetKills(from+index)).reduce((sum,kills)=>sum+kills,0)/140);
  assert.deepEqual(hours.map(value=>Math.round(value)),[15,89,189,294,357]);
});
