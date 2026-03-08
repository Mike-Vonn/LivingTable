# LivingTable — Phase 2 Implementation Plan
## World Foundation: Detailed Task Spec for Claude Code

---

## Overview

Phase 2 transforms LivingTable from a battle map into a living world. It introduces a PostgreSQL database, a canonical world clock, individually-tracked NPCs with schedules, a location hierarchy, real-world-derived weather, character sheets, and a snapshot/retcon system.

Phase 1 is complete and deployed. The existing codebase is at `git@github.com:Mike-Vonn/LivingTable.git`.

**What Phase 2 delivers:**
- PostgreSQL database replacing JSON file persistence
- Auth migration from JSON files to PostgreSQL
- World clock with Harptos calendar and DM advance controls
- Location hierarchy (region → settlement → district → building → room)
- NPC census with three simulation tiers (full, standard, light)
- NPC schedule system (NPCs move to correct locations based on world time)
- NPC tokens on the battle map reflect schedule/clock state
- Weather data ingested from Open-Meteo historical API
- Weather display in UI with effects on NPC schedules
- Snapshot/retcon system for world state rollback
- D&D Beyond character import tool
- Native character sheet storage and display
- Seed data for Phandalin and surroundings (Dragon of Icespire Peak)

**What Phase 2 does NOT include:**
- No economy/shops/trade (Phase 3)
- No automated adjudication or rules engine (Phase 4)
- No LLM integration (Phase 5)
- No consequence engine (Phase 6)
- No NPC dialogue — NPCs are positioned on the map, but interactions are still DM-mediated

**Existing codebase to build on (from Phase 1):**
- Monorepo: `packages/shared`, `packages/server`, `packages/client`
- Auth: bcrypt + JWT, CampaignStore in `server/src/state/campaign-store.ts` (JSON persistence)
- Session state: `SessionStateManager` in `server/src/state/session-state.ts` (in-memory, JSON save/load)
- Socket.io: campaign rooms, event handlers for tokens/fog/initiative/dice
- Client: React 18, Pixi.js 8, Zustand 4, Vite 6, Socket.io-client
- Types: `@livingtable/shared` with Token, MapState, SessionState, etc.

---

## Tech Additions for Phase 2

```
Database:       PostgreSQL 16
ORM:            Prisma 6.x (schema-first, type-safe client, migrations)
Weather API:    Open-Meteo Historical Weather API (free, no key)
HTTP Client:    undici (Node.js built-in) or node-fetch for weather ingestion
New deps:       @prisma/client, prisma (dev), node-cron (for auto-save scheduling)
```

---

## Task Breakdown

### Task 0: PostgreSQL + Prisma Setup

**What to do:**

1. Add Prisma to the server package:
   ```bash
   cd packages/server
   npm install @prisma/client
   npm install -D prisma
   npx prisma init
   ```

2. Configure `packages/server/prisma/schema.prisma` with the PostgreSQL datasource:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }

   generator client {
     provider = "prisma-client-js"
   }
   ```

3. Add `DATABASE_URL` to `packages/server/src/config.ts`:
   ```typescript
   export const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://livingtable:livingtable@localhost:5432/livingtable';
   ```

4. Create `docker-compose.yml` at the repo root for local development:
   ```yaml
   version: '3.8'
   services:
     postgres:
       image: postgres:16-alpine
       environment:
         POSTGRES_USER: livingtable
         POSTGRES_PASSWORD: livingtable
         POSTGRES_DB: livingtable
       ports:
         - "5432:5432"
       volumes:
         - pgdata:/var/lib/postgresql/data
   volumes:
     pgdata:
   ```

5. Add scripts to `packages/server/package.json`:
   ```json
   "db:migrate": "prisma migrate dev",
   "db:push": "prisma db push",
   "db:studio": "prisma studio",
   "db:generate": "prisma generate",
   "db:seed": "tsx src/db/seed.ts"
   ```

6. Add a `.env` file to `packages/server/` (gitignored) with the DATABASE_URL.

**Acceptance criteria:**
- `docker compose up -d` starts PostgreSQL locally
- `npx prisma db push` creates the schema in the local database
- `npx prisma studio` opens the database browser
- Prisma client is importable in server code

---

### Task 1: Core Database Schema

**What to do:**

Define the full Prisma schema for all Phase 2 tables. Later phases will add more tables via migrations, but Phase 2 needs the foundation.

**`packages/server/prisma/schema.prisma` — add these models:**

```prisma
// ============================================
// Authentication (migrated from JSON files)
// ============================================

model User {
  id           String   @id @default(uuid())
  username     String   @unique
  passwordHash String   @map("password_hash")
  displayName  String   @map("display_name")
  createdAt    DateTime @default(now()) @map("created_at")

  dmCampaigns      Campaign[]         @relation("CampaignDM")
  campaignMembers  CampaignMember[]
  playerCharacters PlayerCharacter[]

  @@map("users")
}

model Campaign {
  id         String   @id @default(uuid())
  name       String
  dmUserId   String   @map("dm_user_id")
  inviteCode String   @unique @map("invite_code")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  dm      User             @relation("CampaignDM", fields: [dmUserId], references: [id])
  members CampaignMember[]
  worlds  World[]

  @@map("campaigns")
}

model CampaignMember {
  id         String @id @default(uuid())
  campaignId String @map("campaign_id")
  userId     String @map("user_id")
  role       String @default("player") // 'dm' or 'player'

  campaign Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([campaignId, userId])
  @@map("campaign_members")
}

// ============================================
// World & Time
// ============================================

model World {
  id         String @id @default(uuid())
  campaignId String @map("campaign_id")
  name       String

  // Clock state
  currentTick   BigInt @default(0) @map("current_tick")
  ticksPerMinute Int   @default(1) @map("ticks_per_minute")

  // Calendar: Harptos by default
  calendarSystem String @default("harptos") @map("calendar_system")
  startYear      Int    @default(1491) @map("start_year")   // DR 1491 for Icespire Peak
  startMonth     Int    @default(1) @map("start_month")
  startDay       Int    @default(1) @map("start_day")

  // Simulation tuning (JSONB)
  simulationConfig Json @default("{}") @map("simulation_config")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  campaign  Campaign  @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  locations Location[]
  npcs      Npc[]
  snapshots WorldSnapshot[]
  weatherData WeatherData[]
  playerCharacters PlayerCharacter[]

  @@map("worlds")
}

model WorldSnapshot {
  id        String   @id @default(uuid())
  worldId   String   @map("world_id")
  name      String
  reason    String   // "session_start", "before_time_advance", "manual", "auto"
  tick      BigInt   // world tick at time of snapshot
  stateJson Json     @map("state_json") // full serialized world state
  createdAt DateTime @default(now()) @map("created_at")

  world World @relation(fields: [worldId], references: [id], onDelete: Cascade)

  @@index([worldId, tick])
  @@map("world_snapshots")
}

// ============================================
// Geography
// ============================================

