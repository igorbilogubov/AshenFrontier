import type {PoolClient} from 'pg';

// The migration is embedded so both source execution and dist execution use the
// exact same schema, including in the production Docker image.
const initialSchema=`
CREATE TABLE heroes (
  id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  token_hash char(64) NOT NULL UNIQUE,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  schema_version integer NOT NULL CHECK (schema_version >= 3),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 64),
  class_id text NOT NULL CHECK (class_id IN ('warrior','archer','mage')),
  level integer NOT NULL CHECK (level >= 1),
  xp numeric NOT NULL CHECK (xp >= 0 AND xp < 1000000000000000),
  gold numeric NOT NULL CHECK (gold >= 0 AND gold < 1000000000000000),
  kills integer NOT NULL CHECK (kills >= 0),
  stat_revision integer NOT NULL CHECK (stat_revision >= 0),
  strength integer NOT NULL CHECK (strength >= 0),
  dexterity integer NOT NULL CHECK (dexterity >= 0),
  vitality integer NOT NULL CHECK (vitality >= 0),
  energy integer NOT NULL CHECK (energy >= 0),
  x double precision NOT NULL CHECK (x > -1000000 AND x < 1000000),
  z double precision NOT NULL CHECK (z > -1000000 AND z < 1000000),
  yaw double precision NOT NULL CHECK (yaw > -1000000 AND yaw < 1000000),
  weapon text NOT NULL CHECK (weapon IN ('sword','axe')),
  hp double precision NOT NULL CHECK (hp >= 0 AND hp < 1000000000),
  mana double precision NOT NULL CHECK (mana >= 0 AND mana < 1000000000),
  potions integer NOT NULL CHECK (potions >= 0),
  potion_cooldown double precision NOT NULL CHECK (potion_cooldown >= 0 AND potion_cooldown < 1000000000),
  special_cooldown double precision NOT NULL CHECK (special_cooldown >= 0 AND special_cooldown < 1000000000),
  dead double precision NOT NULL CHECK (dead >= 0 AND dead < 1000000000),
  combat_until double precision NOT NULL CHECK (combat_until >= 0 AND combat_until < 1000000000000000),
  attack_serial integer NOT NULL CHECK (attack_serial >= 0),
  running boolean NOT NULL,
  quest_kills integer NOT NULL CHECK (quest_kills >= 0),
  boss boolean NOT NULL,
  quest_claimed boolean NOT NULL,
  skill_cooldowns jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(skill_cooldowns) = 'object'),
  attack jsonb CHECK (attack IS NULL OR jsonb_typeof(attack) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE item_identity (
  id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  fingerprint char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE item_instances (
  id text PRIMARY KEY REFERENCES item_identity(id),
  hero_id text NOT NULL REFERENCES heroes(id) ON DELETE CASCADE,
  item_index integer NOT NULL CHECK (item_index >= 0),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 128),
  slot text NOT NULL CHECK (slot IN ('weapon','armor','helmet','boots','ring','amulet')),
  rarity integer NOT NULL CHECK (rarity >= 0),
  power double precision NOT NULL CHECK (power >= 0 AND power < 1000000000),
  class_id text CHECK (class_id IS NULL OR class_id IN ('warrior','archer','mage')),
  bound boolean,
  definition_id text,
  roll_version integer CHECK (roll_version IS NULL OR roll_version = 1),
  item_level integer CHECK (item_level IS NULL OR item_level >= 1),
  sealed boolean NOT NULL DEFAULT false,
  UNIQUE (hero_id,id), UNIQUE (hero_id,item_index)
);
CREATE TABLE item_rolls (
  item_id text NOT NULL REFERENCES item_instances(id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  stat_key text NOT NULL CHECK (stat_key IN ('attack','armor','maxHp','maxMana','hpRegen','manaRegen','accuracy','haste')),
  value double precision NOT NULL,
  min_value double precision NOT NULL,
  max_value double precision NOT NULL,
  step double precision,
  PRIMARY KEY (item_id,ordinal),
  CHECK (min_value >= 0 AND max_value >= min_value AND value >= min_value AND value <= max_value),
  CHECK (max_value < 1000000000 AND (step IS NULL OR (step > 0 AND step < 1000000000)))
);
CREATE TABLE inventory_locations (
  item_id text PRIMARY KEY,
  hero_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('bag','equipped','pending')),
  position integer,
  equipped_slot text,
  FOREIGN KEY (hero_id,item_id) REFERENCES item_instances(hero_id,id) ON DELETE CASCADE,
  CHECK (
    (kind='bag' AND position BETWEEN 0 AND 15 AND equipped_slot IS NULL) OR
    (kind='pending' AND position BETWEEN 0 AND 15 AND equipped_slot IS NULL) OR
    (kind='equipped' AND position IS NULL AND equipped_slot IN ('weapon','armor','helmet','boots','ring','amulet'))
  )
);
CREATE UNIQUE INDEX one_bag_position ON inventory_locations(hero_id,position) WHERE kind='bag';
CREATE UNIQUE INDEX one_pending_position ON inventory_locations(hero_id,position) WHERE kind='pending';
CREATE UNIQUE INDEX one_equipped_slot ON inventory_locations(hero_id,equipped_slot) WHERE kind='equipped';
CREATE TABLE operation_journal (
  operation_id text PRIMARY KEY CHECK (length(operation_id) BETWEEN 1 AND 256),
  payload_hash char(64) NOT NULL,
  receipt jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text CHECK (reason IS NULL OR length(reason) <= 256),
  economic_changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION reject_item_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Rolled item instances are immutable' USING ERRCODE='23514';
END $$;
CREATE TRIGGER immutable_item_core BEFORE UPDATE OF name,slot,rarity,power,class_id,bound,definition_id,roll_version,item_level
  ON item_instances FOR EACH ROW EXECUTE FUNCTION reject_item_mutation();
CREATE FUNCTION guard_item_seal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.sealed AND NOT NEW.sealed THEN
    RAISE EXCEPTION 'Rolled item instances are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_item_seal BEFORE UPDATE OF sealed ON item_instances
  FOR EACH ROW EXECUTE FUNCTION guard_item_seal();
CREATE FUNCTION guard_item_roll() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE subject_id text;
BEGIN
  subject_id := CASE WHEN TG_OP='INSERT' THEN NEW.item_id ELSE OLD.item_id END;
  IF EXISTS(SELECT 1 FROM item_instances WHERE id=subject_id AND sealed) THEN
    RAISE EXCEPTION 'Rolled item instances are immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_item_roll BEFORE INSERT OR UPDATE OR DELETE ON item_rolls
  FOR EACH ROW EXECUTE FUNCTION guard_item_roll();
CREATE TRIGGER immutable_item_identity BEFORE UPDATE OR DELETE ON item_identity FOR EACH ROW EXECUTE FUNCTION reject_item_mutation();
`;

