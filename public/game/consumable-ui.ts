import type {ConsumableDefinition} from './consumables.js';
import {actionIcon} from './action-icons.js';
import {INGOT_ID} from './smith.js';

const TIERS={
  basic:{rank:1,label:'I'},
  medium:{rank:2,label:'II'},
  large:{rank:3,label:'III'},
  greater:{rank:4,label:'IV'}
} as const;

export function consumableTier(definitionId:string){
  const suffix=definitionId.slice(definitionId.lastIndexOf('-')+1) as keyof typeof TIERS;
  return TIERS[suffix]??TIERS.basic;
}

const whetstoneSvg='<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M10 38 22 14h24l12 24-8 14H18Z" fill="#8d7d5c" stroke="#d7c39a" stroke-width="3"/><path d="M18 36h28M22 24h20" fill="none" stroke="#cbb892" stroke-width="2"/><path d="M16 42h32" stroke="#5e5340" stroke-width="3"/></svg>';
const ingotSvg='<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M14 24h36l8 22H6Z" fill="#c4a15a" stroke="#f0d48a" stroke-width="3"/><path d="M18 30h28l4 12H14Z" fill="#e0c378"/><path d="M12 46h40" stroke="#8a6a2e" stroke-width="3"/></svg>';

export function consumableArtwork(definition:ConsumableDefinition){
  if(definition.kind==='material'){
    return `<span class="smith-material ${definition.id===INGOT_ID?'smith-ingot':'smith-whetstone'}">${definition.id===INGOT_ID?ingotSvg:whetstoneSvg}</span>`;
  }
  const tier=consumableTier(definition.id);
  return `<span class="consumable-bottle consumable-tier-${tier.rank}">${actionIcon(definition.kind==='mana'?'mana-potion':'potion')}<b class="consumable-tier-badge">${tier.label}</b></span>`;
}