model Location {
  id       String  @id @default(uuid())
  worldId  String  @map("world_id")
  parentId String? @map("parent_id")

  name        String
  locationType String @map("location_type")
  // 'region', 'settlement', 'district', 'building', 'room', 'wilderness', 'road'

  description String?

  // Position on the world/region map (for rendering)
  mapX Float? @map("map_x")
  mapY Float? @map("map_y")

  // For settlements
  population   Int?    @default(0)
  prosperityIndex Float? @default(0.5) @map("prosperity_index")

  // Weather region mapping
  weatherRegion String? @map("weather_region")

  // For buildings/rooms: associated battle map
  battleMapUrl   String? @map("battle_map_url")
  battleMapWidth Int?    @map("battle_map_width")
  battleMapHeight Int?   @map("battle_map_height")
  gridConfig     Json?   @map("grid_config")

  // Metadata
  tags      String[] @default([])
  extraData Json     @default("{}") @map("extra_data")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  world    World      @relation(fields: [worldId], references: [id], onDelete: Cascade)
  parent   Location?  @relation("LocationHierarchy", fields: [parentId], references: [id])
  children Location[] @relation("LocationHierarchy")
  npcsHere Npc[]      @relation("NPCCurrentLocation")
  npcsHome Npc[]      @relation("NPCHomeLocation")
  connectionsFrom LocationConnection[] @relation("ConnectionFrom")
  connectionsTo   LocationConnection[] @relation("ConnectionTo")

  @@index([worldId, locationType])
  @@index([worldId, parentId])
  @@map("locations")
}

model LocationConnection {
  id             String @id @default(uuid())
  fromLocationId String @map("from_location_id")
  toLocationId   String @map("to_location_id")

  connectionType String @map("connection_type") // 'road', 'trail', 'river', 'portal', 'stairs'
  travelTimeMinutes Int @map("travel_time_minutes") // base travel time on foot
  dangerLevel    Int    @default(0) @map("danger_level") // 0-10
  description    String?
  bidirectional  Boolean @default(true)

  fromLocation Location @relation("ConnectionFrom", fields: [fromLocationId], references: [id], onDelete: Cascade)
  toLocation   Location @relation("ConnectionTo", fields: [toLocationId], references: [id], onDelete: Cascade)

  @@map("location_connections")
}

// ============================================
// NPCs
// ============================================

model Npc {
  id      String @id @default(uuid())
  worldId String @map("world_id")

  // Identity
  name        String
  race        String
  gender      String
  occupation  String
  age         Int?
  description String?

  // Simulation tier: 1 (full), 2 (standard), 3 (light)
  simulationTier Int @default(3) @map("simulation_tier")

  // Personality (Tier 1-2)
  personalityTraits String? @map("personality_traits")
  ideals            String?
  bonds             String?
  flaws             String?
  backstory         String?

  // Stats (for rules engine, future phases)
  abilityScores Json? @map("ability_scores") // { str, dex, con, int, wis, cha }
  skills        Json? // { perception: 3, stealth: 2, ... }
  hitPointsMax  Int?  @map("hit_points_max")
  hitPointsCurrent Int? @map("hit_points_current")
  armorClass    Int?  @map("armor_class")
  challengeRating Float? @map("challenge_rating")

  // Location
  currentLocationId String @map("current_location_id")
  homeLocationId    String? @map("home_location_id")
  currentActivity   String? @map("current_activity")

  // Schedule
  schedule Json? // NPCSchedule as JSONB (see architecture doc)

  // State
  isAlive      Boolean @default(true) @map("is_alive")
  condition    String  @default("normal") // normal, injured, unconscious, captured, sick, fleeing
  morale       Int     @default(50)
  partyAttitude Int    @default(0) @map("party_attitude") // -100 to +100

  // Knowledge & Rumors (for later phases, store as JSONB)
  knowledge Json @default("[]")
  rumors    Json @default("[]")

  // Economy (for later phases)
  wealth    Json @default("{}") // { gp: 0, sp: 0, cp: 0, ep: 0, pp: 0 }

  // Faction membership (for later phases)
  factionIds String[] @default([]) @map("faction_ids")

  // Token appearance on battle map
  tokenColor   String  @default("#666666") @map("token_color")
  tokenImageUrl String? @map("token_image_url")
  tokenSize    Int     @default(1) @map("token_size") // grid cells

  // Metadata
  tags      String[] @default([])
  dmNotes   String?  @map("dm_notes")
  extraData Json     @default("{}") @map("extra_data")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  world           World    @relation(fields: [worldId], references: [id], onDelete: Cascade)
  currentLocation Location @relation("NPCCurrentLocation", fields: [currentLocationId], references: [id])
  homeLocation    Location? @relation("NPCHomeLocation", fields: [homeLocationId], references: [id])
  pcMemories      NpcPcMemory[]

  @@index([worldId, simulationTier])
  @@index([worldId, currentLocationId])
  @@index([worldId, isAlive])
  @@map("npcs")
}

model NpcPcMemory {
  id    String @id @default(uuid())
  npcId String @map("npc_id")
  pcId  String @map("pc_id") // PlayerCharacter ID

  attitude     Int    @default(0) // -100 to +100
  interactionCount Int @default(0) @map("interaction_count")
  lastInteractionTick BigInt? @map("last_interaction_tick")
  memories     Json   @default("[]") // array of { tick, description, attitudeChange }

  npc Npc @relation(fields: [npcId], references: [id], onDelete: Cascade)

  @@unique([npcId, pcId])
  @@map("npc_pc_memory")
}

// ============================================
// Player Characters
// ============================================

model PlayerCharacter {
  id      String @id @default(uuid())
  worldId String @map("world_id")
  userId  String @map("user_id")

  name    String
  race    String
  class_  String @map("class")
  level   Int    @default(1)

  // Full character sheet as JSONB (flexible for different rulesets)
  abilityScores     Json @map("ability_scores") // { str, dex, con, int, wis, cha }
  skills            Json @default("{}") // { athletics: { proficient: true, expertise: false }, ... }
  savingThrows      Json @default("{}") @map("saving_throws")
  hitPointsMax      Int  @map("hit_points_max")
  hitPointsCurrent  Int  @map("hit_points_current")
  hitDice           Json @default("{}") @map("hit_dice")
  armorClass        Int  @map("armor_class")
  speed             Int  @default(30)
  proficiencyBonus  Int  @default(2) @map("proficiency_bonus")
  initiative        Int  @default(0)

  // Background and personality
  background        String?
  personalityTraits String? @map("personality_traits")
  ideals            String?
  bonds             String?
  flaws             String?
  backstory         String?

  // Features, traits, spells
  classFeatures  Json @default("[]") @map("class_features")
  racialTraits   Json @default("[]") @map("racial_traits")
  feats          Json @default("[]")
  spellSlots     Json @default("{}") @map("spell_slots")
  preparedSpells Json @default("[]") @map("prepared_spells")
  knownSpells    Json @default("[]") @map("known_spells")

  // Inventory and wealth (JSONB arrays)
  inventory Json @default("[]")
  wealth    Json @default("{}") // { gp, sp, cp, ep, pp }

  // Conditions
  conditions   String[] @default([])
  deathSaves   Json     @default("{}") @map("death_saves") // { successes: 0, failures: 0 }
  exhaustionLevel Int   @default(0) @map("exhaustion_level")

  // Token appearance
  tokenColor    String  @default("#3366cc") @map("token_color")
  tokenImageUrl String? @map("token_image_url")

  // Source
  importSource String? @map("import_source") // "ddb" for D&D Beyond, "manual", etc.
  importData   Json?   @map("import_data")   // raw import data for reference

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  world World @relation(fields: [worldId], references: [id], onDelete: Cascade)
  user  User  @relation(fields: [userId], references: [id])

  @@index([worldId])
  @@index([userId])
  @@map("player_characters")
}

