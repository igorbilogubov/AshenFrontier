import fs from 'fs';

let ts = fs.readFileSync('storage/postgres.ts', 'utf8');

// Update serializeHero to bind bagCapacity and stashCapacity
ts = ts.replace(
  'JSON.stringify(hero.skillBuild),hero.buildRevision,JSON.stringify(hero.skillPresets)];',
  'JSON.stringify(hero.skillBuild),hero.buildRevision,JSON.stringify(hero.skillPresets),hero.bagCapacity,hero.stashCapacity];'
);
// Update heroColumns to include bag_capacity, stash_capacity
ts = ts.replace(
  'skill_build,build_revision,skill_presets`;',
  'skill_build,build_revision,skill_presets,bag_capacity,stash_capacity`;'
);

// We need to also replace BAG_CAPACITY and STASH_CAPACITY inside `checkEntry`
ts = ts.replace(
  'if(backpackItems(hero).length>BAG_CAPACITY)throw new Error(\'Backpack capacity exceeded\');',
  'if(backpackItems(hero).length>hero.bagCapacity)throw new Error(\'Backpack capacity exceeded\');'
);
ts = ts.replace(
  'backpackUsage(hero)>BAG_CAPACITY+hero.consumableOverflow',
  'backpackUsage(hero)>hero.bagCapacity+hero.consumableOverflow'
);
ts = ts.replace(
  'Math.max(0,backpackUsage(hero)-BAG_CAPACITY)',
  'Math.max(0,backpackUsage(hero)-hero.bagCapacity)'
);
fs.writeFileSync('storage/postgres.ts', ts);

// public/rules.ts
let rules = fs.readFileSync('public/rules.ts', 'utf8');
rules = rules.replace('export const BAG_CAPACITY=16;', 'export const DEFAULT_BAG_CAPACITY=16;');
rules = rules.replace('export const STASH_CAPACITY=32;', 'export const DEFAULT_STASH_CAPACITY=32;\nexport const MAX_BAG_CAPACITY=255;\nexport const MAX_STASH_CAPACITY=255;\nexport const BAG_SLOT_PRICE=500;\nexport const STASH_SLOT_PRICE=500;');
fs.writeFileSync('public/rules.ts', rules);
