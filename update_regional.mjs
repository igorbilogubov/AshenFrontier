import fs from 'fs';
let content = fs.readFileSync('public/game/regional-equipment.ts', 'utf8');

// The collection function returns the ItemDefinition. We just need to slice all ranges to 2!
content = content.replace(/ranges:ranges\[slot\]/g, 'ranges:ranges[slot].slice(0, 2)');

fs.writeFileSync('public/game/regional-equipment.ts', content);