// ============================================
// Weather
// ============================================

model WeatherData {
  id            String @id @default(uuid())
  worldId       String @map("world_id")
  weatherRegion String @map("weather_region") // "sword_coast_central"
  dayOfYear     Int    @map("day_of_year")     // 1-365
  yearSource    Int    @map("year_source")     // which real-world year

  temperatureHighC Float @map("temperature_high_c")
  temperatureLowC  Float @map("temperature_low_c")
  precipitationMm  Float @map("precipitation_mm")
  precipitationType String @map("precipitation_type") // "none","rain","snow","sleet","hail"
  windSpeedKph     Float @map("wind_speed_kph")
  windDirection    String @map("wind_direction")
  cloudCoverPct    Float @map("cloud_cover_pct")
  humidityPct      Float @map("humidity_pct")

  // Derived game-relevant fields
  travelCondition    String @map("travel_condition") // "clear","poor","dangerous","impassable"
  outdoorWorkModifier Float @map("outdoor_work_modifier") // 0.0-1.0
  combatModifier     String @map("combat_modifier") // "none","visibility_reduced","difficult_terrain"
  description        String // "A cold, overcast day with occasional drizzle"

  world World @relation(fields: [worldId], references: [id], onDelete: Cascade)

  @@unique([worldId, weatherRegion, dayOfYear, yearSource])
  @@index([worldId, weatherRegion, dayOfYear])
  @@map("weather_data")
}
```

**Run the migration:**
```bash
cd packages/server
npx prisma migrate dev --name init
```

**Acceptance criteria:**
- Migration runs successfully, all tables are created in PostgreSQL
- `npx prisma studio` shows all tables
- Prisma client types are generated and importable

---

### Task 2: Auth Migration (JSON → PostgreSQL)

**What to do:**

Replace the JSON-file-based `CampaignStore` with Prisma database queries. The existing API routes and socket handlers should continue to work identically — only the storage layer changes.

1. Create `packages/server/src/db/client.ts`:
   ```typescript
   import { PrismaClient } from '@prisma/client';
   export const prisma = new PrismaClient();
   ```

2. Rewrite `packages/server/src/state/campaign-store.ts` to use Prisma:
   - Replace all `readFileSync`/`writeFileSync` calls with Prisma queries
   - The `CampaignStore` class interface stays the same — same method signatures, same return types
   - `createUser` → `prisma.user.create()`
   - `authenticateUser` → `prisma.user.findUnique()` + bcrypt compare
   - `createCampaign` → `prisma.campaign.create()` + `prisma.campaignMember.create()` (DM as member with role 'dm')
   - `joinCampaign` → `prisma.campaignMember.create()` with role 'player'
   - `getUserCampaigns` → `prisma.campaignMember.findMany()` with campaign include
   - `getUserRole` → `prisma.campaignMember.findUnique()` with compound key
   - All methods become `async` (most already were for bcrypt)
   - Remove all JSON persistence code (users.json, campaigns.json)

3. Update route handlers in `app.ts` to await the now-async methods that weren't async before.

4. Create a one-time migration script `packages/server/src/db/migrate-json-to-db.ts`:
   - Reads existing `data/auth/users.json` and `data/auth/campaigns.json`
   - Inserts them into PostgreSQL
   - This allows existing Phase 1 data to be migrated
   - Run with: `npx tsx src/db/migrate-json-to-db.ts`

**Important:** The CampaignMember model now tracks membership. Previously, `Campaign.playerUserIds` was an array. Now, membership is a separate table. The DM is also a CampaignMember with `role: 'dm'`. Update all queries accordingly.

**Acceptance criteria:**
- All existing auth API routes work identically (register, login, campaign CRUD, invite codes)
- Socket.io auth middleware works with the new store
- No more JSON files in `data/auth/` after migration
- Existing users can be migrated from JSON to PostgreSQL
- `npx prisma studio` shows users, campaigns, and memberships

---

### Task 3: World & Location Management

**What to do:**

Implement the World entity and the Location hierarchy. A Campaign has one World (for now). The World contains the clock state and all locations.

**Server:**

1. Create `packages/server/src/simulation/world-manager.ts`:
   - Class `WorldManager` wraps Prisma queries for world and location operations
   - `createWorld(campaignId, name, options)` — creates a world with default Harptos calendar settings
   - `getWorld(worldId)` — returns world with current clock state
   - `getWorldByCampaign(campaignId)` — returns the world for a campaign (creates one if none exists)
   - `getLocations(worldId, parentId?)` — returns location tree or children of a parent
   - `getLocation(locationId)` — returns single location with children and connections
   - `createLocation(worldId, data)` — create a new location
   - `updateLocation(locationId, data)` — update location properties
   - `deleteLocation(locationId)` — delete with cascade
   - `createConnection(fromId, toId, data)` — connect two locations
   - `getLocationNpcs(locationId)` — NPCs currently at this location

2. Add new socket events to `packages/shared/src/types/socket-events.ts`:
   ```typescript
   // World
   WORLD_STATE: 'world:state',          // server → client: world state with clock
   WORLD_CLOCK_ADVANCE: 'world:clock:advance', // DM → server: { minutes }
   WORLD_CLOCK_STATE: 'world:clock:state',     // server → all: updated clock state

   // Locations
   LOCATION_LIST: 'location:list',        // server → client: location tree
   LOCATION_ENTER: 'location:enter',      // DM → server: { locationId } — party enters location
   LOCATION_NPCS: 'location:npcs',        // server → client: NPCs at current location
   ```

3. Add new shared types in `packages/shared/src/types/world.ts`:
   ```typescript
   export interface WorldState {
     id: string;
     campaignId: string;
     name: string;
     currentTick: number;
     calendarSystem: string;
     startYear: number;
     startMonth: number;
     startDay: number;
     simulationConfig: SimulationConfig;
   }

   export interface CalendarDate {
     year: number;
     month: number;        // 1-12 (Harptos months)
     day: number;           // 1-30
     monthName: string;     // "Hammer", "Alturiak", etc.
     dayOfYear: number;     // 1-365
     hour: number;          // 0-23
     minute: number;        // 0-59
     timeOfDay: string;     // "dawn", "morning", "midday", "afternoon", "dusk", "evening", "night", "midnight"
     season: string;        // "winter", "spring", "summer", "autumn"
   }

   export interface LocationNode {
     id: string;
     name: string;
     locationType: string;
     description?: string;
     parentId?: string;
     population?: number;
     prosperityIndex?: number;
     weatherRegion?: string;
     children?: LocationNode[];
     connections?: LocationConnectionInfo[];
     npcCount?: number;
   }

   export interface LocationConnectionInfo {
     id: string;
     toLocationId: string;
     toLocationName: string;
     connectionType: string;
     travelTimeMinutes: number;
     dangerLevel: number;
   }
   ```

4. Create `packages/shared/src/calendar/harptos.ts`:
   ```typescript
   // Harptos calendar implementation
   // 12 months × 30 days + 5 festival days = 365 days
   // Months: Hammer, Alturiak, Ches, Tarsakh, Mirtul, Kythorn,
   //         Flamerule, Eleasis, Eleint, Marpenoth, Uktar, Nightal
   // Festival days: Midwinter (after Hammer), Greengrass (after Tarsakh),
   //               Midsummer (after Flamerule), Highharvestide (after Eleint),
   //               Feast of the Moon (after Uktar)
   // Tenday: 10-day "week" (3 per month)

   export function tickToCalendarDate(tick: number, startYear: number, startMonth: number, startDay: number): CalendarDate;
   export function calendarDateToTick(date: CalendarDate, startYear: number, startMonth: number, startDay: number): number;
   export function formatCalendarDate(date: CalendarDate): string;
   export function getTimeOfDay(hour: number): string;
   export function getSeason(monthIndex: number): string;
   ```

   Implement the full Harptos calendar. One tick = one in-game minute. So 1440 ticks = 1 day. 525600 ticks = 1 year.

**Client:**

5. Create `packages/client/src/components/dm/WorldClock.tsx`:
   - Displays current world date and time: "15 Mirtul, DR 1491 — 14:30 (Afternoon)"
   - DM controls:
     - "Advance" buttons: +10 min, +1 hour, +8 hours (long rest), +1 day, custom
     - "Short Rest" button: advances 1 hour
     - "Long Rest" button: advances 8 hours
   - Time-of-day indicator (sun/moon icon or text)
   - Season indicator
   - All players see the clock (read-only); only DM can advance

6. Create `packages/client/src/components/dm/LocationBrowser.tsx`:
   - DM panel showing the location hierarchy as a tree
   - Click to select a location → shows its details (name, description, NPCs present)
   - "Enter Location" button → tells the server the party has moved here
   - DM can create new locations (inline form: name, type, parent, description)
   - DM can create connections between locations (from, to, travel time, danger level)

**Acceptance criteria:**
- World is created automatically when a campaign's first socket connection joins
- World clock displays correctly in the Harptos calendar
- DM can advance time and all clients see the update
- Location hierarchy can be browsed in the DM panel
- DM can create locations and connections
- "Enter Location" updates the party's current location

---

### Task 4: NPC Data Model & Census Management

**What to do:**

Implement the NPC database layer and a DM-facing census management panel. This task focuses on CRUD — scheduling and map integration come in Tasks 5 and 6.

**Server:**

1. Create `packages/server/src/simulation/npc-manager.ts`:
   - `createNpc(worldId, data)` — create an NPC at a location
   - `getNpc(npcId)` — full NPC with location, memories
   - `updateNpc(npcId, data)` — partial update
   - `deleteNpc(npcId)` — soft delete (set isAlive = false) or hard delete
   - `getNpcsAtLocation(worldId, locationId)` — all NPCs whose currentLocationId matches
   - `getNpcsByTier(worldId, tier)` — filter by simulation tier
   - `searchNpcs(worldId, query)` — search by name, occupation, tags
   - `promoteTier(npcId, newTier)` — change simulation tier (DM action)
   - `getNpcCensus(worldId)` — summary stats: count by tier, by location, by occupation
   - `batchCreateNpcs(worldId, npcs)` — bulk insert for seeding

2. Add new socket events:
   ```typescript
   NPC_LIST: 'npc:list',            // server → client: NPCs at current location
   NPC_DETAIL: 'npc:detail',        // server → client: full NPC data
   NPC_CREATE: 'npc:create',        // DM → server: create NPC
   NPC_UPDATE: 'npc:update',        // DM → server: update NPC
   NPC_DELETE: 'npc:delete',        // DM → server: delete NPC
   NPC_PROMOTE: 'npc:promote',      // DM → server: change tier
   ```

3. Add shared NPC types in `packages/shared/src/types/npc.ts`:
   ```typescript
   export interface NpcSummary {
     id: string;
     name: string;
     race: string;
     occupation: string;
     simulationTier: number;
     currentLocationId: string;
     currentLocationName: string;
     isAlive: boolean;
     condition: string;
     partyAttitude: number;
     tokenColor: string;
     tokenImageUrl?: string;
     tokenSize: number;
   }

   export interface NpcDetail extends NpcSummary {
     gender: string;
     age?: number;
     description?: string;
     personalityTraits?: string;
     ideals?: string;
     bonds?: string;
     flaws?: string;
     backstory?: string;
     abilityScores?: Record<string, number>;
     skills?: Record<string, number>;
     hitPointsMax?: number;
     hitPointsCurrent?: number;
     armorClass?: number;
     schedule?: NPCSchedule;
     currentActivity?: string;
     morale: number;
     knowledge: string[];
     wealth: Record<string, number>;
     tags: string[];
     dmNotes?: string;
   }

   export interface NPCSchedule {
     default_day: ScheduleBlock[];
     day_overrides?: Record<string, ScheduleBlock[]>;
     temporary_override?: {
       schedule: ScheduleBlock[];
       reason: string;
       expires_tick?: number;
     };
     weather_modifications?: {
       condition: string;
       replacement_block: ScheduleBlock;
     }[];
   }

   export interface ScheduleBlock {
     start_hour: number;
     end_hour: number;
     location_id: string;
     location_name?: string;     // for display convenience
     activity: string;
     interruptible: boolean;
   }

   export interface NpcCensus {
     total: number;
     byTier: { tier: number; count: number }[];
     byLocation: { locationId: string; locationName: string; count: number }[];
     byOccupation: { occupation: string; count: number }[];
     alive: number;
     dead: number;
   }
   ```

**Client:**

4. Create `packages/client/src/components/dm/NpcCensus.tsx`:
   - DM panel showing NPC census overview: total count, breakdown by tier/location/occupation
   - Searchable/filterable NPC list
   - Click an NPC to open detail view
   - "Create NPC" button → inline form with fields: name, race, gender, occupation, tier, location, personality, schedule
   - Quick-create for Tier 3 (light) NPCs: just name, race, occupation, location (rest auto-generated)
   - Tier badge on each NPC (color coded: gold/silver/bronze for 1/2/3)
   - Promote/demote tier buttons
   - Filter by location, tier, alive/dead

5. Create `packages/client/src/components/dm/NpcDetail.tsx`:
   - Full NPC detail panel (slide-out or modal)
   - All editable fields: identity, personality, stats, schedule, notes
   - Schedule visualizer: simple timeline showing where the NPC is each hour of the day
   - Attitude toward party indicator
   - PC interaction memories list (read-only for now)

**Acceptance criteria:**
- DM can create NPCs assigned to locations
- NPC census shows correct counts by tier, location, occupation
- DM can search and filter NPCs
- DM can edit NPC details
- DM can promote/demote NPC tiers
- NPCs at the party's current location are listed
- NPC data persists in PostgreSQL

---

### Task 5: NPC Schedule System

**What to do:**

Implement the schedule engine that determines where each NPC should be based on the current world time.

**Server:**

1. Create `packages/server/src/simulation/schedule-engine.ts`:
   ```typescript
   /**
    * Given an NPC's schedule and the current world state,
    * determine where the NPC should be and what they're doing.
    */
   export function resolveNpcLocation(
     schedule: NPCSchedule,
     currentHour: number,
     dayType: string,        // "normal", "market_day", "holy_day", etc.
     weather: WeatherState | null,
   ): { locationId: string; activity: string } | null;

   /**
    * Process all NPCs for a given world during a time advance.
    * Updates currentLocationId and currentActivity for each NPC
    * based on their schedule and the target time.
    */
   export async function advanceNpcSchedules(
     worldId: string,
     targetTick: number,
     calendarDate: CalendarDate,
     weather: WeatherState | null,
   ): Promise<NpcMovement[]>;

   interface NpcMovement {
     npcId: string;
     fromLocationId: string;
     toLocationId: string;
     activity: string;
   }
   ```

2. Schedule resolution logic:
   - Check for `temporary_override` first (if active and not expired, use it)
   - Check for `day_overrides` matching the current day type
   - Fall back to `default_day`
   - If weather is bad and `weather_modifications` has a matching condition, use the replacement block
   - Find the schedule block whose `start_hour <= currentHour < end_hour`
   - Return the block's `location_id` and `activity`

3. Integrate into the clock advance flow. When the DM advances time:
   - Calculate the new calendar date from the new tick
   - Look up the current weather (Task 7)
   - Run `advanceNpcSchedules()` to update all NPC positions
   - Broadcast updated NPC positions to all clients in the campaign room

4. Create `packages/server/src/simulation/time-advance.ts`:
   - Orchestrator function that runs all subsystems on clock advance
   - For Phase 2, the only subsystems are:
     - NPC schedule updates
     - Weather lookup
   - Future phases add: enterprises, economy, comm links, events, consequences, factions, encounters
   - Structure it as a pipeline so new subsystems can be added cleanly:
     ```typescript
     export async function advanceWorldTime(worldId: string, minutesToAdvance: number): Promise<TimeAdvanceResult> {
       // 1. Calculate new tick
       // 2. Update weather
       // 3. Advance NPC schedules
       // 4. (Future: enterprises, economy, comm links, events, consequences, factions, encounters)
       // 5. Save new tick to database
       // 6. Return summary of what changed
     }
     ```

**Acceptance criteria:**
- NPCs with schedules move to correct locations when time advances
- A blacksmith NPC is at the forge during work hours and at the tavern in the evening
- Weather modifications apply (farmer stays inside during storms)
- Temporary schedule overrides work and expire correctly
- The `advanceWorldTime` function is extensible for future phases
- NPC position changes are broadcast to all clients after time advance

---

### Task 6: NPC Tokens on Battle Map

**What to do:**

Bridge the NPC simulation with the existing battle map. When the party enters a location that has a battle map, NPCs at that location should appear as tokens.

**Server:**

1. When the DM triggers `LOCATION_ENTER` for a location that has a `battleMapUrl`:
   - Query all NPCs whose `currentLocationId` matches
   - Filter by visibility rules:
     - All NPCs visible to DM
     - Only NPCs with `visible: true` (or where the party knows them) visible to players
     - For Phase 2, default all NPCs to visible (knowledge filtering comes in Phase 7)
   - Generate Token objects from NPC data:
     ```typescript
     function npcToToken(npc: Npc): Token {
       return {
         id: `npc-${npc.id}`,    // prefix to distinguish from manually-placed tokens
         name: npc.name,
         type: 'npc',
         x: npc.mapX ?? 0,       // NPC's position on THIS map (stored per-location)
         y: npc.mapY ?? 0,
         width: npc.tokenSize,
         height: npc.tokenSize,
         imageUrl: npc.tokenImageUrl ?? null,
         color: npc.tokenColor,
         label: npc.name.split(' ')[0],  // first name as label
         visible: true,
         conditions: npc.condition !== 'normal' ? [npc.condition] : [],
         hp: npc.hitPointsMax ? { current: npc.hitPointsCurrent!, max: npc.hitPointsMax } : undefined,
         notes: npc.occupation,
         controlledBy: 'dm',
       };
     }
     ```
   - Send these NPC-derived tokens along with any manually-placed tokens in the session state
   - NPC tokens are read-only for players (they can't drag an NPC)
   - DM can drag NPC tokens on the battle map; this updates the NPC's position on that specific map

2. When time advances and NPCs move:
   - If an NPC was at the current battle map location and their schedule moves them elsewhere, their token disappears
   - If an NPC arrives at the current battle map location, their token appears
   - Broadcast token additions/removals to all clients

3. Add an `npc_map_positions` table or a JSONB field on the NPC model to store per-location map positions. This way, if the party revisits a location, the NPC is in the same spot on the map:
   ```prisma
   model NpcMapPosition {
     id         String @id @default(uuid())
     npcId      String @map("npc_id")
     locationId String @map("location_id")
     mapX       Float  @map("map_x")
     mapY       Float  @map("map_y")

     @@unique([npcId, locationId])
     @@map("npc_map_positions")
   }
   ```

**Client:**

4. Update `TokenLayer.ts` to distinguish NPC tokens (prefixed with `npc-`) from manual tokens:
   - NPC tokens have a subtle indicator (small dot or border) showing they're simulation-driven
   - DM can drag NPC tokens; on drop, emit a new event `NPC_MAP_MOVE` that saves the position per-location
   - Players cannot drag NPC tokens

5. When the party enters a location, the map canvas loads the location's battle map and shows both manual tokens and NPC tokens.

**Acceptance criteria:**
- Entering a location with a battle map shows NPCs present at that location as tokens
- NPCs appear/disappear as time advances and their schedules move them
- DM can reposition NPC tokens on the battle map
- NPC token positions are saved per-location (returning to a location restores positions)
- NPC tokens are visually distinguishable from manually-placed tokens
- Players cannot drag NPC tokens

---

### Task 7: Weather System

**What to do:**

Ingest real-world historical weather data from Open-Meteo and display it in the UI.

**Server:**

1. Create `packages/server/src/tools/weather-ingest.ts`:
   - Standalone script run with `npx tsx src/tools/weather-ingest.ts`
   - Downloads historical weather data from the Open-Meteo API for each weather region
   - API endpoint: `https://archive-api.open-meteo.com/v1/archive`
   - Parameters:
     ```
     latitude, longitude
     start_date, end_date (YYYY-MM-DD format)
     daily: temperature_2m_max, temperature_2m_min, precipitation_sum,
            rain_sum, snowfall_sum, wind_speed_10m_max, wind_direction_10m_dominant,
            shortwave_radiation_sum
     ```
   - Weather region mappings (from architecture doc):
     ```typescript
     const WEATHER_REGIONS = {
       sword_coast_north: { lat: 69.65, lon: 18.96, name: "Tromsø, Norway" },
       sword_coast_central: { lat: 57.48, lon: -4.22, name: "Inverness, Scotland" },
       sword_coast_south: { lat: 44.84, lon: -0.58, name: "Bordeaux, France" },
       calimshan: { lat: 31.63, lon: -8.01, name: "Marrakech, Morocco" },
       spine_of_the_world: { lat: 45.92, lon: 6.87, name: "Chamonix, France" },
     };
     ```
   - For each day of data, derive game-relevant fields:
     - `travelCondition`: based on precipitation + wind speed
     - `outdoorWorkModifier`: based on temperature extremes + precipitation
     - `combatModifier`: based on visibility (precipitation + cloud cover)
     - `description`: generate a short natural-language description
   - Insert into the `weather_data` table
   - Download 3 years of data (e.g., 2021-2023) for each region
   - The script takes a `worldId` parameter to associate data with a specific world

