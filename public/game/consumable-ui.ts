import type {ConsumableDefinition} from './consumables.js';
import {actionIcon} from './action-icons.js';

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

export function consumableArtwork(definition:ConsumableDefinition){
  const tier=consumableTier(definition.id);
  return `<span class="consumable-bottle consumable-tier-${tier.rank}">${actionIcon(definition.kind==='mana'?'mana-potion':'potion')}<b class="consumable-tier-badge">${tier.label}</b></span>`;
}
