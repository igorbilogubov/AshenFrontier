import fs from 'fs';
let world = fs.readFileSync('world.ts', 'utf8');
world = world.replace(/BAG_CAPACITY/g, 'p.bagCapacity');
world = world.replace(/import \{([^}]*)p\.bagCapacity([^}]*)\} from '\.\/public\/rules\.js';/, 'import {$1DEFAULT_BAG_CAPACITY$2} from \'./public/rules.js\';');
world = world.replace(/Math\.max\(0,usage-p\.bagCapacity\)/g, 'Math.max(0,usage-raw.bagCapacity??DEFAULT_BAG_CAPACITY)');
fs.writeFileSync('world.ts', world);