2. Create `packages/server/src/simulation/weather.ts`:
   ```typescript
   export interface WeatherState {
     region: string;
     temperatureHighC: number;
     temperatureLowC: number;
     precipitationMm: number;
     precipitationType: string;
     windSpeedKph: number;
     cloudCoverPct: number;
     travelCondition: string;
     outdoorWorkModifier: number;
     combatModifier: string;
     description: string;
   }

   /**
    * Look up weather for a given world, region, and calendar date.
    * The world's startYear determines which real-world year data to use.
    */
   export async function getWeather(
     worldId: string,
     weatherRegion: string,
     dayOfYear: number,
   ): Promise<WeatherState | null>;

   /**
    * Get weather for all regions at a given calendar date.
    */
   export async function getAllRegionWeather(
     worldId: string,
     dayOfYear: number,
   ): Promise<Map<string, WeatherState>>;
   ```

3. Integrate into `time-advance.ts`:
   - After calculating the new calendar date, look up weather for the party's current region
   - Pass weather to the schedule engine so weather modifications can apply
   - Include weather in the time advance result so the client can display it

4. Add socket events:
   ```typescript
   WEATHER_STATE: 'weather:state',   // server → all: current weather
   ```

**Client:**

5. Create `packages/client/src/components/common/WeatherDisplay.tsx`:
   - Shows current weather for the party's location
   - Temperature, precipitation, wind, description
   - Small weather icon (sun, cloud, rain, snow, etc.)
   - Travel condition indicator (color-coded: green/yellow/orange/red)
   - Visible to all players

