import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/public/game/vendor/three.module.js';
import {bindTargetPresentation} from '../dist/public/game/target-presentation.js';
import {possibleLoot} from '../dist/public/game/possible-loot.js';
import {CLASS_ITEMS,rollEquipment} from '../dist/public/game/equipment-items.js';
import {GEAR_CHANCE} from '../dist/public/game/loot-rules.js';
import {MOB_TYPES} from '../dist/public/game/location.js';

class ElementStub{
  constructor(){this.children=[];this.attributes=new Map();this.style={};this.hidden=false;this.textContent='';this.className='';this.title='';}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  setAttribute(key,value){this.attributes.set(key,value);}
  getAttribute(key){return this.attributes.get(key)??null;}
  querySelector(selector){return selector==='.bar'?this.bar:null;}
}
function fakeDocument(){
  const panel=new ElementStub();panel.bar=new ElementStub();
  const names={
    'target-panel':panel,'target-name':new ElementStub(),
    'target-health':new ElementStub(),'target-fill':new ElementStub()
  };
  return {names,document:{getElementById:id=>names[id]??null,createElement:()=>new ElementStub()}};
}

test('possible loot uses live mob coins, real one-item chance and only currently rolled rarities',()=>{
  for(const type of Object.keys(MOB_TYPES)){
    const view=possibleLoot(type);
    assert.equal(view.gold,MOB_TYPES[type].coins);
    assert.equal(view.itemChance,GEAR_CHANCE[type]);
    assert.deepEqual(view.categories.map(category=>category.id),['gold','weapon','armor','accessory']);
    assert.equal(view.categories[0].rarity,'gold');
    for(const category of view.categories.slice(1)){
      const matching=Object.values(CLASS_ITEMS).flat().filter(item=>category.slots.includes(item.slot));
      assert(matching.length>0);
      assert(matching.every(item=>rollEquipment(item.id,'test-only',()=>0).rarity===category.rarity));
    }
    assert(!view.categories.some(category=>category.rarity===2),'no unimplemented rare drop is advertised');
  }
});

test('selected mob gets center name/HP/real loot and ring; vendor/player remove loot, null clears all',()=>{
  const prior=globalThis.document,{document,names}=fakeDocument();globalThis.document=document;
  try{
    const scene=new T.Scene(),update=bindTargetPresentation(scene);
    assert.equal(scene.children.length,1);const ring=scene.children[0];
    update({kind:'mob',type:'bear',name:'Пепельный медведь',x:12,z:7,hp:72,maxHp:145});
    assert.equal(names['target-panel'].hidden,false);
    assert.equal(names['target-name'].textContent,'Пепельный медведь');
    assert.equal(names['target-health'].textContent,'72 / 145');
    assert.equal(names['target-fill'].style.transform,`scaleX(${72/145})`);
    const loot=names['target-panel'].children[0],row=loot.children[0];
    assert.equal(loot.hidden,false);assert.equal(row.children.length,4);
    assert.equal(loot.children.length,1,'drop row has no visible heading');
    assert(row.children.every(badge=>badge.children.length===1),'drop badges contain symbols only');
    assert(row.children[0].getAttribute('aria-label').includes('21 золота'));
    assert(row.children.slice(1).every(badge=>badge.title.includes('10%')));
    assert(row.children.slice(1).every(badge=>badge.className.includes('rarity-1')));
    assert.equal(ring.visible,true);assert.equal(ring.position.x,12);assert.equal(ring.position.z,7);
    update({kind:'vendor',id:'camp-vendor',name:'Торговец',x:2,z:-2});
    assert.equal(names['target-name'].textContent,'Торговец');assert.equal(names['target-health'].textContent,'Торговец');
    assert.equal(names['target-panel'].bar.hidden,true);assert.equal(loot.hidden,true);
    assert.equal(ring.position.x,2);
    update({kind:'player',id:'other',name:'Рунный странник',x:5,z:4,hp:40,maxHp:90});
    assert.equal(names['target-health'].textContent,'40 / 90');assert.equal(names['target-panel'].bar.hidden,false);
    assert.equal(loot.hidden,true);assert.equal(ring.visible,true);
    update(null);assert.equal(names['target-panel'].hidden,true);assert.equal(ring.visible,false);
  }finally{globalThis.document=prior;}
});
