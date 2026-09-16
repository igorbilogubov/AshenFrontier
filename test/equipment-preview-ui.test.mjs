import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {RARITY_LABELS} from '../dist/public/game/inventory-interactions.js';

const source=path=>readFile(new URL(path,import.meta.url),'utf8');

test('equipment preview offers seven regions, four rarities and visual-only +0..9 enhancement',async()=>{
  const [html,logic]=await Promise.all([source('../public/game/equipment-preview.html'),source('../public/game/equipment-preview.ts')]);
  for(const region of ['forest','snow','wasteland','swamp','mines','rift','citadel'])assert.match(html,new RegExp(`value="${region}"`));
  for(const rarity of [1,2,3,4])assert.match(html,new RegExp(`value="${rarity}"`));
  assert.match(html,/id="enhancement-preview"[^>]*min="0"[^>]*max="9"/);
  assert.match(logic,/applyEnhancement\?\.\(enhancement\)/);
  assert.doesNotMatch(logic,/\.enhancement\s*=/,'enhancement stays outside Item data');
});

test('inventory labels include exalted and set tiers',()=>{
  assert.deepEqual(RARITY_LABELS,['Обычный','Необычный','Редкий','Возвышенный','Сетовый']);
});