6. Integrate weather display into the toolbar or sidebar header, next to the world clock.

**Acceptance criteria:**
- Weather ingestion script downloads data from Open-Meteo and stores it in PostgreSQL
- Weather data covers 3 years × 5 regions = ~5,475 records
- Current weather is displayed based on the world clock date and party's location
- Weather updates when time advances
- Weather affects NPC schedule modifications (tested: farmer stays inside during storms)
- Weather description provides narrative flavor text

---

### Task 8: Snapshot & Retcon System

**What to do:**

Implement the ability to save and restore world state snapshots.

**Server:**

1. Create `packages/server/src/simulation/snapshot-manager.ts`:
   ```typescript
   /**
    * Capture the complete world state as a snapshot.
    * Includes: world clock, all NPC states, all location states, weather state, session state.
    */
   export async function createSnapshot(
     worldId: string,
     name: string,
     reason: 'session_start' | 'before_time_advance' | 'manual' | 'auto',
   ): Promise<WorldSnapshot>;

   /**
    * Restore a snapshot. Rolls back world state to the snapshot's point in time.
    * Returns a diff of what changed.
    */
   export async function restoreSnapshot(
     snapshotId: string,
   ): Promise<{ diff: SnapshotDiff; restoredTick: number }>;

   /**
    * List available snapshots for a world.
    */
   export async function listSnapshots(
     worldId: string,
   ): Promise<SnapshotSummary[]>;

   /**
    * Delete a snapshot.
    */
   export async function deleteSnapshot(snapshotId: string): Promise<void>;
   ```

