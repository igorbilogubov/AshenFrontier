/** Shared simulation and wire contracts. Browser input is still validated at runtime. */
export type ClassId = 'warrior' | 'archer' | 'mage';
export type SkillId = 'warrior-cleave' | 'warrior-whirlwind' | 'warrior-earthquake' | 'archer-piercing' | 'archer-volley' | 'archer-arrow-storm' | 'mage-fireball' | 'mage-frost' | 'mage-arcane-nova' | 'warrior-thrust' | 'warrior-shockwave' | 'archer-frost-shot' | 'archer-rain' | 'mage-lightning' | 'mage-meteor' | 'warrior-heavy' | 'warrior-bleed' | 'warrior-charge' | 'warrior-leap' | 'warrior-guard' | 'warrior-berserk' | 'warrior-shout' | 'warrior-banner' | 'archer-aimed' | 'archer-poison' | 'archer-retreat' | 'archer-roll' | 'archer-trap' | 'archer-focus' | 'archer-wind' | 'archer-smoke' | 'mage-ice-lance' | 'mage-beam' | 'mage-teleport' | 'mage-ice-step' | 'mage-mana-shield' | 'mage-seals' | 'mage-ward' | 'mage-mana-source';
export type SkillLoadout = [SkillId|null,SkillId|null,SkillId|null,SkillId|null,SkillId|null];
export interface SkillBuild {slots:SkillLoadout;talents:Record<string,number>}
export interface SkillEffect {skillId:SkillId;remaining:number}
export interface SkillZone extends Point {id:string;owner:string;skillId:SkillId;radius:number;remaining:number}
export type SkillCooldowns = Partial<Record<SkillId, number>>;
export interface AfkPreferences {
  pickupGold:boolean;pickupRarities:number[];
  hpPotion:{enabled:boolean;belowPercent:number};manaPotion:{enabled:boolean;belowPercent:number};
  attackSkill:SkillId|null;buffSkills:SkillId[];basicAttackFallback:boolean;radiusPercent:number;
}
export type WeaponId = 'sword' | 'axe';
export type EquipmentSlot = 'weapon' | 'armor' | 'helmet' | 'boots' | 'ring' | 'amulet';
export type StatKey = 'strength' | 'dexterity' | 'vitality' | 'energy';
export type Attributes = Record<StatKey, number>;
export type Equipment = Partial<Record<EquipmentSlot, string | null>>;
export interface Point { x: number; z: number }
export type ItemStatKey = 'attack' | 'armor' | 'maxHp' | 'maxMana' | 'hpRegen' | 'manaRegen' | 'accuracy' | 'haste';
export interface ItemRoll { key:ItemStatKey; value:number; min:number; max:number; step?:number }
export type ItemAppearance = Partial<Record<EquipmentSlot,string|null>>;
export interface Item { definitionId?:string; rollVersion?:1; itemLevel?:number; rolls?:ItemRoll[]; id: string; name: string; slot: EquipmentSlot; rarity: number; power: number; classId?: ClassId; bound?: boolean }
export interface ConsumableStack {id:string;definitionId:string;quantity:number}
export type QuickSlot='q'|'w';
export type QuickSlots=Record<QuickSlot,string|null>;
export interface HeroAttack { id: number; age: number; duration: number; weapon?: WeaponId; yaw: number | null; hit: boolean; special: boolean; skillId?: SkillId; automatic?: boolean; targetId?: number; target?: Point }
export interface HeroInput extends Point { aim: number | null; seq: number }
export interface StatSource { classId?: ClassId; level?: number; allocatedStats?: unknown; statRevision?: number; items?: Item[]; equipment?: Equipment }
export interface CharacterStats {
  attributes: Attributes; allocatedStats: Attributes; unspentPoints: number; statRevision: number;
  maxHp: number; maxMana: number; hpRegen: number; manaRegen: number; attack: number; attackPower: number;
  armor: number; attackSpeed: number; hitChance: number; speedScale: number; range: number; xpNeeded: number; specialManaCost: number; damageReduction: number;
}
export interface PersistentHero extends Point {
  schemaVersion: number; id: string; name: string; classId: ClassId; level: number; xp: number; gold: number; kills: number;
  items: Item[]; pendingItems: Item[]; stash: string[]; equipment: Equipment; allocatedStats: Attributes; statRevision: number;
  skillBuild:SkillBuild;buildRevision:number;skillPresets:[SkillBuild|null,SkillBuild|null,SkillBuild|null];
  consumableInventory:ConsumableStack[];quickSlots:QuickSlots;consumableOverflow:number;
  bagCapacity: number; stashCapacity: number; bag: (string|null)[];
  yaw: number; weapon: WeaponId; hp: number; mana: number; potions: number; potionCooldown: number; manaPotions:number; manaPotionCooldown:number;
  specialCooldown: number; skillCooldowns?: SkillCooldowns; dead: number; combatUntil: number; attack: HeroAttack | null; attackSerial: number;
  running: boolean; questKills: number; boss: boolean; questClaimed: boolean; afkPreferences:AfkPreferences;
}
export interface AfkState { anchor:Point; spotId?:string; targetId:number|null; skillCursor:number }
export interface GroundDrop extends Point { id:string; kind:'item'|'gold'; item?:Item; amount?:number; expiresAt:number }
export interface InteractionTarget { kind:'loot'|'vendor'|'portal'|'chest'|'travel'; id:string }
export interface Hero extends PersistentHero {
  campReturn?:Point & {until:number};
  actionRecoveryUntil?:number;navigationPlanAt?:number;
  navigation?:{target:Point;path:Point[];startedAt:number};attackTargetId?:number;attackRepathAt?:number;travelPortalId?:string;
  targetYaw: number; vx: number; vz: number; hurt: number; gait: number; moveBlend: number; runBlend: number;
  input: HeroInput; inputAt: number; ack: number; connected: boolean; disconnectAt: number; speedScale?: number; afk: AfkState | null;
  xpLog?:{t:number;xp:number}[];
  interactionTarget:InteractionTarget|null; shopActive:boolean; stashActive:boolean;
  effects:SkillEffect[];channel?:{skillId:SkillId;heldUntil:number;nextTick:number;targetId?:number;yaw:number};mobility?:{from:Point;to:Point;age:number;duration:number;skillId:SkillId};shieldBudget?:number;manaSourceReceived?:{amount:number;resetAt:number};
}
export type FieldRegionId='forest'|'snow'|'wasteland'|'swamp'|'mines'|'rift'|'citadel';
export type DungeonId=`${FieldRegionId}-dungeon`;
export type LocationId=FieldRegionId|DungeonId|'stadium';
export interface BossTelegraph extends Point {kind:'cone'|'circle'|'ring';yaw:number;radius:number;innerRadius:number;halfAngle:number;remaining:number;duration:number}
export interface DungeonProgress {id:DungeonId;guardsRemaining:number;bossDefeated:boolean;resetIn:number}
export type MobType = 'swamp-frog'|'marsh-crocodile'|'plague-mosquito'|'bog-spider'|'cave-bat'|'cave-crawler'|'crystal-beetle'|'stone-guardian'|'hellhound'|'lava-elemental'|'ember-crab'|'basalt-brute'|'bonehound'|'gargoyle'|'void-stalker'|'iron-warden'| 'wolf' | 'boar' | 'alpha' | 'bear' | 'lynx' | 'yak' | 'frost-spider' | 'ice-golem' | 'ash-jackal' | 'scorpion' | 'monitor-lizard' | 'scarab';
export type MobState = 'idle' | 'chase' | 'windup' | 'recover' | 'return' | 'dead';
export interface PublicMob extends Point {
  type: MobType; eliteId?:string; bossId?:DungeonId; dungeonId?:DungeonId; bossLocked?:boolean; telegraph?:BossTelegraph; id: number; homeX: number; homeZ: number; hp: number; state: MobState; timer: number;
  yaw: number; targetYaw: number; age: number; gait: number; speed: number; flash: number; target: string | null; slow?: number; spotId?: string;
}
export interface Mob extends PublicMob {
  contributors: Map<string, { at: number; damage: number; automatic?: boolean }>;
  slowUntil?: number; rootUntil?:number;rootImmunityUntil?:number; dots?:{owner:string;skillId:SkillId;remaining:number;nextTick:number;damage:number;automatic:boolean}[];
  patrol?: { goal: Point | null; pause: number; leg: number; speed: number; age: number } | null;
}
export interface PublicProjectile extends Point { id: string; owner: string; yaw: number; remaining: number; speed: number; kind: 'archer' | 'mage'; skillId?: SkillId; attackId?: number }
export interface Projectile extends PublicProjectile { damage: number; aoe: number; maxTargets?: number; hitIds?: number[]; pierce?: boolean; damageScaleOnPierce?: number; slowMs?: number; automatic?: boolean; targetId?:number; dot?:{skillId:SkillId;damage:number;duration:number};rootMs?:number }
export type PublicPlayer = Pick<Hero, 'id' | 'name' | 'classId' | 'x' | 'z' | 'yaw' | 'weapon' | 'hp' | 'level' | 'dead' | 'hurt' | 'attack' | 'moveBlend' | 'runBlend' | 'gait' | 'vx' | 'vz' | 'connected'> & { maxHp: number; effects?:SkillEffect[]; appearance?:ItemAppearance };
export type OnlinePlayer = Pick<Hero,'id'|'name'|'classId'|'level'> & {location:LocationId};
export type SelfSnapshot = PersistentHero & {navigationTarget?:Point|null;attackTargetId?:number|null;travelPortalId?:string;campReturnRemaining?:number;appearance?:ItemAppearance;afk?:AfkState|null;afkRadius?:number;afkXpMinute?:number;interactionTarget?:InteractionTarget|null;shopActive?:boolean;stashActive?:boolean} & Omit<CharacterStats, 'attack'> & Pick<Hero, 'targetYaw' | 'vx' | 'vz' | 'hurt' | 'gait' | 'moveBlend' | 'runBlend' | 'ack'>;
export interface EventPayloads {
  buildResult:{ok:boolean;revision:number;message?:string};
  notice: { text: string }; statResult: { ok: boolean; revision: number; message?: string }; preferencesSaved:{ok:boolean;message?:string};
  safe: Record<never, never>; camp: Record<never, never>; death: Record<never, never>; quest: Record<never, never>;
  heal: Point & { amount: number }; hurt: Point & { amount: number }; hit: Point & { amount: number; id: number };
  miss: Point & { id: number }; level: { level: number; points: number }; item: { name: string; pending: boolean };
  kill: { id: number; name: string; xp: number }; loot: Point & { id: number; amount: number };
  shopOpen:{npcId:string};
  stashOpened:{npcId:string};
  travelOpened:{portalId:string};
  portal:{portalId:string;location:LocationId};
  skillImpact: Point & { skillId: SkillId; caster: string; attackId: number; yaw: number; phase?: 'warning' | 'impact' | 'start' | 'end'; delay?: number; radius?: number; from?: Point };
}
export type WorldEvent = { [K in keyof EventPayloads]: { type: K; owner?: string } & EventPayloads[K] }[keyof EventPayloads];
export type GameEvent = WorldEvent;
export interface WorldSnapshot { dungeon?:DungeonProgress; t: number; players: PublicPlayer[]; onlinePlayers:OnlinePlayer[]; mobs: PublicMob[]; projectiles: PublicProjectile[]; groundLoot:GroundDrop[]; skillZones?:SkillZone[]; self: SelfSnapshot | null; events: WorldEvent[] }
export interface ChatEntry { name: string; text: string; t: number }
export type ClientCommand =
  | {type:'buildApply';revision:number;build:SkillBuild} | {type:'buildSavePreset';index:0|1|2} | {type:'buildLoadPreset';revision:number;index:0|1|2} | {type:'skillStop'}
  | ({ type: 'input' } & HeroInput) | { type: 'attack'; yaw: number; special?: boolean; targetId?:number;approach?:boolean } | { type: 'skill'; skillId: SkillId; yaw: number; targetId?:number; target?:Point } | { type: 'afk'; enabled: boolean } | {type:'afkPreferences';preferences:AfkPreferences}
  | { type: 'potion'; kind?:'hp'|'mana' } | {type:'camp'|'claim'|'stashOpen'|'stashClose'} | {type:'stashDeposit'|'stashWithdraw';id:string} | { type: 'run'; running: boolean } | { type: 'weapon'; weapon: WeaponId }
  | { type: 'equip' | 'unequip' | 'sell'; id: string } | { type: 'bagMove'; id: string; slot: number } | { type: 'allocateStats'; revision: number; points: Partial<Attributes> }
  | {type:'pickup';id:string} | {type:'interact';npcId:string} | {type:'cancelInteraction'}
  | {type:'buy';definitionId:string;requestId?:string}
  | {type:'buyBagSlot'} | {type:'buyStashSlot'}
  | {type:'buyConsumable';definitionId:string;quantity:1|50;requestId?:string}
  | {type:'buyConsumable';kind:'hp'|'mana';requestId?:string}
  | {type:'assignConsumable';slot:QuickSlot;definitionId:string|null} | {type:'useConsumable';slot:QuickSlot}
  | {type:'portal';portalId:string}
  | {type:'moveTo';target:Point} | {type:'pickupNearest'} | {type:'travelOpen';portalId:string} | {type:'travel';portalId:string;destinationId:string}
  | { type: 'resetStats'; revision: number };
export type ClientMessage = ClientCommand | { type: 'join'; protocol: 3; heroId: string } | { type: 'chat'; text: string } | { type: 'ping'; t: number };
export type ServerMessage =
  | { type: 'welcome'; protocol: 3; id: string; chat: ChatEntry[] }
  | ({ type: 'state'; save: { at: number; ok: boolean } } & WorldSnapshot)
  | { type: 'chat'; entry: ChatEntry } | { type: 'error'; code: string; text: string } | { type: 'pong'; t: unknown };
export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject { [key: string]: JsonValue }
export function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export function isClassId(value: unknown): value is ClassId { return value === 'warrior' || value === 'archer' || value === 'mage'; }
export function isWeaponId(value: unknown): value is WeaponId { return value === 'sword' || value === 'axe'; }
export function isEquipmentSlot(value: unknown): value is EquipmentSlot { return typeof value === 'string' && ['weapon', 'armor', 'helmet', 'boots', 'ring', 'amulet'].includes(value); }
