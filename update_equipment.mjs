import fs from 'fs';

let content = fs.readFileSync('public/game/equipment-items.ts', 'utf8');

const adjustRangesFunc = `
function adjustRanges(item: ItemDefinition, count: number, scale: number): ItemDefinition['ranges'] {
  const result: ItemDefinition['ranges'][number][] = [];
  for (let i = 0; i < Math.min(count, item.ranges.length); i++) {
    const r = item.ranges[i];
    result.push({
      ...r,
      min: Math.round(Math.ceil(r.min * scale / (r.step ?? 1)) * (r.step ?? 1) * 1000) / 1000,
      max: Math.round(Math.ceil(r.max * scale / (r.step ?? 1)) * (r.step ?? 1) * 1000) / 1000
    });
  }
  const level = item.level || 1;
  const extraKeys: ItemStatKey[] = {
    weapon: ['haste', 'accuracy', 'maxHp', 'hpRegen'],
    armor: ['maxHp', 'maxMana', 'hpRegen', 'manaRegen'],
    helmet: ['accuracy', 'maxMana', 'maxHp', 'armor'],
    boots: ['hpRegen', 'maxHp', 'haste', 'armor'],
    ring: ['haste', 'accuracy', 'maxHp', 'attack'],
    amulet: ['manaRegen', 'hpRegen', 'maxMana', 'maxHp']
  }[item.slot] as ItemStatKey[];

  let keyIndex = 0;
  while (result.length < count && keyIndex < extraKeys.length) {
    const key = extraKeys[keyIndex++];
    if (result.some(r => r.key === key)) continue;
    let min = 1, max = 2, step = 1;
    switch (key) {
      case 'maxHp': min = 5 + level * 2; max = 15 + level * 3; break;
      case 'maxMana': min = 5 + level * 1.5; max = 10 + level * 2; break;
      case 'hpRegen': case 'manaRegen': min = 0.05 + level * 0.005; max = 0.15 + level * 0.01; step = 0.01; break;
      case 'haste': min = 1 + Math.floor(level/20); max = 3 + Math.floor(level/15); break;
      case 'accuracy': min = 1 + Math.floor(level/25); max = 2 + Math.floor(level/20); break;
      case 'armor': min = 1 + Math.floor(level/4); max = 2 + Math.floor(level/3); break;
      case 'attack': min = 1 + Math.floor(level/3); max = 3 + Math.floor(level/2.5); break;
    }
    min = Math.round(Math.ceil(min * scale / step) * step * 1000) / 1000;
    max = Math.round(Math.ceil(max * scale / step) * step * 1000) / 1000;
    result.push({ key, min, max, ...(step !== 1 ? {step} : {}) });
  }
  return result;
}
`;

// Insert the function before commonDefinitions
content = content.replace('const commonDefinitions=', adjustRangesFunc + '\nconst commonDefinitions=');

// Replace definitions
content = content.replace(/const commonDefinitions[^\n]+/,
  `const commonDefinitions=(items:readonly ItemDefinition[]):readonly ItemDefinition[]=>items.map(item=>({...item,id:\`\${item.id}-common-v1\`,name:\`\${item.name} простого качества\`,rarity:0 as const,ranges:adjustRanges(item, 1, 0.75)}));`
);

// We need to also wrap CLASS_ITEMS and REGIONAL_ITEMS to force 2 stats for green.
// But CLASS_ITEMS is defined literally above, so we don't necessarily want to map it there, but we must so they only have 2 ranges.
// Or we can redefine them after definition:
content = content.replace(/export const CLASS_ITEMS:Record[^\n]+/, 
  `export const CLASS_ITEMS:Record<ClassId,readonly ItemDefinition[]>={warrior:WARRIOR_ITEMS.map(i=>({...i,ranges:adjustRanges(i,2,1)})),archer:ARCHER_ITEMS.map(i=>({...i,ranges:adjustRanges(i,2,1)})),mage:MAGE_ITEMS.map(i=>({...i,ranges:adjustRanges(i,2,1)}));`
);

content = content.replace(/const rareDefinitions[^\n]+/,
  `const rareDefinitions=(items:readonly ItemDefinition[]):readonly ItemDefinition[]=>items.map(item=>({...item,id:\`\${item.id}-rare-v1\`,name:\`\${item.name} превосходства\`,rarity:2,ranges:adjustRanges(item, 3, 1.25)}));`
);

content = content.replace(/const scaledRanges[^\n]+/,
  `const scaledRanges=(item:ItemDefinition,scale:number)=>adjustRanges(item, 4, scale);`
);

// We need to fix validateEquipment
const validateRepl = `export function validateEquipment(item:Item){
  if(item.definitionId===undefined){if(item.rolls!==undefined||item.rollVersion!==undefined)throw new Error('Item rolls need a definition');return;}
  const definition=itemDefinition(item.definitionId);
  if(!definition||item.rarity!==(definition.rarity??1)||item.rollVersion!==1||item.slot!==definition.slot||item.classId!==definition.classId||item.itemLevel!==definition.level||!Array.isArray(item.rolls))throw new Error('Invalid saved equipment structure');
  
  if(item.rolls.length > definition.ranges.length){
    item.rolls = item.rolls.slice(0, definition.ranges.length);
  } else if (item.rolls.length < definition.ranges.length) {
    for(let i=item.rolls.length; i<definition.ranges.length; i++){
      const r = definition.ranges[i];
      item.rolls.push({...r, value: r.min});
    }
  }

  for(let i=0;i<definition.ranges.length;i++){
    const roll=item.rolls[i],range=definition.ranges[i];
    if(!roll||roll.key!==range.key)throw new Error('Invalid saved equipment roll');
    // Not enforcing strict value bounds on load to avoid breaking saves when we adjust stat scales
  }
  if(item.power!==item.rolls[0].value)throw new Error('Invalid equipment primary value');
}`;

content = content.replace(/export function validateEquipment[\s\S]*?if\(item\.power!==item\.rolls\[0\]\.value\)[^\n]+\n}/, validateRepl);

fs.writeFileSync('public/game/equipment-items.ts', content);
