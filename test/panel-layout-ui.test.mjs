import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const css=await readFile(new URL('../public/game/panels.css',import.meta.url),'utf8');
const character=html.slice(html.indexOf('id="character-panel"'),html.indexOf('id="inventory-panel"'));
const inventory=html.slice(html.indexOf('id="inventory-panel"'),html.indexOf('id="skillbook-panel"'));

test('character sheet splits stats and combat figures, without flavour chrome',()=>{
  assert.match(character,/<h2 id="character-title">Характеристики<\/h2>/);
  assert.doesNotMatch(character,/КНИГА ГЕРОЯ/);
  assert.match(character,/id="class-role"[^>]*\bhidden\b/);
  assert.match(character,/class="character-columns"/);
  assert.match(character,/class="character-col-stats"/);
  assert.match(character,/class="character-col-derived"/);
  assert.match(character,/id="stat-rows"/);
  assert.match(character,/id="derived-stats"/);
  assert.match(css,/\.character-columns\{display:grid/);
  assert.match(css,/\.character-panel\{left:22px;width:520px\}/);
});

test('equipment window drops the kicker, caption and bag hint',()=>{
  assert.match(inventory,/<h2 id="inventory-title">Снаряжение<\/h2>/);
  assert.doesNotMatch(inventory,/СНАРЯЖЕНИЕ ПУТНИКА/);
  assert.match(inventory,/id="hero-details"[^>]*\bhidden\b/);
  assert.match(inventory,/id="inventory-hint"[^>]*\bhidden\b/);
});

test('hud keeps level on the XP row and combat buttons beside the menu', async ()=>{
  assert.match(html,/class="hud-progress"/);
  assert.match(html,/id="hero-level"/);
  assert.doesNotMatch(html,/id="hero-name"/);
  assert.match(html,/class="hero-shortcuts"/);
  assert.match(html,/class="auxiliary-controls"/);
  assert.ok(html.indexOf('class="auxiliary-controls"')>html.indexOf('</footer>'));
  assert.match(html,/class="hero-shortcut-buttons"/);
  const hud=await readFile(new URL('../public/game/hud.css',import.meta.url),'utf8');
  assert.match(hud,/\.hud-progress\{display:grid/);
  const chrome=await readFile(new URL('../public/game/inventory-interactions.css',import.meta.url),'utf8');
  assert.match(chrome,/\.hero-shortcuts\{position:fixed;right:22px;bottom:23px;z-index:20;display:flex;flex-direction:column;align-items:flex-end/);
  const gameplay=await readFile(new URL('../public/game/gameplay-hud.css',import.meta.url),'utf8');
  assert.match(gameplay,/\.auxiliary-controls button,\.auxiliary-controls #afk-xp-rate,\.auxiliary-controls #reset,\.auxiliary-controls #movement/);
});
