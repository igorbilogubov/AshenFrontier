/** Shared simulation and wire contracts. Browser input is still validated at runtime. */
export type ClassId = 'warrior' | 'archer' | 'mage';
export type SkillId = 'warrior-cleave' | 'warrior-whirlwind' | 'archer-piercing' | 'archer-volley' | 'mage-fireball' | 'mage-frost';
export type SkillCooldowns = Partial<Record<SkillId, number>>;
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
export interface HeroAttack { id: number; age: number; duration: number; weapon?: WeaponId; yaw: number | null; hit: boolean; special: boolean; skillId?: SkillId; automatic?: boolean }
export interface HeroInput extends Point { aim: number | null; seq: number }
export interface StatSource { classId?: ClassId; level?: number; allocatedStats?: unknown; statRevision?: number; items?: Item[]; equipment?: Equipment }
export interface CharacterStats {
  attributes: Attributes; allocatedStats: Attributes; unspentPoints: number; statRevision: number;
  maxHp: number; maxMana: number; hpRegen: number; manaRegen: number; attack: number; attackPower: number;
  armor: number; attackSpeed: number; hitChance: number; speedScale: number; range: number; xpNeeded: number; specialManaCost: number; damageReduction: number;
}
export interface PersistentHero extends Point {
  schemaVersion: number; id: string; name: string; classId: ClassId; level: number; xp: number; gold: number; kills: number;
  items: Item[]; pendingItems: Item[]; equipment: Equipment; allocatedStats: Attributes; statRevision: number;
  yaw: number; weapon: WeaponId; hp: number; mana: number; potions: number; potionCooldown: number;
  specialCooldown: number; skillCooldowns?: SkillCooldowns; dead: number; combatUntil: number; attack: HeroAttack | null; attackSerial: number;
  running: boolean; questKills: number; boss: boolean; questClaimed: boolean;
}
export interface AfkState { spotId: string; targetId: number | null }
export interface Hero extends PersistentHero {
  targetYaw: number; vx: number; vz: number; hurt: number; gait: number; moveBlend: number; runBlend: number;
  input: HeroInput; inputAt: number; ack: number; connected: boolean; disconnectAt: number; speedScale?: number; afk: AfkState | null;
}
export type MobType = 'wolf' | 'boar' | 'alpha';
export type MobState = 'idle' | 'chase' | 'windup' | 'recover' | 'return' | 'dead';
export interface PublicMob extends Point {
  type: MobType; id: number; homeX: number; homeZ: number; hp: number; state: MobState; timer: number;
  yaw: number; targetYaw: number; age: number; gait: number; speed: number; flash: number; target: string | null; slow?: number; spotId?: string;
}
export interface Mob extends PublicMob {
  contributors: Map<string, { at: number; damage: number; automatic?: boolean }>;
  slowUntil?: number;
  patrol?: { goal: Point | null; pause: number; leg: number; speed: number; age: number } | null;
}
export interface PublicProjectile extends Point { id: string; owner: string; yaw: number; remaining: number; speed: number; kind: 'archer' | 'mage'; skillId?: SkillId; attackId?: number }
export interface Projectile extends PublicProjectile { damage: number; aoe: number; maxTargets?: number; hitIds?: number[]; pierce?: boolean; damageScaleOnPierce?: number; automatic?: boolean }
export type PublicPlayer = Pick<Hero, 'id' | 'name' | 'classId' | 'x' | 'z' | 'yaw' | 'weapon' | 'hp' | 'level' | 'dead' | 'hurt' | 'attack' | 'moveBlend' | 'runBlend' | 'gait' | 'vx' | 'vz' | 'connected'> & { maxHp: number; appearance?:ItemAppearance };
export type SelfSnapshot = PersistentHero & {appearance?:ItemAppearance;afk?:AfkState|null} & Omit<CharacterStats, 'attack'> & Pick<Hero, 'targetYaw' | 'vx' | 'vz' | 'hurt' | 'gait' | 'moveBlend' | 'runBlend' | 'ack'>;
export interface EventPayloads {
  notice: { text: string }; statResult: { ok: boolean; revision: number; message?: string };
  safe: Record<never, never>; camp: Record<never, never>; death: Record<never, never>; quest: Record<never, never>;
  heal: Point & { amount: number }; hurt: Point & { amount: number }; hit: Point & { amount: number; id: number };
  miss: Point & { id: number }; level: { level: number; points: number }; item: { name: string; pending: boolean };
  kill: { id: number; name: string; xp: number }; loot: Point & { id: number; amount: number };
  skillImpact: Point & { skillId: SkillId; caster: string; attackId: number; yaw: number };
}
export type WorldEvent = { [K in keyof EventPayloads]: { type: K; owner?: string } & EventPayloads[K] }[keyof EventPayloads];
export type GameEvent = WorldEvent;
export interface WorldSnapshot { t: number; players: PublicPlayer[]; mobs: PublicMob[]; projectiles: PublicProjectile[]; self: SelfSnapshot | null; events: WorldEvent[] }
export interface ChatEntry { name: string; text: string; t: number }
export type ClientCommand =
  | ({ type: 'input' } & HeroInput) | { type: 'attack'; yaw: number; special?: boolean } | { type: 'skill'; skillId: SkillId; yaw: number } | { type: 'afk'; enabled: boolean }
  | { type: 'potion' | 'camp' | 'claim' } | { type: 'run'; running: boolean } | { type: 'weapon'; weapon: WeaponId }
  | { type: 'equip' | 'unequip' | 'sell'; id: string } | { type: 'allocateStats'; revision: number; points: Partial<Attributes> }
  | { type: 'resetStats'; revision: number };
export type ClientMessage = ClientCommand | { type: 'join'; protocol: 2; name: string; classId: ClassId; token?: string | null } | { type: 'chat'; text: string } | { type: 'ping'; t: number };
export type ServerMessage =
  | { type: 'welcome'; protocol: 2; id: string; token: string; chat: ChatEntry[] }
  | ({ type: 'state'; save: { at: number; ok: boolean } } & WorldSnapshot)
  | { type: 'chat'; entry: ChatEntry } | { type: 'error'; code: string; text: string } | { type: 'pong'; t: unknown };
export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject { [key: string]: JsonValue }
export function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export function isClassId(value: unknown): value is ClassId { return value === 'warrior' || value === 'archer' || value === 'mage'; }
export function isWeaponId(value: unknown): value is WeaponId { return value === 'sword' || value === 'axe'; }
export function isEquipmentSlot(value: unknown): value is EquipmentSlot { return typeof value === 'string' && ['weapon', 'armor', 'helmet', 'boots', 'ring', 'amulet'].includes(value); }