// Additive: the old hero rows and immutable item identities remain untouched.
const personalStashSchema=`
ALTER TABLE heroes ADD COLUMN mana_potions integer NOT NULL DEFAULT 3 CHECK (mana_potions BETWEEN 0 AND 50);
ALTER TABLE heroes ADD COLUMN mana_potion_cooldown double precision NOT NULL DEFAULT 0 CHECK (mana_potion_cooldown >= 0 AND mana_potion_cooldown < 1000000000);
ALTER TABLE heroes ADD CONSTRAINT hp_potion_limit CHECK (potions BETWEEN 0 AND 50);
ALTER TABLE inventory_locations DROP CONSTRAINT inventory_locations_kind_check;
ALTER TABLE inventory_locations DROP CONSTRAINT inventory_locations_check;
ALTER TABLE inventory_locations ADD CONSTRAINT inventory_locations_kind_check CHECK (kind IN ('bag','equipped','pending','stash'));
ALTER TABLE inventory_locations ADD CONSTRAINT inventory_locations_check CHECK (
  (kind='bag' AND position BETWEEN 0 AND 15 AND equipped_slot IS NULL) OR
  (kind='pending' AND position BETWEEN 0 AND 15 AND equipped_slot IS NULL) OR
  (kind='stash' AND position BETWEEN 0 AND 31 AND equipped_slot IS NULL) OR
  (kind='equipped' AND position IS NULL AND equipped_slot IN ('weapon','armor','helmet','boots','ring','amulet'))
);
CREATE UNIQUE INDEX one_stash_position ON inventory_locations(hero_id,position) WHERE kind='stash';
`;

