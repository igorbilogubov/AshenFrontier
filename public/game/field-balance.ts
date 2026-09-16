import type {MobType} from '../../shared/types.js';

export interface FieldMobBalance {
  readonly level:number;
  readonly hp:number;
  readonly damage:number;
  readonly xp:number;
  readonly coins:number;
}

const frozen=<T extends FieldMobBalance>(value:T)=>Object.freeze(value);
export const FIELD_MOB_TYPES=['wolf','boar','bear','alpha','lynx','yak','frost-spider','ice-golem','ash-jackal','scorpion','monitor-lizard','scarab'] as const;
export type FieldMobType=(typeof FIELD_MOB_TYPES)[number];

/**
 * Ordinary field enemies only. Named elites and dungeon enemies layer their
 * own multipliers/overrides over these values in the authoritative mob config.
 */
export const FIELD_BALANCE:Readonly<Record<FieldMobType,Readonly<FieldMobBalance>>>=Object.freeze({
  wolf:frozen({level:1,hp:60,damage:8,xp:13,coins:8}),
  boar:frozen({level:4,hp:90,damage:12,xp:21,coins:12}),
  bear:frozen({level:7,hp:145,damage:15,xp:39,coins:21}),
  alpha:frozen({level:9,hp:190,damage:17,xp:57,coins:35}),
  lynx:frozen({level:10,hp:230,damage:20,xp:67,coins:28}),
  yak:frozen({level:14,hp:330,damage:25,xp:120,coins:36}),
  'frost-spider':frozen({level:18,hp:285,damage:28,xp:190,coins:40}),
  'ice-golem':frozen({level:22,hp:460,damage:36,xp:278,coins:52}),
  'ash-jackal':frozen({level:25,hp:620,damage:22,xp:356,coins:70}),
  scorpion:frozen({level:29,hp:800,damage:25,xp:475,coins:84}),
  'monitor-lizard':frozen({level:34,hp:960,damage:28,xp:648,coins:100}),
  scarab:frozen({level:39,hp:1250,damage:31,xp:849,coins:120}),
});

export const fieldBalance=(type:MobType)=>FIELD_BALANCE[type as FieldMobType];
