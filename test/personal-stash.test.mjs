import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {World,newHero,makeLoot,persistentHero,safeHero} from '../dist/world.js';
import {openHeroStore} from '../dist/storage/postgres.js';
import {rollEquipment} from '../dist/public/game/equipment-items.js';
import {BAG_CAPACITY,STASH_CAPACITY,backpackItems} from '../dist/public/rules.js';
import {CONSUMABLES,CONSUMABLE_LIMIT} from '../dist/public/game/consumables.js';
import {createTestDatabase,hasTestDatabase} from './helpers/postgres.mjs';
const setBottles=(p,kind,quantity)=>{const id=kind==='hp'?'hp-basic':'mana-basic';p.consumableInventory=p.consumableInventory.filter(stack=>stack.definitionId!==id);if(quantity)p.consumableInventory.push({id:crypto.randomUUID(),definitionId:id,quantity});p[kind==='hp'?'potions':'manaPotions']=quantity;};


test('personal chest transfers only loose owned instances and cannot bypass bag or gear rules',()=>{
  const w=new World(),p=newHero('Кладовщик');w.add(p);w.mobs=[];
  w.command(p,{type:'interact',npcId:'camp-chest'});
  for(let i=0;i<600&&!p.stashActive;i++)w.tick(.05);
  assert(p.stashActive,'hero must enter through the real door and reach the chest');
  w.command(p,{type:'stashClose'});
  const loose=makeLoot('warrior',1,0,'ring');p.items.push(loose);
  w.command(p,{type:'stashDeposit',id:loose.id});assert.deepEqual(p.stash,[]);
  w.command(p,{type:'stashOpen'});assert(p.stashActive);
  assert(w.events.some(event=>event.type==='stashOpened'&&event.owner===p.id));
  w.command(p,{type:'stashDeposit',id:p.equipment.weapon});assert.deepEqual(p.stash,[]);
  w.command(p,{type:'stashDeposit',id:loose.id});w.command(p,{type:'stashDeposit',id:loose.id});
  assert.deepEqual(p.stash,[loose.id]);assert.equal(backpackItems(p).length,0);
  w.command(p,{type:'equip',id:loose.id});w.command(p,{type:'sell',id:loose.id});
  assert.equal(p.equipment.ring,null);assert(p.items.includes(loose));
  const old=structuredClone(loose);
  w.command(p,{type:'stashWithdraw',id:loose.id});w.command(p,{type:'stashWithdraw',id:loose.id});
  assert.deepEqual(p.stash,[]);assert.deepEqual(p.items.find(item=>item.id===loose.id),old);
  for(let i=0;i<STASH_CAPACITY;i++)p.items.push(makeLoot('warrior',1,0,'ring'));
  for(const item of backpackItems(p).slice(1))w.command(p,{type:'stashDeposit',id:item.id});
  assert.equal(p.stash.length,STASH_CAPACITY);
  w.command(p,{type:'stashDeposit',id:loose.id});assert.equal(p.stash.length,STASH_CAPACITY);
  for(let i=backpackItems(p).length+2;i<BAG_CAPACITY;i++)p.items.push(makeLoot('warrior',1,0,'ring'));
  const first=p.stash[0];w.command(p,{type:'stashWithdraw',id:first});assert(p.stash.includes(first));
  w.chestAvailable=()=>false;w.command(p,{type:'stashDeposit',id:loose.id});assert.equal(p.stash.length,STASH_CAPACITY);
  w.command(p,{type:'stashClose'});assert.equal(p.stashActive,false);
  assert.equal(safeHero(persistentHero(p)).stash.length,STASH_CAPACITY);
});

test('vendor potions spend once, retain counters on camp/death, and restore HP/MP independently',()=>{
  const w=new World(),p=newHero('Алхимик');w.add(p);w.mobs=[];
  w.vendorAvailable=()=>true;p.shopActive=true;p.gold=100;
  w.command(p,{type:'buyConsumable',kind:'hp',requestId:'hp-one'});
  w.command(p,{type:'buyConsumable',kind:'hp',requestId:'hp-one'});
  w.command(p,{type:'buyConsumable',kind:'mana',requestId:'mp-one'});
  assert.equal(p.potions,4);assert.equal(p.manaPotions,4);
  assert.equal(p.gold,100-CONSUMABLES.hp.price-CONSUMABLES.mana.price);
  p.hp=20;p.mana=0;w.command(p,{type:'potion'});w.command(p,{type:'potion',kind:'mana'});
  assert.equal(p.hp,65);assert.equal(p.mana,40);assert.equal(p.potions,3);assert.equal(p.manaPotions,3);
  assert.equal(p.potionCooldown,4);assert.equal(p.manaPotionCooldown,4);
  w.command(p,{type:'potion',kind:'hp'});w.command(p,{type:'potion',kind:'mana'});
  assert.equal(p.potions,3);assert.equal(p.manaPotions,3);
  w.camp(p,true);assert.equal(p.potions,3);assert.equal(p.manaPotions,3);
  Object.assign(p,{x:8,z:2,hp:1});w.damagePlayer(p,1000);
  assert(p.dead>0);assert.equal(p.potions,3);assert.equal(p.manaPotions,3);
  w.camp(p,true);assert.equal(p.potions,3);assert.equal(p.manaPotions,3);
  setBottles(p,'hp',CONSUMABLE_LIMIT);setBottles(p,'mana',CONSUMABLE_LIMIT);
  w.command(p,{type:'buyConsumable',kind:'hp'});w.command(p,{type:'buyConsumable',kind:'mana'});
  assert.equal(p.gold,100-CONSUMABLES.hp.price-CONSUMABLES.mana.price);
  const restored=safeHero(persistentHero(p));assert.equal(restored.potions,CONSUMABLE_LIMIT);assert.equal(restored.manaPotions,CONSUMABLE_LIMIT);
});

