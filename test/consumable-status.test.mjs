import test from 'node:test';
import assert from 'node:assert/strict';
import {consumableStatus} from '../dist/public/game/consumable-status.js';

const hero = (overrides={}) => ({
  quickSlots:{q:'hp-basic',w:'mana-basic'},
  consumableInventory:[{id:'hp',definitionId:'hp-basic',quantity:2},{id:'mp',definitionId:'mana-basic',quantity:3}],
  hp:10,maxHp:100,mana:10,maxMana:100,dead:0,potionCooldown:0,manaPotionCooldown:0,...overrides,
});
test('quick slot follows assigned resource cooldown, including two slots of one resource',()=>{
  const p=hero({quickSlots:{q:'mana-basic',w:'mana-basic'},manaPotionCooldown:2.2,potionCooldown:0});
  for(const slot of ['q','w']){
    const view=consumableStatus(p,slot,true);
    assert.equal(view.available,false);assert.equal(view.seconds,3);assert.equal(view.fraction,.55);
  }
});
test('last fraction of cooldown remains blocked until server reports zero',()=>{
  assert.equal(consumableStatus(hero({potionCooldown:.01}),'q',true).seconds,1);
  assert.equal(consumableStatus(hero({potionCooldown:.01}),'q',true).available,false);
  const ready=consumableStatus(hero(),'q',true);
  assert.equal(ready.available,true);assert.equal(ready.seconds,0);assert.equal(ready.label,'Готово');
});
test('zero cooldown alone does not make a potion usable',()=>{
  for(const p of [hero({hp:100}),hero({dead:1}),hero({consumableInventory:[]}),hero({quickSlots:{q:null,w:null}})])assert.equal(consumableStatus(p,'q',true).available,false);
  assert.equal(consumableStatus(hero(),'q',false).available,false);
});
test('a reassigned potion size shares the existing resource cooldown',()=>{
  const view=consumableStatus(hero({quickSlots:{q:'hp-greater',w:'mana-basic'},consumableInventory:[{id:'h',definitionId:'hp-greater',quantity:4}],potionCooldown:3}),'q',true);
  assert.equal(view.count,4);assert.equal(view.seconds,3);assert.equal(view.available,false);
});