const afkPreferencesSchema=`
ALTER TABLE heroes ADD COLUMN afk_preferences jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(afk_preferences)='object');
`;

// Each existing positive counter becomes one owned stack, without touching gear,
// resources, progression, identities or revisions. Existing full bags keep both.
const consumableInventorySchema=`
CREATE TABLE consumable_stacks (
  id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  hero_id text NOT NULL REFERENCES heroes(id) ON DELETE CASCADE,
  definition_id text NOT NULL CHECK (length(definition_id) BETWEEN 1 AND 128),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 50),
  stack_index integer NOT NULL CHECK (stack_index >= 0),
  UNIQUE (hero_id,definition_id), UNIQUE (hero_id,stack_index)
);
ALTER TABLE heroes ADD COLUMN quick_slot_q text DEFAULT 'hp-basic';
ALTER TABLE heroes ADD COLUMN quick_slot_w text DEFAULT 'mana-basic';
ALTER TABLE heroes ADD COLUMN consumable_overflow integer NOT NULL DEFAULT 0 CHECK (consumable_overflow BETWEEN 0 AND 2);
INSERT INTO consumable_stacks(id,hero_id,definition_id,quantity,stack_index)
  SELECT 'migrated-hp-'||md5(id),id,'hp-basic',potions,0 FROM heroes WHERE potions>0;
INSERT INTO consumable_stacks(id,hero_id,definition_id,quantity,stack_index)
  SELECT 'migrated-mana-'||md5(id),id,'mana-basic',mana_potions,CASE WHEN potions>0 THEN 1 ELSE 0 END FROM heroes WHERE mana_potions>0;
UPDATE heroes h SET consumable_overflow=GREATEST(0,
  (SELECT count(*) FROM inventory_locations i WHERE i.hero_id=h.id AND i.kind='bag') +
  (SELECT count(*) FROM consumable_stacks c WHERE c.hero_id=h.id) - 16);
`;

// Legacy guest heroes remain intact but cannot be claimed by an OAuth account.
const accountsSchema=`
CREATE TABLE accounts (
  id uuid PRIMARY KEY,
  google_sub text NOT NULL UNIQUE CHECK (length(google_sub) BETWEEN 1 AND 255),
  email text NOT NULL CHECK (length(email) BETWEEN 1 AND 320),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 256),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE heroes DROP COLUMN token_hash;
ALTER TABLE heroes ADD COLUMN account_id uuid REFERENCES accounts(id);
ALTER TABLE heroes ADD COLUMN account_slot integer CHECK (account_slot BETWEEN 1 AND 5);
ALTER TABLE heroes ADD CONSTRAINT hero_account_slot CHECK ((account_id IS NULL) = (account_slot IS NULL));
ALTER TABLE heroes ADD CONSTRAINT account_character_slots UNIQUE (account_id,account_slot);
CREATE FUNCTION assign_character_slot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.account_id IS DISTINCT FROM OLD.account_id OR NEW.account_slot IS DISTINCT FROM OLD.account_slot THEN
      RAISE EXCEPTION 'Hero ownership cannot change' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.account_id IS NULL THEN
    RAISE EXCEPTION 'Account required for new heroes' USING ERRCODE='23514';
  END IF;
  PERFORM 1 FROM accounts WHERE id=NEW.account_id FOR UPDATE;
  SELECT slot INTO NEW.account_slot FROM generate_series(1,5) slot
    WHERE NOT EXISTS (SELECT 1 FROM heroes WHERE account_id=NEW.account_id AND account_slot=slot)
    ORDER BY slot LIMIT 1;
  IF NEW.account_slot IS NULL THEN
    RAISE EXCEPTION 'Account character limit reached' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER character_account_guard BEFORE INSERT OR UPDATE OF account_id,account_slot ON heroes
  FOR EACH ROW EXECUTE FUNCTION assign_character_slot();
CREATE TABLE account_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_session_expiry ON account_sessions(expires_at);
`;

