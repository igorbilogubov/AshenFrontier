import { EQUIPMENT_ITEMS } from './public/game/equipment-items.js';

let failed = false;
for (const item of EQUIPMENT_ITEMS) {
  const expected = item.rarity === 0 ? 1 : item.rarity === 1 ? 2 : item.rarity === 2 ? 3 : 4;
  if (item.ranges.length !== expected) {
    console.error(`Item ${item.id} has ${item.ranges.length} ranges, expected ${expected} (rarity: ${item.rarity})`);
    failed = true;
  }
}
if (!failed) console.log("All items have correct number of ranges!");
