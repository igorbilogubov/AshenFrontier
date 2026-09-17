import fs from 'fs';

// 1. Update shared/types.ts
let types = fs.readFileSync('shared/types.ts', 'utf8');
types = types.replace(
  'consumableInventory:ConsumableStack[];quickSlots:QuickSlots;consumableOverflow:number;',
  'consumableInventory:ConsumableStack[];quickSlots:QuickSlots;consumableOverflow:number;\n  bagCapacity: number; stashCapacity: number;'
);
fs.writeFileSync('shared/types.ts', types);

// 2. Update storage/postgres.ts load
let pg = fs.readFileSync('storage/postgres.ts', 'utf8');
pg = pg.replace(
  'xp:numeric(row.xp),gold:numeric(row.gold),kills:row.kills,items,pendingItems,stash,equipment,consumableInventory,quickSlots:{q:row.quick_slot_q,w:row.quick_slot_w},consumableOverflow:row.consumable_overflow,',
  'xp:numeric(row.xp),gold:numeric(row.gold),kills:row.kills,items,pendingItems,stash,equipment,consumableInventory,quickSlots:{q:row.quick_slot_q,w:row.quick_slot_w},consumableOverflow:row.consumable_overflow,bagCapacity:row.bag_capacity??16,stashCapacity:row.stash_capacity??32,'
);
// 3. Update storage/postgres.ts save bounds check
// Replace hardcoded capacities
pg = pg.replace(
  'if(hero.items.length>22+STASH_CAPACITY||hero.pendingItems.length>16||hero.stash.length>STASH_CAPACITY)throw new Error(\'Inventory capacity exceeded\');',
  'if(hero.items.length>22+hero.stashCapacity||hero.pendingItems.length>16||hero.stash.length>hero.stashCapacity)throw new Error(\'Inventory capacity exceeded\');'
);

// 4. Update save query in storage/postgres.ts
// Need to find the exact UPDATE heroes SET ...
const saveQueryMatch = pg.match(/UPDATE heroes SET .*?WHERE id=\$\d+/s);
if (saveQueryMatch) {
  let saveQuery = saveQueryMatch[0];
  if (!saveQuery.includes('bag_capacity=')) {
    saveQuery = saveQuery.replace(
      'consumable_overflow=$25,',
      'consumable_overflow=$25, bag_capacity=$26, stash_capacity=$27,'
    );
    // Find the bindings
    const bindMatch = pg.match(/hero\.quickSlots\.w,\s*hero\.consumableOverflow\s*\]/);
    if (bindMatch) {
      pg = pg.replace(
        bindMatch[0],
        'hero.quickSlots.w, hero.consumableOverflow, hero.bagCapacity, hero.stashCapacity ]'
      );
      pg = pg.replace(saveQueryMatch[0], saveQuery);
    } else {
      console.error("Could not find save bindings!");
    }
  }
} else {
  console.error("Could not find save query!");
}

fs.writeFileSync('storage/postgres.ts', pg);

// 5. Update storage/schema.ts
let schema = fs.readFileSync('storage/schema.ts', 'utf8');
const mig8 = 'await client.query(\'INSERT INTO schema_migrations(version) VALUES (8)\');}';
const mig9 = `
    const ninth=await client.query<{version:number}>('SELECT version FROM schema_migrations WHERE version=9');
    if(!ninth.rowCount){await client.query(\`
      ALTER TABLE heroes ADD COLUMN bag_capacity integer NOT NULL DEFAULT 16 CHECK (bag_capacity BETWEEN 16 AND 256);
      ALTER TABLE heroes ADD COLUMN stash_capacity integer NOT NULL DEFAULT 32 CHECK (stash_capacity BETWEEN 32 AND 256);
      ALTER TABLE inventory_locations DROP CONSTRAINT IF EXISTS inventory_locations_check;
      ALTER TABLE inventory_locations ADD CONSTRAINT inventory_locations_check CHECK (
        (kind='bag' AND position BETWEEN 0 AND 255 AND equipped_slot IS NULL) OR
        (kind='pending' AND position BETWEEN 0 AND 15 AND equipped_slot IS NULL) OR
        (kind='stash' AND position BETWEEN 0 AND 255 AND equipped_slot IS NULL) OR
        (kind='equipped' AND position IS NULL AND equipped_slot IN ('weapon','armor','helmet','boots','ring','amulet'))
      );
    \`);await client.query('INSERT INTO schema_migrations(version) VALUES (9)');}
`;
if (!schema.includes('version=9')) {
  schema = schema.replace(mig8, mig8 + mig9);
}
fs.writeFileSync('storage/schema.ts', schema);