export async function migrate(client:PoolClient):Promise<void>{
  await client.query('BEGIN');
  try{
    await client.query('SELECT pg_advisory_xact_lock(8675309, 4733)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const applied=await client.query<{version:number}>('SELECT version FROM schema_migrations');
    if([1,2,3,4,5,6,7].some(version=>!applied.rows.some(row=>row.version===version))){
      // Data migrations must never copy counters while an older process can
      // still buy or consume them. Read-only opens of a current schema stay free.
      const world=await client.query<{locked:boolean}>('SELECT pg_try_advisory_xact_lock(8675309, 4732) AS locked');
      if(!world.rows[0]?.locked)throw new Error('Stop the world writer before migrating hero storage');
    }
    const existing=await client.query<{version:number}>('SELECT version FROM schema_migrations WHERE version=1');
    if(!existing.rowCount){await client.query(initialSchema);await client.query('INSERT INTO schema_migrations(version) VALUES (1)');}
    const second=await client.query<{version:number}>('SELECT version FROM schema_migrations WHERE version=2');
    if(!second.rowCount){await client.query(personalStashSchema);await client.query('INSERT INTO schema_migrations(version) VALUES (2)');}
    const third=await client.query<{version:number}>('SELECT version FROM schema_migrations WHERE version=3');
    if(!third.rowCount){await client.query(afkPreferencesSchema);await client.query('INSERT INTO schema_migrations(version) VALUES (3)');}
    const fourth=await client.query<{version:number}>('SELECT version FROM schema_migrations WHERE version=4');
    if(!fourth.rowCount){await client.query(consumableInventorySchema);await client.query('INSERT INTO schema_migrations(version) VALUES (4)');}
    const fifth=await client.query<{version:number}>('SELECT version FROM schema_migrations WHERE version=5');
    if(!fifth.rowCount){await client.query(accountsSchema);await client.query('INSERT INTO schema_migrations(version) VALUES (5)');}
    const sixth=await client.query<{version:number}>('SELECT version FROM schema_migrations WHERE version=6');
    if(!sixth.rowCount){await client.query(`
      ALTER TABLE heroes ADD COLUMN skill_build jsonb CHECK (skill_build IS NULL OR (jsonb_typeof(skill_build)='object' AND jsonb_typeof(skill_build->'slots')='array' AND jsonb_array_length(skill_build->'slots')=4 AND jsonb_typeof(skill_build->'talents')='object'));
      ALTER TABLE heroes ADD COLUMN build_revision bigint NOT NULL DEFAULT 0 CHECK(build_revision>=0);
      ALTER TABLE heroes ADD COLUMN skill_presets jsonb NOT NULL DEFAULT '[null,null,null]'::jsonb CHECK(jsonb_typeof(skill_presets)='array' AND jsonb_array_length(skill_presets)=3);
    `);await client.query('INSERT INTO schema_migrations(version) VALUES (6)');}
    const seventh=await client.query<{version:number}>('SELECT version FROM schema_migrations WHERE version=7');
    if(!seventh.rowCount){await client.query(`
      ALTER TABLE heroes DROP CONSTRAINT hp_potion_limit;
      ALTER TABLE heroes ADD CONSTRAINT hp_potion_limit CHECK (potions BETWEEN 0 AND 3996);
      ALTER TABLE heroes DROP CONSTRAINT heroes_mana_potions_check;
      ALTER TABLE heroes ADD CONSTRAINT heroes_mana_potions_check CHECK (mana_potions BETWEEN 0 AND 3996);
      ALTER TABLE consumable_stacks DROP CONSTRAINT consumable_stacks_quantity_check;
      ALTER TABLE consumable_stacks ADD CONSTRAINT consumable_stacks_quantity_check CHECK (quantity BETWEEN 1 AND 999);
    `);await client.query('INSERT INTO schema_migrations(version) VALUES (7)');}
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