test('PostgreSQL stores stash locations and exact rolled item identity through withdrawal',
  {skip:!hasTestDatabase},async()=>{
  const db=await createTestDatabase(),store=await openHeroStore({connectionString:db.url});
  try{
    const token=randomUUID(),p=newHero('Сундук'),item=rollEquipment('copper-ring',randomUUID(),()=>.42),hero=persistentHero(p);
    hero.items.push(item);hero.stash.push(item.id);setBottles(hero,'hp',11);setBottles(hero,'mana',9);
    await store.commit([{token,hero,expectedRevision:0}],randomUUID(),'test chest deposit');
    assert.deepEqual((await store.load(token)).hero,hero);
    const client=new pg.Client({connectionString:db.url});await client.connect();
    try{
      const row=(await client.query('SELECT kind,position FROM inventory_locations WHERE item_id=$1',[item.id])).rows[0];
      assert.deepEqual(row,{kind:'stash',position:0});
      assert.equal(Number((await client.query('SELECT max(version) AS version FROM schema_migrations')).rows[0].version),4);
    }finally{await client.end();}
    const withdrawn=structuredClone(hero);withdrawn.stash=[];
    await store.commit([{token,hero:withdrawn,expectedRevision:1}],randomUUID(),'test chest withdraw');
    assert.deepEqual((await store.load(token)).hero,withdrawn);
    assert.deepEqual(withdrawn.items.find(candidate=>candidate.id===item.id),item);
  }finally{await store.close();await db.close();}
});

test('additive migrations through schema 4 preserve a version 1 hero and rolled bag item',
  {skip:!hasTestDatabase},async()=>{
  const db=await createTestDatabase();let store=await openHeroStore({connectionString:db.url});
  const token=randomUUID(),hero=persistentHero(newHero('Старый герой')),item=rollEquipment('copper-ring',randomUUID(),()=>.53);
  hero.items.push(item);setBottles(hero,'hp',2);
  try{
    await store.commit([{token,hero,expectedRevision:0}],randomUUID(),'old hero fixture');await store.close();store=null;
    const client=new pg.Client({connectionString:db.url});await client.connect();
    try{
      await client.query('BEGIN');
      await client.query('DELETE FROM schema_migrations WHERE version IN (2,3,4)');
      await client.query('DROP TABLE consumable_stacks');
      await client.query('ALTER TABLE heroes DROP COLUMN quick_slot_q,DROP COLUMN quick_slot_w,DROP COLUMN consumable_overflow');
      await client.query('ALTER TABLE heroes DROP COLUMN afk_preferences');
      await client.query('DROP INDEX one_stash_position');
      await client.query('ALTER TABLE inventory_locations DROP CONSTRAINT inventory_locations_check');
      await client.query('ALTER TABLE inventory_locations DROP CONSTRAINT inventory_locations_kind_check');
      await client.query("ALTER TABLE inventory_locations ADD CONSTRAINT inventory_locations_kind_check CHECK (kind IN ('bag','equipped','pending'))");
      await client.query("ALTER TABLE inventory_locations ADD CONSTRAINT inventory_locations_check CHECK ((kind='bag' AND position BETWEEN 0 AND 15 AND equipped_slot IS NULL) OR (kind='pending' AND position BETWEEN 0 AND 15 AND equipped_slot IS NULL) OR (kind='equipped' AND position IS NULL AND equipped_slot IN ('weapon','armor','helmet','boots','ring','amulet')))");
      await client.query('ALTER TABLE heroes DROP CONSTRAINT hp_potion_limit');
      await client.query('ALTER TABLE heroes DROP COLUMN mana_potions, DROP COLUMN mana_potion_cooldown');
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
    store=await openHeroStore({connectionString:db.url});
    const loaded=await store.load(token);
    assert.equal(loaded.revision,1);assert.equal(loaded.hero.id,hero.id);
    assert.equal(loaded.hero.potions,2);assert.equal(loaded.hero.manaPotions,3);
    assert.deepEqual(loaded.hero.stash,[]);assert.deepEqual(loaded.hero.items.find(candidate=>candidate.id===item.id),item);
  }finally{if(store)await store.close();await db.close();}
});
