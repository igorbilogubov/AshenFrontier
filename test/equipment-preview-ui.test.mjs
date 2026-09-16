import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {RARITY_LABELS} from '../dist/public/game/inventory-interactions.js';
import {regionalEquipment,rollEquipment} from '../dist/public/game/equipment-items.js';
import {itemArtKey} from '../dist/public/game/item-icons.js';

const source=path=>readFile(new URL(path,import.meta.url),'utf8');

test('equipment preview offers seven regions, five rarities and visual-only +0..9 enhancement',async()=>{
  const [html,logic]=await Promise.all([source('../public/game/equipment-preview.html'),source('../public/game/equipment-preview.ts')]);
  for(const region of ['forest','snow','wasteland','swamp','mines','rift','citadel'])assert.match(html,new RegExp(`value="${region}"`));
  for(const name of ['Топь забвения','Забытые шахты','Расколотые земли','Чёрная цитадель'])assert.match(html,new RegExp(name));
  for(const rarity of [0,1,2,3,4])assert.match(html,new RegExp(`value="${rarity}"`));
  assert.match(logic,/type PreviewRarity=0\|1\|2\|3\|4/);
  assert.match(logic,/0:'ОБЫЧНЫЙ'/);
  assert.match(html,/id="enhancement-preview"[^>]*min="0"[^>]*max="9"/);
  assert.match(logic,/applyEnhancement\?\.\(visualEnhancement\(\)\)/);
  assert.match(logic,/disabled=!enhancementSupported\(\)/);
  assert.doesNotMatch(logic,/\.enhancement\s*=/,'enhancement stays outside Item data');
});

test('white preview items retain the base item artwork while using the real white definitions',()=>{
  const white=regionalEquipment('warrior','citadel',0)[0],green=regionalEquipment('warrior','citadel',1)[0];
  assert.equal(rollEquipment(white.id,'white-preview',()=>.5).rarity,0);
  assert.equal(itemArtKey(rollEquipment(white.id,'white-preview',()=>.5)),itemArtKey(rollEquipment(green.id,'green-preview',()=>.5)));
});

test('inventory labels include exalted and set tiers',()=>{
  assert.deepEqual(RARITY_LABELS,['Обычный','Необычный','Редкий','Возвышенный','Сетовый']);
});