2. Snapshot contents (`stateJson` field):
   ```typescript
   interface SnapshotData {
     worldState: {
       currentTick: number;
       simulationConfig: any;
     };
     npcs: Array<{
       id: string;
       currentLocationId: string;
       currentActivity: string;
       isAlive: boolean;
       condition: string;
       morale: number;
       partyAttitude: number;
       hitPointsCurrent: number | null;
       wealth: any;
       // ... other mutable NPC state fields
     }>;
     // Future phases add: shop inventories, active effects, faction states, enterprise states, etc.
   }
   ```

   Only capture **mutable state** — not static data like NPC names, descriptions, or schedules (those don't change on time advance). This keeps snapshots small.

3. Auto-snapshot triggers (integrated into `time-advance.ts`):
   - Before any time advance > 480 ticks (8 hours), create an auto-snapshot
   - At session start (when first client connects to a campaign room, if no snapshot exists for today)

4. Add socket events:
   ```typescript
   SNAPSHOT_CREATE: 'snapshot:create',     // DM → server: { name }
   SNAPSHOT_LIST: 'snapshot:list',         // server → DM: snapshot list
   SNAPSHOT_RESTORE: 'snapshot:restore',   // DM → server: { snapshotId }
   SNAPSHOT_DELETE: 'snapshot:delete',     // DM → server: { snapshotId }
   ```

**Client:**

5. Create `packages/client/src/components/dm/SnapshotManager.tsx`:
   - DM panel showing list of snapshots with name, date/tick, reason, and creation time
   - "Create Snapshot" button with name input
   - "Restore" button on each snapshot → confirmation dialog ("This will roll back the world to [date/time]. Continue?")
   - "Delete" button on each snapshot
   - Auto-snapshots shown with a different badge

**Acceptance criteria:**
- DM can create named snapshots
- Auto-snapshots are created before large time advances
- Restoring a snapshot rolls back: NPC positions, conditions, HP, attitudes, morale, world tick
- Snapshot list shows available restore points with dates
- DM can delete old snapshots
- Restoring a snapshot broadcasts the updated world state to all clients

---

### Task 9: Character Sheet Import & Display

**What to do:**

Implement native character sheet storage and a D&D Beyond JSON import tool.

**Server:**

1. Create `packages/server/src/services/character-service.ts`:
   - `createCharacter(worldId, userId, data)` — create a character manually
   - `getCharacter(characterId)` — full character data
   - `getCharactersByWorld(worldId)` — all characters in a world
   - `getCharactersByUser(userId, worldId)` — user's characters in a world
   - `updateCharacter(characterId, data)` — update character fields
   - `deleteCharacter(characterId)` — delete

2. Create `packages/server/src/tools/ddb-import.ts`:
   - Parse a D&D Beyond character JSON export
   - D&D Beyond character export format (from the API or JSON export):
     - Map `stats` → `abilityScores` (STR, DEX, CON, INT, WIS, CHA with base + modifiers)
     - Map `classes` → `class_` and `level`
     - Map `race` → `race`
     - Map `hitPoints` → `hitPointsMax`, `hitPointsCurrent`
     - Map `armorClass` → `armorClass`
     - Map `inventory` → `inventory` (items with quantities)
     - Map `currencies` → `wealth`
     - Map `spells` → `knownSpells`, `preparedSpells`
     - Map `traits` → `personalityTraits`, `ideals`, `bonds`, `flaws`
     - Map `background` → `background`
     - Store the raw import JSON in `importData` for reference
     - Set `importSource` to `"ddb"`
   - Expose as API route: `POST /api/characters/import/ddb` (requires auth)
     - Accept JSON body with the D&D Beyond export data
     - Return the created PlayerCharacter

3. Add API routes for character CRUD:
   - `GET /api/worlds/:worldId/characters` — list characters
   - `POST /api/worlds/:worldId/characters` — create character (manual)
   - `POST /api/worlds/:worldId/characters/import/ddb` — import from D&D Beyond
   - `GET /api/characters/:id` — get character
   - `PUT /api/characters/:id` — update character
   - `DELETE /api/characters/:id` — delete character

4. Add socket events for real-time character updates:
   ```typescript
   CHARACTER_UPDATE: 'character:update',     // client → server → all: HP, conditions, etc.
   CHARACTER_LIST: 'character:list',         // server → client: characters in world
   ```

**Client:**

5. Create `packages/client/src/components/character/CharacterSheet.tsx`:
   - Display a character sheet with all D&D 5e fields:
     - Name, race, class, level, background
     - Ability scores with modifiers
     - Skills with proficiency indicators
     - HP (current/max) with editable current HP
     - AC, speed, initiative
     - Conditions and death saves
     - Spell slots and prepared spells (display only for Phase 2)
     - Inventory list
     - Wealth
     - Personality traits, ideals, bonds, flaws
   - Players can edit their own character's mutable fields (HP, conditions, spell slots used, inventory notes)
   - DM can edit any character
   - Layout should feel like a D&D character sheet (not a form)

6. Create `packages/client/src/components/character/CharacterImport.tsx`:
   - Import flow:
     - "Import from D&D Beyond" button
     - Textarea to paste D&D Beyond JSON export
     - Preview of what will be imported
     - "Import" button → calls API
     - Success → shows the new character sheet

7. Add character list to the sidebar — players see their characters, DM sees all.

**Acceptance criteria:**
- A D&D Beyond character JSON can be imported and stored correctly
- Character sheet displays all major fields
- Players can edit their own HP, conditions, spell slots
- DM can edit any character
- Character HP changes sync in real-time to all clients
- Characters are associated with a specific world and user
- Multiple characters per user per world are supported

---

### Task 10: Phandalin Seed Data

**What to do:**

Create seed data for Phandalin and immediate surroundings from the Dragon of Icespire Peak adventure. This provides a real, populated world to test against.

**Create `packages/server/src/db/seeds/phandalin.ts`:**

1. **Locations** (hierarchical):
   ```
   Sword Coast North (region)
   ├── Phandalin (settlement, population: ~200, weather_region: "sword_coast_central")
   │   ├── Town Square (district)
   │   │   ├── Townmaster's Hall (building)
   │   │   ├── Shrine of Luck (building)
   │   │   └── Stonehill Inn (building)
   │   │       └── Common Room (room)
   │   │       └── Guest Rooms (room)
   │   ├── Main Street (district)
   │   │   ├── Barthen's Provisions (building)
   │   │   ├── Lionshield Coster (building)
   │   │   └── Miner's Exchange (building)
   │   ├── South Side (district)
   │   │   ├── Alderleaf Farm (building)
   │   │   └── Edermath Orchard (building)
   │   └── Outskirts (district)
   │       ├── Phandalin Miner's Exchange (building)
   │       └── Tresendar Manor (building)
   ├── Gnomengarde (settlement, population: ~20)
   ├── Umbrage Hill (settlement, population: ~5)
   │   └── Adabra's Tower (building)     ← the potion lady with the sending stone!
   ├── Mountain's Toe Gold Mine (wilderness)
   ├── Woodland Manse (wilderness)
   ├── Wyvern Tor (wilderness)
   ├── Butterskull Ranch (settlement, population: ~15)
   ├── Falcon's Hunting Lodge (wilderness)
   └── Icespire Hold (wilderness)
   ```

   Include `LocationConnection` records between settlements with travel times:
   - Phandalin → Gnomengarde: 6 hours, trail, danger 2
   - Phandalin → Umbrage Hill: 3 hours, road, danger 1
   - Phandalin → Mountain's Toe: 8 hours, trail, danger 4
   - Phandalin → Woodland Manse: 5 hours, trail, danger 3
   - Phandalin → Wyvern Tor: 10 hours, trail, danger 6
   - Phandalin → Butterskull Ranch: 4 hours, road, danger 2
   - etc.

2. **NPCs** — Create a realistic population for Phandalin. Key named NPCs as Tier 1-2, townspeople as Tier 3:

   **Tier 1 (Full) — Featured NPCs:**
   - Harbin Wester — Townmaster, cowardly, lives in Townmaster's Hall
   - Halia Thornton — Zhentarim agent, runs Miner's Exchange
   - Sister Garaele — Acolyte of Tymora, runs Shrine of Luck
   - Toblen Stonehill — Innkeeper at Stonehill Inn
   - Barthen — Runs Barthen's Provisions
   - Linene Graywind — Runs Lionshield Coster
   - Daran Edermath — Retired adventurer, lives at Edermath Orchard
   - Adabra Gwynn — Midwife/herbalist at Umbrage Hill tower

   Each Tier 1 NPC needs:
   - Full personality (traits, ideals, bonds, flaws)
   - Schedule (where they are each hour of the day)
   - Starting attitude toward party (0 = neutral)
   - Occupation, description, backstory
   - Token color and approximate ability scores

   **Tier 2 (Standard) — Named supporting NPCs:**
   - Trilena (Toblen's wife), Pip (their son)
   - Qelline Alderleaf (halfling farmer)
   - Narth (old farmer), Lanar (miner)
   - Several miners (5-6 named)
   - Guards (4-5 named)
   - A few shopkeepers and craftspeople

   Each Tier 2 NPC needs: name, race, occupation, basic schedule, location, brief personality.

   **Tier 3 (Light) — Background population:**
   - ~150 unnamed townspeople: farmers, laborers, children, elderly
   - Each has: race (80% human, 10% halfling, 5% dwarf, 5% other), gender, occupation, approximate age, home location
   - Simple schedule: home at night, work area during day
   - No personality or backstory (generated on first interaction in Phase 5)

3. **Example schedules for key NPCs:**

   Barthen:
   ```json
   {
     "default_day": [
       { "start_hour": 6, "end_hour": 7, "location_id": "<barthen_home>", "activity": "morning_routine", "interruptible": false },
       { "start_hour": 7, "end_hour": 12, "location_id": "<barthen_provisions>", "activity": "working_merchant", "interruptible": true },
       { "start_hour": 12, "end_hour": 13, "location_id": "<stonehill_inn>", "activity": "eating_lunch", "interruptible": true },
       { "start_hour": 13, "end_hour": 18, "location_id": "<barthen_provisions>", "activity": "working_merchant", "interruptible": true },
       { "start_hour": 18, "end_hour": 21, "location_id": "<stonehill_inn>", "activity": "leisure_tavern", "interruptible": true },
       { "start_hour": 21, "end_hour": 6, "location_id": "<barthen_home>", "activity": "sleeping", "interruptible": false }
     ],
     "weather_modifications": [
       {
         "condition": "storm",
         "replacement_block": { "start_hour": 7, "end_hour": 18, "location_id": "<barthen_home>", "activity": "sheltering", "interruptible": true }
       }
     ]
   }
   ```

4. **Seed script** — `packages/server/src/db/seed.ts`:
   - Takes a worldId parameter (or creates a world for a specified campaign)
   - Inserts all locations, connections, and NPCs
   - Uses Prisma transactions for consistency
   - Idempotent: can be run multiple times (upserts or checks for existing data)
   - Run with: `npx tsx src/db/seed.ts --campaign=<campaignId>`
   - Also run weather ingestion for `sword_coast_central` region

**Acceptance criteria:**
- Running the seed script populates Phandalin with ~200 NPCs across all three tiers
- Location hierarchy is correct and browsable
- Key NPCs have full schedules and personality data
- Advancing time causes NPCs to move between locations per their schedules
- The DM can browse the census and see the full population
- Barthen is at his shop during the day and at the tavern in the evening
- Weather data is loaded for the sword_coast_central region

---

### Task 11: Integration & Polish

**What to do:**

Wire everything together, ensure the existing Phase 1 features still work, and polish the experience.

1. **Session state migration:** The existing `SessionState` (tokens, fog, initiative, dice history) continues to work alongside the new world state. The session state is now associated with a world:
   - Add `worldId` to SessionState
   - Session save/load now also saves/loads the session's world reference
   - The session state remains in-memory + JSON for Phase 2 (battle map tokens, fog, initiative are still session-level, not world-level)
   - World state (clock, NPCs, locations, weather) lives in PostgreSQL

2. **CAMPAIGN_STATE sync update:** When a client joins a campaign:
   - Send the SessionState (battle map, tokens, fog, initiative) as before
   - Also send WorldState (clock, current location, weather)
   - Also send the list of NPCs at the current location

3. **Update shared types:** Add all new types to `packages/shared/src/index.ts` exports.

4. **Update socket events:** Register all new socket event handlers in `packages/server/src/socket/index.ts`. Create new handler files as needed:
   - `world-handlers.ts` — clock advance, location enter
   - `npc-handlers.ts` — NPC CRUD, list, detail
   - `character-handlers.ts` — character updates
   - `snapshot-handlers.ts` — snapshot CRUD

5. **DM sidebar tabs:** Update the sidebar to have tabs:
   - Battle Map (existing: tokens, fog tools)
   - World (new: clock, weather, location browser)
   - NPCs (new: census, NPC detail)
   - Characters (new: character sheets)
   - Initiative (existing)
   - Dice (existing)
   - Settings (new: snapshot manager, campaign admin)

6. **Player sidebar updates:**
   - Players see: world clock (read-only), weather, their character sheet, initiative, dice
   - Players do NOT see: NPC census, location browser (admin), snapshots

7. **Verify Phase 1 features still work:**
   - Map upload and display
   - Token placement and real-time sync
   - Fog of war
   - Initiative tracking
   - Dice rolling
   - Session save/load
   - Auth and campaign management

**Acceptance criteria:**
- All Phase 1 features continue to work unchanged
- World clock, weather, NPC positions, and character sheets all function alongside the battle map
- DM has a coherent multi-tab interface for managing the world
- Players see relevant information without admin clutter
- Time advance updates NPCs, weather, and clock in a single operation
- The full Phandalin seed data is browsable and functional
- Multiple campaigns with independent worlds can run simultaneously

---

## Database Migration Strategy

For Phase 2, use `prisma migrate dev` during development. When deploying:
1. Run `npx prisma migrate deploy` on the EC2 instance to apply migrations
2. Run the auth migration script to move JSON data to PostgreSQL
3. Run the seed script and weather ingestion for the initial campaign

Future phases use incremental Prisma migrations (`npx prisma migrate dev --name add_shops`) to add new tables without losing data.

---

## Deployment Updates

**docker-compose.yml additions:**
- Add PostgreSQL service (already covered in Task 0)

**EC2 production:**
- Install PostgreSQL 16 on the EC2 instance (or use RDS db.t3.micro)
- Set `DATABASE_URL` in the systemd service environment
- Run migrations and seeds after deployment

**Updated systemd service:**
```ini
[Service]
Environment=DATABASE_URL=postgresql://livingtable:CHANGE_ME@localhost:5432/livingtable
```

---

## Notes for Claude Code

- Run `npx prisma migrate dev` after every schema change. Run `npx prisma generate` to regenerate the client.
- Use Prisma transactions (`prisma.$transaction()`) for operations that modify multiple tables (e.g., snapshot restore, seed data insertion).
- The existing `SessionStateManager` and its in-memory state continue to manage battle map state (tokens, fog, initiative). World simulation state (clock, NPCs, locations, weather) is in PostgreSQL. These two systems coexist — don't try to merge them yet. Phase 3+ will gradually move more state to the database.
- The `CampaignStore` rewrite must maintain the exact same external API so that `app.ts` route handlers and socket handlers continue to work. Change storage, not interface.
- For the Harptos calendar, carefully implement festival days (they don't belong to any month — they're intercalary days between months). Day-of-year calculation must account for these.
- Weather ingestion may take a few minutes per region (Open-Meteo rate limits). Build in retry logic with exponential backoff.
- NPC schedules use 24-hour notation for `start_hour` and `end_hour`. Blocks that span midnight (e.g., `start_hour: 22, end_hour: 6`) need special handling — either treat them as two blocks or check both cases in the resolution logic.
- The seed script should be runnable against an empty database. It should also be safe to re-run (idempotent) — use upserts where possible.
- Test the full flow: create campaign → create world → seed Phandalin → advance time → verify NPC positions → check weather → create snapshot → advance more time → restore snapshot → verify rollback.
- Pixi.js is on version 8 in this codebase (not 7 as originally planned). Adjust any Pixi.js API calls accordingly.
