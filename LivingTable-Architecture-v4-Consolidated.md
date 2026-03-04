# LivingTable — Complete Architecture Document
## A Persistent World Simulation Engine with Virtual Tabletop Interface
### Version 4.0 — Consolidated Final Design

---

## Table of Contents

1. Vision & Design Principles
2. Core Simulation Systems
   - 2.1 World Clock
   - 2.2 NPC Simulation (Individual, Tiered Detail)
   - 2.3 Economic Model
   - 2.4 Consequence Engine
   - 2.5 Weather System (Real-World Data Mapped)
   - 2.6 Encounter Generation (Persistent Entities)
   - 2.7 Faction Simulation
   - 2.8 Event System
   - 2.9 Player Enterprises (Projects System)
   - 2.10 Communication Links
3. Interaction & Adjudication
   - 3.1 Player-NPC Interaction Pipeline
   - 3.2 Rules Engine (Pluggable)
   - 3.3 DM Controls & Override
4. Player Experience
   - 4.1 Battle Map
   - 4.2 Player Journal & Knowledge
   - 4.3 Character Sheets (Native)
5. Session Management
   - 5.1 Session Recording
   - 5.2 "Previously On..." Recaps
   - 5.3 Snapshots & Retcon
6. Authentication & Multi-Campaign
7. System Architecture
8. Database Schema
9. Simulation Tick Processing Order
10. Technology Stack
11. Phased Build Plan
12. Scale & Performance
13. Repository Structure
14. Future Features (Post-MVP)

---

## 1. Vision & Design Principles

LivingTable is a persistent world simulation engine with a virtual tabletop presentation layer. The simulation maintains a canonical world clock, economic model, individually-tracked NPC population, faction politics, weather, and regional trade. The world advances in lockstep with the campaign timeline. Player actions have real, cascading consequences that reshape the world over time.

**Principles:**

- **Simulation-first.** The world state is the source of truth. The VTT renders it.
- **Every NPC is an individual.** All NPCs are simulated individually with schedules, locations, and state. Detail generates lazily on player contact.
- **Player actions have consequences.** Liberating a mine changes the economy. Killing bandits affects their faction. Training giant rats changes the town. Ignoring a threat lets it grow. The world remembers.
- **Players build things.** Enterprises, trade networks, communication links, and long-term projects are first-class simulation objects with stages, risks, and cascading effects.
- **DM as director.** Sets parameters, seeds events, tunes knobs, intervenes for narrative moments. Does not need to adjudicate every shopkeeper conversation.
- **Automated adjudication with human override.** Routine interactions resolve automatically. Significant outcomes require DM approval.
- **System-agnostic rules.** D&D 5e first, but the rules engine is a pluggable module with ruleset data in config files.
- **Internet-native.** Accessible over the internet with authentication. Multiple campaigns run on one server with full isolation.
- **Open source end-to-end.** Every layer is forkable.

---

## 2. Core Simulation Systems

### 2.1 World Clock

The simulation runs on a canonical clock. One tick = 1 in-game minute (configurable). The clock advances only when triggered — it does not run in real-time.

**Advance triggers:**
- DM clicks "Advance X hours/days"
- Party rests (short rest: 1 hour, long rest: 8 hours)
- Party travels (travel time calculated from route distance and speed)
- Combat rounds (1 round = 1 minute simplified, or 6 seconds if granular)

**On clock advance, all subsystems tick** (see Section 9 for full ordering):
- Weather updates
- NPC schedules update
- Enterprise stages advance
- Economic ticks process
- Communication links process
- Events fire
- Consequences apply
- Faction plans advance
- Encounter checks (if traveling)

**Fast-forward aggregation:** For large time jumps (days/weeks), the system calculates net results without iterating every tick. NPC positions are derived from schedule + final time. Economic output is multiplied by elapsed days. Events are scanned in batch.

**Calendar:** Configurable. Default is the Harptos calendar (Forgotten Realms): 12 months of 30 days each, plus 5 festival days = 365 days/year. Tenday (10-day week) is the standard subdivision.

**Multi-party time (future):** When multiple parties exist in the same world, each party has a timeline cursor. The world advances to the *earliest* party's time. Parties ahead in time see a "frozen" world until the other parties catch up. Reconciliation events fire when parties' timelines converge at the same location.

### 2.2 NPC Simulation

Every NPC in the world — from the Archmage of Neverwinter to an unnamed farmer in a field — is an individual entity in the database with a unique ID, a current location, and a state.

#### Simulation Tiers

All NPCs are individually tracked. The tier determines how much detail is actively maintained:

**Tier 1: Full Simulation** (~50-200 per campaign)
- Featured NPCs and DM-controlled characters
- Full schedule with per-tick location tracking
- Individual economic transactions
- Rich personality, backstory, knowledge model
- Full interaction memory with each PC
- LLM dialogue with deep context
- DM can take direct control at any time

**Tier 2: Standard Simulation** (~500-2,000 per campaign)
- Named NPCs: shopkeepers, guards, priests, craftspeople
- Schedule with hourly location updates
- Simplified economics (daily income/expense aggregate)
- Generated personality and backstory (editable by DM)
- Basic interaction memory
- LLM dialogue with moderate context

**Tier 3: Light Simulation** (~3,000-18,000 per campaign)
- Population filler: farmers, laborers, children, travelers
- Schedule with 4-hour location updates (or on-demand when PCs enter the area)
- Aggregate economic participation
- Stub identity: race, gender, occupation, approximate age
- No backstory until first PC interaction

**Lazy promotion:** When a player interacts with a Tier 3 NPC:
1. System generates a name, personality, and brief backstory via LLM
2. NPC promotes to Tier 2
3. All generated data persists permanently
4. After 3+ interactions (configurable), NPC may promote to Tier 1 (DM notified)

**NPC auto-promotion also triggers when:**
- An NPC is involved in a consequence chain (the farmer whose crops were burned is now relevant)
- An NPC witnesses a significant event (the guard who saw the party sneak into the manor)
- An NPC is assigned to a player enterprise (the miner now training giant rats)
- The DM manually promotes an NPC

#### NPC Schedule

```typescript
interface NPCSchedule {
  default_day: ScheduleBlock[];
  day_overrides?: Record<string, ScheduleBlock[]>; // "market_day", "holy_day", "festival"
  temporary_override?: {
    schedule: ScheduleBlock[];
    reason: string;
    expires_tick?: number;
  };
  weather_modifications?: {
    // If it's raining, the farmer stays inside instead of working fields
    condition: string;       // "rain", "snow", "extreme_heat", "storm"
    replacement_block: ScheduleBlock;
  }[];
}

interface ScheduleBlock {
  start_hour: number;          // 0-23
  end_hour: number;
  location_id: string;
  activity: NPCActivity;
  interruptible: boolean;      // can PCs engage during this?
  enterprise_id?: string;      // if this block is for enterprise work
}
```

When NPCs are assigned to an enterprise, their schedule is modified. For example, a miner assigned to rat training 6 hours/day has their mining schedule block split — half mining, half at the rat pens. This reduces the mine's production output proportionally.

#### NPC State

```typescript
interface NPCState {
  current_location_id: string;
  current_activity: NPCActivity;
  is_alive: boolean;
  condition: 'normal' | 'injured' | 'unconscious' | 'captured' | 'sick' | 'fleeing';
  morale: number;              // 0-100, affects behavior under stress
  
  // Attitude toward each PC (-100 hostile to +100 devoted)
  pc_attitudes: Record<string, number>;
  
  // Attitude toward the party as a whole (derived from individual, plus group actions)
  party_attitude: number;
  
  // Memory of recent events affecting behavior
  recent_events: string[];     // "witnessed dragon attack", "party saved my child"
}
```

### 2.3 Economic Model

The economy operates at three scales: personal (NPC), business (shop), and regional (settlement).

#### Personal Economy
- Every NPC has wealth (coins by denomination), daily income, and daily expenses
- Wealth changes through wages, purchases, sales, taxes, gifts, theft
- NPCs who can't afford expenses may change behavior: seek new employment, beg, steal, emigrate

#### Business/Shop Economy
- Shops have: inventory, cash on hand, a restock method, and operating costs
- **Crafting shops** (blacksmith, fletcher, alchemist): owner produces items at a rate determined by their skill, available materials, and tools. A master blacksmith produces faster than an apprentice. Production requires raw materials that must be sourced.
- **Trade shops** (general store, exotic goods): restocked from trade route deliveries on a schedule. No deliveries = no new stock.
- **Natural supply** (fishmonger, herbalist, farmer's market): seasonal availability. Fishing is poor in winter. Herbs are seasonal. Harvests happen in autumn.
- **Dynamic pricing:** Base price × supply modifier × demand modifier × NPC attitude modifier × settlement prosperity modifier. A scarce item in a poor town with a hostile shopkeeper costs much more than PHB list price.
- **Cash flow is real:** If the party sells 500gp of loot to a village blacksmith who has 50gp on hand, the blacksmith can't pay. He might offer 50gp + trade, or refuse, or offer to pay in installments. The system handles this.

#### Regional Economy
- Settlements have: population, prosperity index (0.0 - 1.0), primary industries, trade connections
- Production nodes (mines, farms, workshops) feed resources into the local economy
- Trade routes connect settlements; goods flow with realistic travel-time delays
- Supply and demand are tracked per settlement per goods category (food, weapons, luxury, raw materials)
- Regional events (drought, war, festival, plague) affect all economic parameters
- Tax collection funds settlement improvements and defense

#### Economic Fast-Forward
For multi-day advances:
- Per-business: daily revenue = (items sold × price) - operating costs. Simplified to an average when no PCs are present to transact.
- Per-production-node: daily output × days elapsed, minus daily operating costs
- Trade route deliveries: check which shipments arrive during the window, add goods to destination shops
- Settlement prosperity: adjust based on net economic activity during the window

### 2.4 Consequence Engine

Translates player actions (and world events) into cascading, persistent changes in the simulation.

#### WorldEffect Structure

Every significant action produces a WorldEffect containing:
- **Immediate effects:** Changes applied right now (location state, NPC attitudes, faction influence)
- **Ongoing effects:** Changes that apply repeatedly over time (mine production, economic growth, NPC migration)
- **Conditional consequences:** Things that might happen if conditions are met (bandits raid the mine if security is low; the Zhentarim get interested if profit is high)

#### Consequence Templates

Common action patterns have pre-built consequence templates that the DM selects and customizes:
- `liberate_location` — clear threat from a location, activate production, attract settlers
- `establish_trade_route` — connect two settlements, goods begin flowing
- `defeat_faction_cell` — reduce faction influence, trigger retaliation plan
- `ally_with_faction` — gain faction support, inherit faction enemies
- `build_infrastructure` — improve settlement, attract population, costs resources
- `destroy_infrastructure` — damage settlement, trigger refugees, economic downturn
- `assassinate_npc` — power vacuum, faction response, NPC relationship cascades
- `discover_resource` — new production potential, attract attention
- `establish_enterprise` — player-initiated project begins, NPC labor reallocated, ongoing consequences
- `establish_comm_link` — new communication channel, enables remote trade and intel flow

The DM can also ask the LLM to suggest consequences for novel actions, review them, and commit.

#### DM Tuning Knobs

Global parameters the DM adjusts to control simulation behavior:

```yaml
simulation_tuning:
  consequence_density: medium        # how many cascading effects per action
  threat_frequency: 0.1              # base threat probability per location per week
  threat_scaling_with_wealth: 0.5    # richer targets attract more threats
  economic_growth_rate: 1.0          # multiplier on prosperity changes
  migration_sensitivity: 0.5         # how quickly population responds to prosperity
  faction_aggression: 0.5            # how quickly factions act
  guard_effectiveness: 0.8           # how much security reduces threats
  enterprise_risk_modifier: 1.0      # multiplier on enterprise risk event probabilities
  comm_link_npc_initiative: 0.5      # how proactively NPCs use comm links to share info
```

### 2.5 Weather System

Weather is derived from real-world historical data mapped to in-game locations.

#### Location Mapping

Each game-world region is mapped to a real-world location with comparable geography:

```yaml
weather_mappings:
  sword_coast_north:               # Icewind Dale, Ten Towns
    real_world: "Tromsø, Norway"
    latitude: 69.65
    longitude: 18.96
    altitude_offset_m: 0
    
  sword_coast_central:             # Neverwinter, Phandalin
    real_world: "Inverness, Scotland"
    latitude: 57.48
    longitude: -4.22
    altitude_offset_m: 200         # Phandalin is in foothills
    
  sword_coast_south:               # Waterdeep, Baldur's Gate
    real_world: "Bordeaux, France"
    latitude: 44.84
    longitude: -0.58
    altitude_offset_m: 0
    
  calimshan:                       # Southern desert region
    real_world: "Marrakech, Morocco"
    latitude: 31.63
    longitude: -8.01
    altitude_offset_m: 0
    
  spine_of_the_world:              # Mountain range
    real_world: "Chamonix, France"
    latitude: 45.92
    longitude: 6.87
    altitude_offset_m: 1500
```

#### Data Ingestion

Pre-load historical weather data for each mapped location. Sources:
- **Open-Meteo Historical Weather API** (free, no API key needed, 1940-present)
- Data fields needed: temperature (high/low), precipitation type and amount, wind speed, cloud cover, humidity
- Store 2-5 years of daily data per location → use as a rotating lookup
- Index by day-of-year so the simulation can query "what's the weather for day 142 of the year in the Neverwinter region"

```sql
weather_data (
  id UUID PRIMARY KEY,
  weather_region TEXT,               -- "sword_coast_central"
  day_of_year INT,                   -- 1-365
  year_source INT,                   -- which real-world year this data came from
  
  temperature_high_c FLOAT,
  temperature_low_c FLOAT,
  precipitation_mm FLOAT,
  precipitation_type TEXT,           -- "none", "rain", "snow", "sleet", "hail"
  wind_speed_kph FLOAT,
  wind_direction TEXT,
  cloud_cover_pct FLOAT,
  humidity_pct FLOAT,
  
  -- Derived game-relevant categories
  travel_condition TEXT,             -- "clear", "poor", "dangerous", "impassable"
  outdoor_work_modifier FLOAT,      -- 1.0 = normal, 0.5 = half productivity, 0.0 = impossible
  combat_modifier TEXT,              -- "none", "visibility_reduced", "difficult_terrain", etc.
  description TEXT                   -- "A cold, overcast day with occasional drizzle"
)
```

#### Weather Effects on Simulation

- **NPC schedules:** Farmers don't work fields in heavy snow. Fishermen don't fish in storms. Market vendors may stay home in extreme weather. Schedule weather_modifications trigger.
- **Travel:** Bad weather increases travel time. Storms may make routes impassable. Snow accumulation blocks mountain passes seasonally.
- **Combat:** Rain reduces visibility and affects ranged attacks. Snow creates difficult terrain. Extreme cold/heat requires Constitution saves (per rules engine).
- **Economy:** Crop yields depend on seasonal weather. A drought reduces farm output. Early frost damages harvests. Good weather = bumper crop = lower food prices.
- **Enterprises:** Weather affects enterprise activities. Outdoor construction halts in storms. Animal husbandry is harder in extreme cold. The `outdoor_work_modifier` applies to enterprise stage durations.
- **Narrative flavor:** The LLM incorporates current weather into NPC dialogue and scene descriptions. "The rain hammers the tavern's roof as Barthen wipes down the counter."

#### Year Selection

On world creation, the DM picks which real-world year(s) to use for weather data (or the system picks randomly from loaded years). This means each campaign has unique but realistic weather patterns. A campaign that starts in a drought year will have very different economic dynamics than one in a wet year.

### 2.6 Encounter Generation (Persistent Entities)

Random encounters are not disposable. Every encounter entity is a full NPC record linked to a source.

#### Encounter Generation Flow

```
Party travels from Phandalin to Neverwinter along the High Road
  │
  ├── System checks route danger_level (e.g., 4/10)
  ├── Rolls for encounter probability per travel segment
  │   (modified by: time of day, weather, party size, recent events)
  │
  ├── IF encounter triggered:
  │   ├── Determine encounter type from route's encounter table
  │   │   (weighted by terrain, region, current threats, faction activity)
  │   │
  │   ├── Generate encounter entities as FULL NPC RECORDS:
  │   │   ├── 5 orcs → 5 NPC entries in the database
  │   │   ├── Each has: name, ability scores, HP, inventory, personality
  │   │   ├── Linked to a source: "Wyvern Tor orc clan"
  │   │   ├── Source is itself a location with a population census
  │   │   └── Orcs have knowledge: patrol routes, clan politics, nearby threats
  │   │
  │   ├── Place encounter on the travel route map
  │   └── Transition to tactical (battle map) or social interaction
  │
  └── After encounter resolution:
      ├── Dead entities: marked is_alive = false, removed from source census
      ├── Fled entities: return to source, carry information about the party
      │   ├── npc_pc_memory entry created: "encountered party, was defeated"
      │   ├── Attitude toward party: set to hostile
      │   └── Source settlement's knowledge updated: "adventurers on the road"
      │
      ├── Consequence engine fires:
      │   ├── "5 orcs dead from Wyvern Tor clan" →
      │   │   ├── Clan strength reduced
      │   │   ├── If 2 survivors returned: clan is warned, doubles patrols
      │   │   ├── If 0 survivors: clan notices missing patrol, investigates
      │   │   └── Future encounters with this clan are affected
      │   │
      │   ├── Route danger_level may decrease (threat partially addressed)
      │   ├── Nearby settlements hear rumors of battle on the road
      │   └── Faction effects if orcs were affiliated
      │
      └── Loot from encounter: tracked as inventory items with provenance
          (this sword was carried by Gruumsh Eye-Biter of the Wyvern Tor clan)
```

#### Encounter Source Locations

Threats have homes. When the system generates encounters, it first determines (or creates) the source:

- **Existing threat location:** The orc clan at Wyvern Tor is already in the database. Encounter draws from their population.
- **New threat location:** If no appropriate source exists, the system generates one — a new bandit camp, monster lair, or wandering creature. This becomes a persistent location with its own census, potentially discoverable by the party.
- **Population tracking:** The source location's census depletes as encounters are resolved. If the party kills enough orcs over multiple encounters, the Wyvern Tor clan weakens visibly. If the clan is entirely eliminated, that threat source is removed and the route becomes safer.

### 2.7 Faction Simulation

Factions are organizations with goals, resources, and plans that advance on the world clock.

Each faction has:
- **Goals:** Ranked objectives (control Phandalin's mining, expand smuggling network, protect the Sword Coast)
- **Resources:** Gold, soldiers/agents, influence, territory, information
- **Active plans:** Multi-stage plans that advance on a timer, modified by world events
- **Influence by settlement:** How much sway they have in each location
- **Relationships:** Attitudes toward other factions and the party
- **Agents:** NPCs flagged as faction members, carrying out faction directives

Factions respond to player actions:
- Party disrupts Zhentarim smuggling → Zhentarim adjust plans, possibly target party
- Party allies with Harpers → Lords' Alliance may view party more favorably (or with suspicion)
- Party ignores a faction's request → relationship degrades, faction proceeds without them

Faction plan advancement is checked on each time advance. Plans have stages with durations, resource costs, and success/failure conditions. The DM sets up faction plans; the simulation executes them on schedule. The DM can pause, modify, or cancel any plan at any time.

### 2.8 Event System

Events are things that happen in the world on a schedule or when conditions are met.

**Event types:**
- **Timed:** Fire at a specific world clock tick ("The merchant caravan arrives on Mirtul 15")
- **Conditional:** Fire when a condition becomes true ("When the party reaches level 7, the dragon becomes active")
- **Recurring:** Fire on a regular schedule ("Weekly market every Firstday," "Tax collection every month")
- **Emergent:** Generated by the consequence engine or faction simulation ("Orc raids increase after clan is provoked")

Events can:
- Spawn or remove NPCs
- Modify settlement/location properties
- Trigger consequence chains
- Generate quest hooks
- Alter weather (magical storms, etc.)
- Modify faction plans
- Disrupt communication links
- Affect active enterprises (a raiding party attacks the rat pens)
- Present narrative text to the DM (or directly to players for public events)

### 2.9 Player Enterprises (Projects System)

Players don't just fight monsters and buy gear — they build things. They establish businesses, train animals, construct fortifications, cultivate resources, and create networks. These are long-term undertakings with stages, resource requirements, NPC assignments, timelines, skill checks, and cascading consequences.

The existing production node system models simple steady-state output (mine produces ore per day). Player enterprises are more complex: they have a **setup phase** with milestones, a **maturation curve**, **variable outcomes** based on skill and investment, **ongoing maintenance needs**, and **emergent risks**.

#### Enterprise Model

An enterprise is a player-initiated project that:
- Has defined stages with durations and requirements
- Requires NPC labor assignments (modifying their schedules)
- Consumes resources (gold, materials, time)
- Has skill checks at key milestones (using assigned NPC skills or PC skills)
- Can succeed, partially succeed, or fail at each stage
- Produces output when operational (goods, services, creatures, influence, etc.)
- Has ongoing maintenance costs and risks
- Evolves the world through the consequence engine

```typescript
interface Enterprise {
  id: string;
  world_id: string;
  name: string;                      // "Giant Rat Training Program"
  description: string;
  enterprise_type: string;           // 'husbandry', 'construction', 'business', 'military', 
                                     // 'agricultural', 'arcane', 'network', 'custom'
  
  // Who owns/runs this
  owner_type: 'party' | 'pc' | 'npc' | 'faction';
  owner_id: string;
  location_id: string;               // where the enterprise is based
  
  // Current state
  status: 'planning' | 'in_progress' | 'operational' | 'suspended' | 'failed' | 'abandoned';
  current_stage_index: number;
  stages: EnterpriseStage[];
  
  // Resources
  total_invested: Currency;           // how much has been spent so far
  ongoing_cost_per_day: Currency;     // daily operating expenses
  
  // Labor
  assigned_npcs: AssignedWorker[];    // NPCs working on this
  
  // Output (once operational)
  output_config?: ProductionConfig;   // what this produces when running
  
  // Risk
  risk_factors: RiskFactor[];         // things that can go wrong
  
  // Tracking
  started_tick: number;
  last_updated_tick: number;
  log: EnterpriseLogEntry[];          // history of events, checks, milestones
  
  dm_notes: string;
}

interface EnterpriseStage {
  name: string;                       // "Pen Construction", "Habituation", "Basic Training"
  description: string;
  duration_ticks: number;             // how long this stage takes (in ideal conditions)
  
  // Requirements to begin this stage
  prerequisites: {
    resources?: ResourceRequirement[];   // materials, gold needed
    npcs_required?: number;              // minimum workers
    skill_requirements?: SkillReq[];     // workers need Animal Handling > X, etc.
    facilities?: string[];               // needs a "pen", "forge", "workshop", etc.
    items?: string[];                    // specific items required
  };
  
  // What happens during this stage
  activities: StageActivity[];
  
  // Checks at stage completion
  completion_check?: {
    skill: string;                     // "animal_handling", "smith_tools", etc.
    dc: number;
    who_rolls: 'best_worker' | 'average_workers' | 'specific_npc' | 'pc';
    specific_roller_id?: string;
    
    // Outcomes based on check result
    success: StageOutcome;
    partial_success?: StageOutcome;    // meet DC but within 5
    failure: StageOutcome;
    critical_failure?: StageOutcome;   // fail by 10+
  };
  
  // What completing this stage produces (if anything)
  stage_output?: {
    items?: ItemOutput[];              // items produced
    npcs_modified?: NPCModification[]; // NPC state changes
    world_effects?: Effect[];          // consequence engine effects
  };
}

interface StageActivity {
  description: string;                 // "Feeding and handling the rats daily"
  npc_time_per_day_hours: number;      // how many hours per day per worker
  resource_consumption_per_day?: ResourceRequirement[];  // daily material costs
  risk_event_probability?: number;     // chance of a mishap per day
  risk_event?: RiskEvent;
}

interface StageOutcome {
  description: string;
  advance_to_next: boolean;
  output_modifier?: number;            // 1.0 = full output, 0.5 = half, etc.
  time_modifier?: number;              // 1.0 = normal, 1.5 = took 50% longer
  side_effects?: Effect[];
}

interface AssignedWorker {
  npc_id: string;
  role: string;                        // "trainer", "builder", "guard", "laborer"
  hours_per_day: number;
  schedule_override_id?: string;       // reference to the schedule modification
  skill_relevant: string;              // which of their skills matters
  skill_modifier: number;              // their modifier for that skill
  morale: number;                      // 0-100, affects productivity and quit probability
  assigned_since_tick: number;
}

interface RiskFactor {
  name: string;                        // "Rat Escape", "Worker Injury", "Disease"
  probability_per_day: number;         // base chance
  severity: 'minor' | 'moderate' | 'major' | 'catastrophic';
  mitigation: string;                  // what reduces the risk
  mitigation_reduction: number;        // how much it reduces probability
  consequence: Effect[];               // what happens if the risk materializes
}
```

#### Example: Giant Rat Training Program

```yaml
enterprise:
  name: "Giant Rat Training Program"
  type: husbandry
  owner: party
  location: mountain_toe_mine

  stages:
    - name: "Pen Construction"
      duration_days: 3
      prerequisites:
        resources:
          - { type: lumber, quantity: 20 }
          - { type: iron_nails, quantity: 100 }
          - { type: gold, amount: 15 }
        npcs_required: 2
      completion_check:
        skill: carpenter_tools
        dc: 10
        success:
          description: "Sturdy pens built. The rats won't easily escape."
          advance: true
        failure:
          description: "Pens are rickety. Escape risk increased."
          advance: true
          side_effects:
            - risk_modifier: { "Rat Escape": +0.05 }

    - name: "Rat Acquisition"
      duration_days: 5
      description: "Capturing or purchasing giant rats"
      prerequisites:
        npcs_required: 3
        skill_requirements:
          - { skill: animal_handling, minimum: 0 }
      activities:
        - description: "Hunting and trapping giant rats in the mine tunnels"
          npc_time_per_day_hours: 6
          risk_event_probability: 0.10
          risk_event:
            name: "Rat Bite"
            effects:
              - { type: npc_condition, condition: injured, duration_days: 3 }
              - { type: npc_morale_change, amount: -10 }
      completion_check:
        skill: animal_handling
        dc: 12
        who_rolls: best_worker
        success:
          description: "Captured 6 healthy giant rats suitable for training."
          output:
            items:
              - { template: giant_rat_untrained, quantity: 6 }
        partial_success:
          description: "Captured 3 giant rats, but some escaped."
          output:
            items:
              - { template: giant_rat_untrained, quantity: 3 }
        failure:
          description: "Rats proved too aggressive. Only 1 captured, 1 worker bitten badly."
          output:
            items:
              - { template: giant_rat_untrained, quantity: 1 }
          side_effects:
            - { type: npc_condition, target: worst_roller, condition: injured, duration_days: 7 }

    - name: "Habituation"
      duration_days: 7
      description: "Getting the rats accustomed to human presence and handling"
      prerequisites:
        npcs_required: 2
        skill_requirements:
          - { skill: animal_handling, minimum: 1 }
      activities:
        - description: "Daily feeding by hand, gradual desensitization"
          npc_time_per_day_hours: 4
          resource_consumption_per_day:
            - { type: meat_scraps, quantity: 2 }
          risk_event_probability: 0.05
          risk_event:
            name: "Rat Aggression"
            effects:
              - { type: npc_condition, condition: injured, duration_days: 2 }
      completion_check:
        skill: animal_handling
        dc: 13
        who_rolls: average_workers
        success:
          description: "Rats are calm around handlers. Ready for training."
        failure:
          description: "Rats remain skittish. Training will take longer."
          time_modifier: 1.5

    - name: "Basic Training"
      duration_days: 14
      description: "Teaching rats to follow commands: come, stay, attack on signal"
      prerequisites:
        npcs_required: 2
        skill_requirements:
          - { skill: animal_handling, minimum: 2 }
      activities:
        - description: "Repetitive command training with food rewards"
          npc_time_per_day_hours: 6
          resource_consumption_per_day:
            - { type: meat_scraps, quantity: 3 }
      completion_check:
        skill: animal_handling
        dc: 14
        who_rolls: best_worker
        success:
          description: "Rats respond to basic commands reliably."
          output:
            items_transform:
              - { from: giant_rat_untrained, to: giant_rat_basic_trained }
        failure:
          description: "Rats are unpredictable. May not follow commands under stress."
          output:
            items_transform:
              - { from: giant_rat_untrained, to: giant_rat_poorly_trained }

    - name: "Advanced Training (Optional)"
      duration_days: 21
      description: "Specialized training: guard duty, pack carrying, combat support"
      prerequisites:
        npcs_required: 1
        skill_requirements:
          - { skill: animal_handling, minimum: 4 }
      completion_check:
        skill: animal_handling
        dc: 16
        who_rolls: best_worker
        success:
          description: "Rats are fully trained combat/guard animals."
          output:
            items_transform:
              - { from: giant_rat_basic_trained, to: giant_rat_fully_trained }
        failure:
          description: "Advanced training failed. Rats remain at basic training level."
          advance: false

  operational_output:
    cycle_duration_days: 45
    output_per_cycle:
      - { template: giant_rat_fully_trained, quantity_range: [2, 5] }
    ongoing_cost_per_day:
      - { type: gold, amount: 0.5 }
      - { type: npc_labor_hours, amount: 8 }

  risk_factors:
    - name: "Rat Escape"
      probability_per_day: 0.02
      severity: minor
      mitigation: "Reinforced pens, regular inspection"
      mitigation_reduction: 0.015
      consequence:
        - { type: inventory_loss, items: [giant_rat_*], quantity: 1 }
        - { type: settlement_event, description: "Giant rat loose in town" }
    - name: "Disease Outbreak"
      probability_per_day: 0.005
      severity: major
      mitigation: "Clean pens, quarantine new rats"
      mitigation_reduction: 0.004
      consequence:
        - { type: inventory_loss, items: [giant_rat_*], quantity_percent: 50 }
        - { type: npc_condition, targets: assigned_workers, condition: sick, duration_days: 7 }
        - { type: settlement_risk, description: "Disease may spread to townspeople" }
    - name: "Trainer Quits"
      probability_per_day: 0.01
      severity: moderate
      mitigation: "Good pay, safe conditions"
      mitigation_reduction: 0.008
      consequence:
        - { type: worker_loss, count: 1 }
        - { type: enterprise_slowdown, modifier: 0.5, until: worker_replaced }

  consequences:
    - type: immediate
      effects:
        - settlement_reputation: "Phandalin is known for trained giant rats"
        - trade_opportunity: "Merchants may come seeking trained animals"
        - npc_attitudes: "Locals are curious/amused/concerned about the rat program"
    - type: conditional
      condition: "operational > 30 days AND rats_produced > 5"
      effects:
        - "Neighboring settlements hear about the program"
        - "Animal traders visit seeking to buy trained rats"
        - "Druids or rangers may take interest (positive or negative)"
    - type: conditional
      condition: "rat_escape_events > 3"
      effects:
        - "Townsfolk petition to shut down the program"
        - "NPC attitudes in Phandalin toward party decrease"
        - "Town council (Harbin Wester) may impose regulations"
```

### 2.10 Communication Links

Communication links are persistent channels between entities that allow information to flow without physical travel. They change how trade, intelligence, and coordination work in the simulation.

#### Link Types

```typescript
interface CommunicationLink {
  id: string;
  world_id: string;
  name: string;                        // "Phandalin-Tower Sending Stone Pair"
  link_type: CommunicationLinkType;
  
  // Endpoints
  endpoint_a: CommEndpoint;
  endpoint_b: CommEndpoint;
  
  // Capabilities
  bandwidth: MessageBandwidth;
  direction: 'bidirectional' | 'a_to_b' | 'b_to_a';
  
  // Usage limits
  uses_per_day?: number;               // NULL = unlimited
  uses_remaining_today: number;
  resets_at_hour: number;              // when daily uses reset (e.g., dawn = 6)
  
  // Range
  max_range?: number;                  // NULL = unlimited; in miles for magical limits
  current_distance?: number;           // calculated from endpoint locations
  is_in_range: boolean;
  
  // Status
  status: 'active' | 'dormant' | 'disrupted' | 'destroyed';
  disruption_reason?: string;
  disrupted_until_tick?: number;
  
  // Physical components (can be stolen, lost, destroyed)
  physical_items?: {
    item_id: string;                   // reference to inventory_items
    held_by_endpoint: 'a' | 'b';
  }[];
  
  // Metadata
  established_tick: number;
  established_by: string;
  dm_notes: string;
}

type CommunicationLinkType = 
  | 'sending_stones'      // paired items, 25 words, 1/day each direction
  | 'animal_messenger'    // spell or trained animal, delayed delivery
  | 'courier_network'     // NPC runners, physical delivery, travel time applies
  | 'signal_fires'        // line-of-sight, binary/simple messages
  | 'telepathic_bond'     // spell-based, duration limited
  | 'dream'               // Dream spell, requires sleep
  | 'scrying'             // one-way observation
  | 'message_board'       // public posting at a location, asynchronous
  | 'custom';             // DM-defined

interface MessageBandwidth {
  max_words_per_message?: number;      // 25 for sending stones
  message_types: MessageType[];        // what can be communicated
  latency_ticks: number;               // 0 = instant, >0 = delayed
  reliability: number;                 // 0.0-1.0, chance message arrives intact
}

type MessageType = 
  | 'text'               // spoken/written words
  | 'trade_order'        // "send me 3 healing potions"
  | 'intel'              // information sharing (NPC knowledge transfer)
  | 'warning'            // urgent alert
  | 'coordination'       // tactical planning
  | 'emotional'          // can convey tone/emotion (not just words)
  | 'visual'             // scrying, projected images
  | 'object_transfer';   // teleportation circles, bags of holding tricks
```

#### How Communication Links Affect the Simulation

**Remote Commerce:**

When a sending stone link connects the party to a merchant/crafter:

```
WITHOUT sending stone:
  1. PC travels to tower (4 hours each way)
  2. Places order in person
  3. Alchemist brews potions (1 day per potion)
  4. PC travels back to pick up (4 more hours)
  Total: 1-3 days depending on order size

WITH sending stone:
  1. PC uses sending stone: "Need 3 healing potions. Will send courier."  (instant, 1/day use)
  2. Alchemist replies: "Will have them ready in 2 days. 150gp."  (instant)
  3. Alchemist begins brewing immediately (no wait for PC to arrive)
  4. Party sends courier NPC or travels themselves to pick up when ready
  Total: 2 days (brewing time only) + pickup travel
  
  OR if courier network exists:
  4. Courier departs Phandalin with payment (4 hours)
  5. Courier returns with potions (4 hours)
  Total: 2 days + 8 hours
```

The simulation models this as:
- The sending stone message is logged as an interaction
- A remote trade order is created in the alchemist's queue
- The alchemist's schedule shifts: she allocates crafting time for the order
- Her production system begins producing the potions
- A delivery mechanism is established (courier NPC, party pickup, etc.)
- On delivery completion, the transaction processes: gold from party → alchemist, potions → party inventory

**Information Flow:**

Communication links allow NPCs to share knowledge with the party remotely:

```
Alchemist at the tower observes orc scouts near the road.

WITHOUT sending stone:
  - Information stays with the alchemist until someone visits
  - Party might walk into an ambush

WITH sending stone:
  - Alchemist uses daily message: "Orc scouts spotted near the crossroads. Be careful."
  - Party receives warning immediately
  - PC knowledge updated: "orcs near crossroads" (intel from alchemist)
  - Party can plan accordingly
```

The simulation handles this through:
- NPC knowledge events: when the alchemist NPC "observes" something (triggered by encounter generation near her location, or by the consequence engine), it's added to her knowledge
- Communication link check: the system evaluates whether any communication link exists between this NPC and the party
- If yes, and if the NPC's attitude toward the party is positive enough, and a daily use is available: the NPC sends a message
- The message is logged, PC knowledge is updated, and the daily use is consumed

**Vulnerability:**

Communication links create dependencies that can be exploited:
- If a sending stone is stolen, the link breaks (or worse, the enemy can use it)
- If the alchemist is captured, the link goes silent — which is itself information
- A wizard casting Dispel Magic can disrupt magical links temporarily
- Courier networks can be ambushed; couriers carry information about the party's activities
- "Your sending stone went dead. Something has happened at the tower." — quest hook

#### DM Control Over Communication Links

- DM can see all messages sent through any communication link
- DM can block a message before delivery (the stone "fails to connect" this time)
- DM can have NPCs initiate messages (the alchemist warns the party unprompted)
- DM can disrupt links: an enemy steals one stone, a wizard casts Dispel Magic on the link, the courier is ambushed
- DM can create link-related quest hooks: "Your sending stone went dead. Something has happened at the tower."

---

## 3. Interaction & Adjudication

### 3.1 Player-NPC Interaction Pipeline

```
Player clicks NPC token on map
  │
  ├── LAYER 1: Availability
  │   ├── Is NPC at this location right now? (schedule + clock check)
  │   ├── Is NPC alive, conscious, willing?
  │   ├── Is NPC currently busy with another PC?
  │   └── If unavailable → message: "The shop appears to be closed" / "The guard is unconscious"
  │
  ├── LAYER 2: Action Selection
  │   Player sees available actions based on context:
  │   ├── Converse — free-form dialogue (LLM-driven)
  │   ├── Persuade / Deceive / Intimidate — social skill check
  │   ├── Investigate / Insight — information gathering
  │   ├── Buy / Sell / Trade — commercial (only if NPC is a merchant)
  │   ├── Perform — entertainment, busking
  │   ├── Pickpocket / Steal — Sleight of Hand vs Perception
  │   ├── Attack — transitions to combat (DM always notified)
  │   ├── Send Message (via comm link) — if communication link exists
  │   └── Custom — player describes what they want to do
  │
  ├── LAYER 3: Adjudication
  │   ├── Rules engine determines:
  │   │   ├── Relevant skill and ability
  │   │   ├── DC based on: NPC attitude, request difficulty, context, environment
  │   │   ├── Modifiers: advantage/disadvantage, conditions, equipment
  │   │   └── Roll result and outcome
  │   │
  │   ├── For dialogue: LLM generates NPC response using:
  │   │   ├── NPC personality, knowledge, backstory
  │   │   ├── NPC attitude toward this PC
  │   │   ├── Current context (time, weather, location, recent events)
  │   │   ├── NPC's memory of past interactions with this PC
  │   │   └── Skill check result (if applicable)
  │   │
  │   ├── Outcome classified as:
  │   │   ├── ROUTINE — auto-resolves (buying bread, asking directions, failed persuasion)
  │   │   └── SIGNIFICANT — pauses for DM approval (secret revealed, guard leaves post,
  │   │       large transaction, NPC offers quest, combat initiated)
  │   │
  │   └── DM notification level (configurable per NPC, per interaction type):
  │       ├── "silent" — DM sees it in the log but no alert
  │       ├── "notify" — DM gets a notification, interaction proceeds
  │       └── "approve" — interaction pauses until DM approves/modifies/rejects
  │
  ├── LAYER 4: DM Override
  │   ├── DM can take control of any NPC at any time (replaces LLM with DM typing)
  │   ├── DM sees all interactions in real-time on their screen
  │   ├── DM can modify any outcome before it commits
  │   ├── DM can retcon any committed outcome (rolls back state changes)
  │   └── Specific NPCs can be permanently set to "DM-controlled"
  │
  └── LAYER 5: State Updates
      ├── NPC attitude toward PC adjusts based on outcome
      ├── NPC memory logs the interaction
      ├── PC knowledge about NPC updates (what they learned)
      ├── Economic state updates (if transaction)
      ├── Reputation effects (if witnesses)
      ├── Communication link messages sent (if remote interaction)
      ├── Consequence engine checks for triggered consequences
      └── Session log records everything
```

### 3.2 Rules Engine (Pluggable)

The rules engine is a TypeScript module implementing a standard interface. The simulation core never calls system-specific logic directly.

```typescript
interface RulesEngine {
  // Metadata
  readonly systemName: string;     // "D&D 5th Edition"
  readonly systemId: string;       // "dnd5e"
  readonly version: string;
  
  // Character
  getAbilityModifier(character: CharacterSheet, ability: string): number;
  getSkillModifier(character: CharacterSheet, skill: string): number;
  getProficiencyBonus(character: CharacterSheet): number;
  getPassiveScore(character: CharacterSheet, skill: string): number;
  
  // Checks
  rollAbilityCheck(actor: CharacterSheet, ability: string, dc: number, 
                   context?: CheckContext): CheckResult;
  rollSkillCheck(actor: CharacterSheet, skill: string, dc: number, 
                 context?: CheckContext): CheckResult;
  rollContestedCheck(actor: CharacterSheet, actorSkill: string,
                     target: CharacterSheet, targetSkill: string): ContestedResult;
  rollSavingThrow(actor: CharacterSheet, ability: string, dc: number): CheckResult;
  
  // Social
  getSocialDC(npc: NPCRecord, interactionType: string, 
              requestDifficulty: string, context: SocialContext): number;
  calculateAttitudeChange(npc: NPCRecord, interactionType: string, 
                          result: CheckResult): number;
  
  // Combat
  rollInitiative(character: CharacterSheet): number;
  rollAttack(attacker: CharacterSheet, weapon: Item, target: CharacterSheet,
             context?: CombatContext): AttackResult;
  rollDamage(attacker: CharacterSheet, weapon: Item, critical: boolean): DamageResult;
  
  // Economy
  getItemBasePrice(itemId: string): Currency;
  calculateMerchantPrice(item: Item, merchant: NPCRecord, buyer: CharacterSheet,
                         context: TradeContext): Currency;
  canAfford(entity: { wealth: Currency }, cost: Currency): boolean;
  processTransaction(buyer: Entity, seller: Entity, items: Item[], 
                     price: Currency): TransactionResult;
  
  // Conditions & Effects
  applyCondition(character: CharacterSheet, condition: string): CharacterSheet;
  getWeatherCombatModifiers(weather: WeatherState): CombatModifier[];
  getWeatherTravelModifiers(weather: WeatherState): TravelModifier[];
  
  // Inventory & Encumbrance
  getEncumbrance(character: CharacterSheet): EncumbranceResult;
  canEquip(character: CharacterSheet, item: Item): boolean;
  
  // Enterprises
  rollEnterpriseStageCheck(workers: AssignedWorker[], stage: EnterpriseStage): CheckResult;
  rollEnterpriseRiskEvent(risk: RiskFactor, modifiers: RiskModifier[]): boolean;
}
```

Ruleset data lives in config files, not code:

```
rulesets/
├── dnd5e/
│   ├── ruleset.yaml          # system metadata
│   ├── abilities.yaml        # STR, DEX, CON, INT, WIS, CHA + modifier tables
│   ├── skills.yaml           # skill → ability mappings, proficiency rules
│   ├── items.yaml            # complete SRD item database
│   ├── weapons.yaml          # weapon properties, damage, types
│   ├── armor.yaml            # armor stats, proficiency requirements
│   ├── classes.yaml          # class features, HD, proficiencies, spell slots
│   ├── races.yaml            # racial traits, ability bonuses
│   ├── conditions.yaml       # condition effects on checks/combat
│   ├── social_dc_tables.yaml # DC tables for social interactions by attitude
│   ├── economy.yaml          # currency, trade goods, living expenses, services
│   ├── encounter_tables.yaml # CR calculations, XP thresholds
│   └── weather_effects.yaml  # weather → mechanical effects
└── homebrew/
    └── ...                   # can extend or override any base ruleset
```

### 3.3 DM Controls

**Real-time monitoring dashboard:**
- Live feed of all player-NPC interactions
- Alert queue for interactions awaiting approval
- NPC control panel: click any NPC to take over their dialogue
- Simulation status: current world time, active effects, pending events
- Enterprise status panel: active enterprises, stage progress, risk alerts
- Communication link monitor: recent messages, pending deliveries
- Quick actions: advance time, trigger event, modify NPC, inject narrative

**Director-level controls:**
- Simulation tuning knobs (economic rates, threat frequency, faction aggression, enterprise risk modifier)
- Consequence template library (select and customize for player actions)
- Event scheduler (create timed, conditional, recurring events)
- Population tools (generate NPCs for a location, promote/demote tiers)
- Enterprise tools (create/edit enterprise templates, assign workers, override stages)
- Communication link tools (create/disrupt/destroy links, block messages)
- Retcon tools (snapshot management, rollback, state editing)

**Override controls:**
- Take control of any NPC (replace LLM with DM input)
- Modify any interaction outcome before or after commit
- Force-set any NPC attribute (attitude, location, knowledge, inventory)
- Force-advance or roll back enterprise stages
- Inject narrative text to any player or all players
- Pause/resume simulation subsystems independently

---

## 4. Player Experience

### 4.1 Battle Map

The primary tactical view. Canvas-based (Pixi.js), rendered in the browser.

- Load map images (PNG/JPEG) with configurable grid (square, hex, none)
- Token placement for PCs, NPCs, monsters, objects
- Fog of war: DM reveals/hides regions; players see only revealed areas
- Dynamic lighting (future): walls block line of sight
- Token visibility: players see only tokens in revealed areas
- Click token to interact (opens interaction panel for NPCs, character sheet for PCs)
- Initiative tracker sidebar
- Dice roller with results broadcast
- Distance measurement tool
- Drawing/annotation tools for DM

**NPC tokens on the map reflect simulation state:**
- If the blacksmith is at his shop (per his schedule and the current time), his token appears there
- If the party arrives at the tavern at 8pm, the NPCs who are scheduled to be there are present
- If an NPC flees during an encounter, their token moves to their destination

### 4.2 Player Journal & Knowledge (Phase 7+)

Each player has a personal journal showing the world through their character's eyes:
- NPCs they've met, filtered by knowledge level
- Locations they've visited
- Factions they've learned about
- Active enterprises the party is running (with status updates)
- Communication links and recent messages
- Quest hooks and notes
- Personal notes the player can add to any entry

Knowledge levels per NPC:
- **Level 0 (Unknown):** NPC doesn't appear in journal
- **Level 1 (Seen):** "A human guard" — race + occupation only
- **Level 2 (Acquainted):** Name, occupation, usual location, perceived attitude
- **Level 3 (Known):** + faction, key backstory fragments, notable items
- **Level 4 (Intimate):** + full backstory, true attitude, secrets

Knowledge is granted through:
- Successful interactions (conversation reveals name, investigation reveals faction)
- DM directive ("You now know that Halia works for the Zhentarim")
- Proximity events (being present when an NPC reveals something publicly)
- Communication link messages (the alchemist tells you about orc scouts)

### 4.3 Character Sheets (Native)

Character sheets are managed natively within LivingTable. No external dependency on D&D Beyond.

**One-time import:** Tool to parse D&D Beyond character export (JSON) and populate native character records.

**Native sheet includes:**
- Ability scores, skills, saving throws
- Class features, racial traits
- Spell slots and prepared spells
- Inventory (linked to the simulation's item system)
- Wealth (tracked as part of the economic model)
- HP, AC, conditions
- Background, personality traits

The character sheet feeds directly into the rules engine for automated adjudication.

---

## 5. Session Management

### 5.1 Session Recording

Every event during a session is logged:

```sql
session_log (
  id UUID PRIMARY KEY,
  world_id UUID,
  session_number INT,
  
  -- Timing
  tick_start BIGINT,
  tick_end BIGINT,
  real_time_start TIMESTAMPTZ,
  real_time_end TIMESTAMPTZ,
  
  -- Summary (generated post-session by LLM)
  narrative_summary TEXT,
  key_events JSONB,
  npcs_met JSONB,
  locations_visited JSONB,
  combat_encounters JSONB,
  loot_acquired JSONB,
  consequences_triggered JSONB,
  enterprises_updated JSONB,         -- enterprise stage completions, risk events, output
  messages_sent JSONB,               -- communication link messages during this session
  
  status TEXT DEFAULT 'active'
)
```

### 5.2 "Previously On..." Recaps

At session start, the system generates a narrative recap:

**Input to LLM:**
- Previous session's interaction log, key events, NPC encounters
- World state changes since last session (if time was advanced between sessions)
- Active quest hooks and unresolved consequences
- Enterprise status updates (stages completed, risks materialized, output produced)
- Communication link messages received between sessions
- Current party location and status

**Output:**
- A narrative prose recap written in dramatic third person
- "When last we left our heroes, they had just liberated the gold mine at Mountain's Toe, earning the gratitude of the people of Phandalin. But the Zhentarim have taken notice of the newfound wealth flowing into the town, and Halia Thornton's smile seems to have grown a bit too wide. Meanwhile, a sending stone message from Adabra at the tower warns of orc scouts on the road, and the giant rat training program has produced its first batch of combat-ready animals..."
- DM can edit before presenting to players

**Between-session world changes:**
If the DM advanced time between sessions, the recap also includes:
- Weather summary for the period
- Economic changes
- NPC movements and events
- Faction activity
- Enterprise progress (stage completions, output, risk events)
- Communication link messages (NPC-initiated warnings, trade order fulfillments)
- Any events that fired during the time skip

### 5.3 Snapshots & Retcon

**Auto-snapshots** are created:
- At the start of every session
- Before any major time advance (> 1 day)
- Before any consequence chain triggers
- When the DM requests one

**Snapshots capture:**
- Full world clock state
- All NPC states (location, attitude, inventory, condition)
- All economic states (shop inventories, cash, prices)
- Active effects and pending consequences
- Enterprise states (current stage, progress, worker assignments)
- Communication link states (uses remaining, pending messages, order status)
- Faction states
- PC states

**Retcon flow:**
1. DM selects a snapshot to restore
2. System shows diff: what would change
3. DM confirms
4. World state rolls back
5. Everything after the snapshot becomes an alternate timeline (kept in archive, not deleted)

---

## 6. Authentication & Multi-Campaign

LivingTable is accessible over the internet. Multiple campaigns run on the same server with full isolation.

### Users

Each person has a user account with username and password. Passwords are hashed with bcrypt. Sessions use JWT tokens (24-hour expiry, refresh on activity).

Users are created by:
- Self-registration (optionally with an invite code to auto-join a campaign)
- DM creating accounts for players

### Campaigns

A campaign is a named game room — the unit of isolation. Each campaign has:
- A DM (the creator)
- A list of authorized players
- Its own world state, maps, tokens, session data
- An **invite code** — a short 6-character alphanumeric string the DM shares with players

A user's role (DM or player) is per-campaign, not global. Someone could DM one campaign and play in another. This supports multiple campaigns on the same server (e.g., Mike's Icespire Peak campaign and the kids' campaigns with their friends).

### Auth Flow

1. Navigate to site → login page
2. New user: register with username + password (+ optional invite code)
3. Existing user: login
4. After login: campaign selection (list of campaigns they belong to)
5. DM can create a new campaign → gets invite code to share
6. Player enters invite code → joins campaign
7. Select campaign → enter the game
8. JWT stored in browser, included in all API and Socket.io requests

### Campaign Isolation

- Each campaign has its own Socket.io room
- Events in campaign A never reach clients in campaign B
- Session files are organized per-campaign
- Uploaded assets are per-campaign
- All socket event handlers verify the user is a member of the campaign they're operating on

---

## 7. System Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                          AWS EC2 Instance                             │
│                                                                       │
│  ┌──────────┐                                                        │
│  │  nginx   │ ← TLS termination (Let's Encrypt)                     │
│  │  :443    │ ← WebSocket upgrade handling                           │
│  └────┬─────┘                                                        │
│       │                                                               │
│  ┌────▼────────────────────────────────────────────────────────────┐ │
│  │              Application Server (Node.js + TypeScript)           │ │
│  │                                                                  │ │
│  │  ┌───────────┐ ┌───────────────┐ ┌──────────┐ ┌─────────────┐ │ │
│  │  │ Web + WS  │ │  Simulation   │ │  Rules   │ │   LLM       │ │ │
│  │  │ Server    │ │  Engine       │ │  Engine  │ │   Service   │ │ │
│  │  │           │ │               │ │          │ │             │ │ │
│  │  │ Express   │ │ Clock         │ │ D&D 5e   │ │ Ollama or   │ │ │
│  │  │ Socket.io │ │ NPC Sim       │ │ (first)  │ │ Claude API  │ │ │
│  │  │ REST API  │ │ Economy       │ │          │ │             │ │ │
│  │  │ Auth/JWT  │ │ Consequences  │ │ Pluggable│ │ Dialogue    │ │ │
│  │  │ Static    │ │ Weather       │ │ interface│ │ Generation  │ │ │
│  │  │ assets    │ │ Encounters    │ │          │ │ Recaps      │ │ │
│  │  │           │ │ Factions      │ │          │ │ Consequences│ │ │
│  │  │           │ │ Events        │ │          │ │             │ │ │
│  │  │           │ │ Enterprises   │ │          │ │             │ │ │
│  │  │           │ │ Comm Links    │ │          │ │             │ │ │
│  │  └─────┬─────┘ └───────┬───────┘ └────┬─────┘ └──────┬──────┘ │ │
│  │        │                │              │               │        │ │
│  │        └────────────────┴──────┬───────┴───────────────┘        │ │
│  │                                │                                 │ │
│  └────────────────────────────────┼─────────────────────────────────┘ │
│                                   │                                   │
│                       ┌───────────▼──────────┐   ┌────────────────┐  │
│                       │     PostgreSQL       │   │   S3 Bucket    │  │
│                       │                      │   │                │  │
│                       │ World state          │   │ Map images     │  │
│                       │ NPC census (~20K)    │   │ Token sprites  │  │
│                       │ Economy ledger       │   │ NPC portraits  │  │
│                       │ Weather data         │   │ Ruleset data   │  │
│                       │ Enterprises          │   │ Weather cache  │  │
│                       │ Comm links & msgs    │   │ Audio assets   │  │
│                       │ Interaction log      │   │                │  │
│                       │ Session recordings   │   │                │  │
│                       │ Snapshots            │   │                │  │
│                       │ Users & campaigns    │   │                │  │
│                       └──────────────────────┘   └────────────────┘  │
│                                                                       │
│  Browser Clients (Internet, HTTPS):                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                │
│  │ DM View  │ │ Player 1 │ │ Player 2 │ │ Player 3 │                │
│  │ (auth'd) │ │ (auth'd) │ │ (auth'd) │ │ (auth'd) │                │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘                │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 8. Database Schema

### Complete Table List

**Authentication:**
- `users` — user accounts (username, password hash, display name)
- `campaigns` — campaign definitions (name, DM, invite code, settings)
- `campaign_members` — user-to-campaign membership with role

**Core World:**
- `worlds` — campaign configuration, clock state, ruleset selection
- `world_snapshots` — point-in-time state captures for retcon

**Geography:**
- `locations` — hierarchical: region > settlement > district > building > room
- `location_connections` — roads, trade routes, portals between locations

**NPCs:**
- `npcs` — every individual in the world (5K-20K records)
- `npc_relationships` — NPC-to-NPC relationships (future, schema ready)
- `npc_pc_memory` — NPC's memory of interactions with each PC

**Economy:**
- `shops` — business entities with inventory and cash
- `inventory_items` — individual items belonging to NPCs, shops, PCs, locations
- `transactions` — economic transaction ledger
- `settlement_economy` — per-settlement economic aggregates
- `production_nodes` — mines, farms, workshops producing resources
- `trade_routes` — connections with shipment schedules and goods

**Enterprises:**
- `enterprises` — player-initiated projects (stages, workers, output, risks)
- `enterprise_workers` — NPC assignments to enterprises with schedule overrides
- `enterprise_log` — event history per enterprise (stage completions, risk events, output)
- `creatures` — livestock/trained animals with training state, health, bonding

**Communication:**
- `communication_links` — persistent channels between entities (sending stones, couriers, etc.)
- `communication_messages` — message log with delivery tracking
- `remote_trade_orders` — orders placed via communication links with fulfillment tracking

**Player Characters:**
- `player_characters` — native character sheets
- `pc_npc_knowledge` — what each PC knows about each NPC

**Simulation:**
- `world_events` — timed, conditional, recurring, emergent events
- `world_actions` — player/world actions that generate consequences
- `active_effects` — ongoing effects in the world
- `pending_consequences` — conditional consequences awaiting triggers
- `weather_data` — pre-loaded real-world weather data

**Factions:**
- `factions` — organizations with goals, resources, plans, influence

**Sessions:**
- `session_log` — per-session summary and metadata
- `interaction_log` — every player-NPC interaction with full detail

### Key Table Definitions

#### Enterprises

```sql
enterprises (
  id UUID PRIMARY KEY,
  world_id UUID REFERENCES worlds,
  name TEXT,
  description TEXT,
  enterprise_type TEXT,
  
  owner_type TEXT,
  owner_id UUID,
  location_id UUID REFERENCES locations,
  
  status TEXT DEFAULT 'planning',
  current_stage_index INT DEFAULT 0,
  stages JSONB,
  
  total_invested JSONB,
  ongoing_cost_per_day JSONB,
  operational_output JSONB,
  risk_factors JSONB,
  
  started_tick BIGINT,
  operational_since_tick BIGINT,
  last_updated_tick BIGINT,
  
  dm_notes TEXT,
  created_at TIMESTAMPTZ
)

enterprise_workers (
  id UUID PRIMARY KEY,
  enterprise_id UUID REFERENCES enterprises,
  npc_id UUID REFERENCES npcs,
  role TEXT,
  hours_per_day FLOAT,
  skill_relevant TEXT,
  skill_modifier INT,
  morale INT DEFAULT 50,
  assigned_tick BIGINT,
  schedule_override JSONB
)

enterprise_log (
  id UUID PRIMARY KEY,
  enterprise_id UUID REFERENCES enterprises,
  tick BIGINT,
  event_type TEXT,                     -- 'stage_complete', 'check_result', 'risk_event',
                                       -- 'worker_assigned', 'worker_quit', 'output_produced'
  description TEXT,
  details JSONB,
  session_number INT
)

creatures (
  id UUID PRIMARY KEY,
  world_id UUID REFERENCES worlds,
  name TEXT,
  creature_template_id TEXT,
  
  owner_type TEXT,
  owner_id UUID,
  current_location_id UUID REFERENCES locations,
  
  hit_points_current INT,
  hit_points_max INT,
  ability_scores JSONB,
  
  training_level TEXT,                 -- 'wild', 'captured', 'habituated',
                                       -- 'basic_trained', 'fully_trained'
  training_progress JSONB,
  temperament TEXT,
  bonded_to_npc_id UUID,
  
  is_alive BOOLEAN DEFAULT true,
  condition TEXT DEFAULT 'healthy',
  age_days INT,
  
  can_breed BOOLEAN DEFAULT false,
  last_bred_tick BIGINT,
  gestation_remaining_ticks INT,
  
  dm_notes TEXT,
  created_at_tick BIGINT
)
```

#### Communication Links

```sql
communication_links (
  id UUID PRIMARY KEY,
  world_id UUID REFERENCES worlds,
  name TEXT,
  link_type TEXT,
  
  endpoint_a_type TEXT,
  endpoint_a_id UUID,
  endpoint_a_location_id UUID REFERENCES locations,
  
  endpoint_b_type TEXT,
  endpoint_b_id UUID,
  endpoint_b_location_id UUID REFERENCES locations,
  
  direction TEXT DEFAULT 'bidirectional',
  max_words_per_message INT,
  message_types TEXT[],
  latency_ticks INT DEFAULT 0,
  reliability FLOAT DEFAULT 1.0,
  
  uses_per_day INT,
  uses_remaining_today INT,
  resets_at_hour INT DEFAULT 6,
  
  max_range_miles FLOAT,
  
  item_a_id UUID REFERENCES inventory_items,
  item_b_id UUID REFERENCES inventory_items,
  
  status TEXT DEFAULT 'active',
  disruption_reason TEXT,
  disrupted_until_tick BIGINT,
  
  established_tick BIGINT,
  established_by_id UUID,
  dm_notes TEXT,
  created_at TIMESTAMPTZ
)

communication_messages (
  id UUID PRIMARY KEY,
  link_id UUID REFERENCES communication_links,
  world_id UUID REFERENCES worlds,
  tick BIGINT,
  session_number INT,
  
  sender_type TEXT,
  sender_id UUID,
  receiver_type TEXT,
  receiver_id UUID,
  
  message_text TEXT,
  message_type TEXT,
  
  trade_order JSONB,
  
  delivered BOOLEAN DEFAULT false,
  delivered_tick BIGINT,
  blocked_by_dm BOOLEAN DEFAULT false,
  
  knowledge_granted JSONB,
  
  dm_notes TEXT
)

remote_trade_orders (
  id UUID PRIMARY KEY,
  world_id UUID REFERENCES worlds,
  communication_link_id UUID REFERENCES communication_links,
  message_id UUID REFERENCES communication_messages,
  
  buyer_type TEXT,
  buyer_id UUID,
  seller_type TEXT,
  seller_id UUID,
  
  items_ordered JSONB,
  agreed_price JSONB,
  
  status TEXT DEFAULT 'pending',
  production_complete_tick BIGINT,
  
  delivery_method TEXT,
  courier_npc_id UUID REFERENCES npcs,
  delivery_route_id UUID REFERENCES location_connections,
  estimated_delivery_tick BIGINT,
  actual_delivery_tick BIGINT,
  
  dm_notes TEXT,
  created_at_tick BIGINT
)
```

---

## 9. Simulation Tick Processing Order

When the world clock advances, subsystems tick in this order:

```
Time Advance Requested (e.g., 8 hours / 480 ticks)
  │
  ├── 1. Weather Update
  │   └── Look up weather state for the new time window
  │
  ├── 2. NPC Schedule Update
  │   └── All NPCs move to correct location/activity for new time
  │       (includes enterprise workers going to their enterprise locations)
  │
  ├── 3. Enterprise Ticks
  │   ├── Process each active enterprise:
  │   │   ├── Consume daily resources (proportional to time elapsed)
  │   │   ├── Advance stage progress (days elapsed toward stage completion)
  │   │   ├── Apply weather modifier to outdoor enterprise activities
  │   │   ├── Check for risk events (roll against probability × days elapsed)
  │   │   ├── If stage complete: run completion check, apply outcomes
  │   │   ├── If operational: produce output for elapsed time
  │   │   └── Update worker morale based on conditions
  │   └── Log any significant events
  │
  ├── 4. Economic Ticks
  │   ├── Production nodes output for elapsed time
  │   ├── Trade route shipments: advance in-transit, deliver arrived
  │   ├── Shop restocking from deliveries and crafting
  │   ├── NPC income/expenses (daily)
  │   ├── Settlement economy aggregation
  │   └── Dynamic price recalculation
  │
  ├── 5. Communication Link Processing
  │   ├── Reset daily uses for links where dawn has passed
  │   ├── Process NPC-initiated messages (if AI-driven NPCs have news to share)
  │   ├── Advance remote trade orders (production progress, courier travel)
  │   └── Deliver any in-transit messages that arrive during the window
  │
  ├── 6. Event System
  │   ├── Fire timed events whose trigger falls within the window
  │   ├── Evaluate conditional events
  │   └── Process recurring events
  │
  ├── 7. Consequence Engine
  │   ├── Apply ongoing effects for elapsed time
  │   ├── Evaluate pending consequences
  │   └── Cascade any newly triggered effects
  │
  ├── 8. Faction Advancement
  │   └── Advance faction plans proportional to elapsed time
  │
  ├── 9. Encounter Check (if party is traveling)
  │   └── Roll for encounters along the travel route
  │
  └── 10. Session Log
      └── Record summary of all significant events during the advance
```

---

## 10. Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | React + TypeScript | Component model for complex multi-panel UI |
| Map Renderer | Pixi.js | GPU-accelerated 2D canvas, handles large maps and many tokens |
| Real-time Sync | Socket.io | Mature WebSocket with rooms, reconnection |
| Backend | Node.js + Express + TypeScript | Shared types with frontend, async I/O for simulation |
| Auth | bcrypt + JWT | Password hashing, stateless session tokens |
| Database | PostgreSQL | Relational model for world state, JSONB for flexible fields |
| ORM | Prisma | Type-safe queries, migration management |
| Rules Engine | TypeScript module (pluggable) | Interface-based, config-driven rulesets |
| LLM | Ollama (local) or Claude API | Configurable per deployment |
| Weather Data | Open-Meteo API | Free historical weather data, pre-loaded |
| Asset Storage | S3 | Maps, tokens, portraits, audio |
| TLS | nginx + Let's Encrypt | HTTPS termination, WebSocket proxy |
| Deployment | EC2 + nginx + Docker | Containerized, existing AWS infrastructure |
| CI/CD | GitLab CI | Existing self-hosted GitLab at orca-ctr.com |
| Source Control | Git (GitLab) | Monorepo for client + server + shared types |

---

## 11. Phased Build Plan

### Phase 1: Battle Map MVP (Internet-Ready)
**Goal:** Playable battle map over the internet with auth. Replace D&D Beyond maps.

Deliverables:
- Authentication (register, login, JWT)
- Campaign management (create, join via invite code, multi-campaign isolation)
- React + Pixi.js map renderer with grid
- Token CRUD and real-time drag-move via Socket.io
- Fog of war (DM polygon reveal)
- Initiative tracker
- Dice roller
- DM/Player view separation
- Map image upload
- Session save/load to JSON (per campaign)
- HTTPS via nginx + Let's Encrypt
- Deployment configs (nginx, systemd, setup script)

Tech: In-memory state + JSON persistence, no database.
Deploy: EC2 t3.medium, nginx with TLS, internet-accessible.

### Phase 2: World Foundation
**Goal:** Persistent world with clock, NPCs, and weather.

Deliverables:
- PostgreSQL schema deployment (all core tables)
- Migrate auth from JSON to PostgreSQL
- World clock with advance controls
- NPC census with all three simulation tiers
- NPC schedule system (location tracking by time)
- NPC tokens on map reflect schedule/clock state
- Location hierarchy management
- Weather data ingestion (Open-Meteo historical API → weather_data table)
- Weather display in UI and effects on NPC schedules
- Snapshot/retcon system
- D&D Beyond character import tool
- Native character sheet storage
- Seed data: Phandalin and immediate surroundings from Dragon of Icespire Peak

### Phase 3: Economy + Enterprises + Communication
**Goal:** Shops, trade, production, player enterprises, and communication links.

Deliverables:
- Shop/business entity system
- Inventory management with real stock levels
- Buy/sell/trade UI for players
- Crafting production model
- Trade route system with shipment tracking
- Dynamic pricing engine
- Production nodes (mines, farms, workshops)
- Settlement economy dashboard for DM
- Transaction ledger
- Economic fast-forward for time skips
- Enterprise data model and CRUD
- Enterprise stage progression on clock advance
- Worker assignment and schedule modification
- Enterprise status panel in DM dashboard
- Communication link data model and CRUD
- Communication link message sending/receiving UI
- Remote trade order system
- Courier NPC assignment and delivery tracking

### Phase 4: Rules Engine + Adjudication
**Goal:** Automated interaction resolution.

Deliverables:
- Pluggable rules engine interface
- D&D 5e SRD implementation
- Player-NPC interaction pipeline (all 5 layers)
- Skill check automation (social, investigation, stealth, etc.)
- Enterprise stage completion checks (skill rolls by assigned NPCs)
- Risk event resolution for enterprises
- Creature stat blocks and training level effects
- DM approval queue for significant outcomes
- DM override/takeover controls
- Interaction log with full audit trail
- NPC auto-promote on repeated interaction

### Phase 5: LLM Integration
**Goal:** AI-driven NPC dialogue, world population, and narrative tools.

Deliverables:
- NPC population generator (seed a settlement with AI-generated NPCs)
- LLM-driven NPC dialogue (in-character, personality-aware, context-aware)
- DM real-time monitoring of all LLM dialogue
- DM takeover mid-conversation
- AI-generated NPC portraits (image generation API)
- AI-assisted enterprise template generation ("my players want to do X" → system suggests stage definitions)
- NPC-initiated messages through communication links (alchemist warns party about orcs)
- Enterprise narrative summaries ("Your rat training program update...")
- Consequence suggestion engine (LLM proposes consequences for novel actions)
- "Previously on..." session recap generator

### Phase 6: Consequence Engine + Encounters
**Goal:** Player actions reshape the world. Encounters are persistent.

Deliverables:
- Consequence engine (WorldEffect, active effects, pending consequences)
- Consequence templates for common actions (including enterprise and comm link templates)
- DM tuning knobs for simulation parameters
- Enterprise consequences (operational enterprise → regional effects)
- Communication link disruption consequences
- Enterprise failure cascades (disease outbreak → health risk to town)
- Encounter generation with persistent entities
- Encounter source tracking (bandit camp, orc settlement, monster lair)
- Encounter outcome → consequence chain integration
- Faction simulation with plans and influence
- Event system (timed, conditional, recurring)

### Phase 7: Knowledge Filtering + Session Tools
**Goal:** Players see the world through their character's eyes. Full session support.

Deliverables:
- Per-player knowledge filtering
- Player journal UI (NPCs, locations, factions, enterprises, comm links)
- Knowledge grants from communication link messages
- Session recording
- Session recap generation (including enterprise and comm link updates)
- Between-session world advancement summary

### Future (Post-MVP):
- NPC-to-NPC relationships and off-screen social dynamics
- Multi-party support with timeline reconciliation
- Dynamic lighting and line-of-sight
- Mobile-optimized player client
- Audio ambiance (weather sounds, tavern noise, combat music)
- D&D Beyond content import (adventure modules, monsters)
- Additional rulesets (Pathfinder 2e, homebrew)
- Public campaign sharing / spectator mode

---

## 12. Scale & Performance

| Metric | Target | Storage | Compute |
|--------|--------|---------|---------|
| Settlements | 50-100 | ~1MB | negligible |
| Total NPCs (individual) | 5,000-20,000 | 40-100MB | <500ms per 8hr advance |
| Tier 1 (Full) | 50-200 | ~2MB | ~10ms |
| Tier 2 (Standard) | 500-2,000 | ~10MB | ~20ms |
| Tier 3 (Light) | 3,000-18,000 | ~30-80MB | ~50ms |
| Shops/Businesses | 200-500 | ~5MB | ~10ms |
| Trade Routes | 20-50 | ~1MB | ~5ms |
| Active Effects | 100-1,000 | ~2MB | ~10ms |
| Factions | 10-30 | ~1MB | ~5ms |
| Production Nodes | 20-100 | ~1MB | ~5ms |
| Enterprises | 10-50 | ~2MB | ~10ms |
| Creatures (livestock) | 50-200 | ~1MB | ~5ms |
| Communication Links | 10-50 | ~1MB | ~5ms |
| Comm Messages | ~500/year | ~5MB | write + query |
| Remote Trade Orders | ~100/year | ~1MB | write + query |
| Weather Data | 365 days × 5 regions × 3 years | ~5MB | lookup only |
| Session Logs | ~50 sessions/year | ~10MB | write only |
| Interaction Logs | ~1,000/session | ~50MB/year | write + query |
| **Total Database** | | **~220MB** | |
| **8-hour time advance** | | | **< 1 second** |

AWS cost estimate:
- **Phase 1:** EC2 t3.medium ($30/mo) + S3 (~$1/mo) + domain ($1/mo) = ~$32/month
- **Phase 2-4:** EC2 t3.large ($60/mo) + RDS db.t3.micro ($15/mo) + S3 ($2/mo) = ~$77/month
- **Phase 5+ with Ollama:** + EC2 g4dn.xlarge on-demand (~$0.53/hr, 2-3 hrs/month = ~$1.50) OR Claude API (~$0.03 per NPC generation, $0.005 per dialogue exchange)

---

## 13. Repository Structure

```
livingtable/
├── packages/
│   ├── client/                    # React SPA
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── auth/          # Login, register, campaign select, lobby
│   │   │   │   ├── map/           # Pixi.js battle map renderer
│   │   │   │   ├── tokens/        # Token components
│   │   │   │   ├── fog/           # Fog of war
│   │   │   │   ├── initiative/    # Turn tracker
│   │   │   │   ├── dice/          # Dice roller
│   │   │   │   ├── interaction/   # NPC interaction panel
│   │   │   │   ├── shop/          # Buy/sell/trade UI
│   │   │   │   ├── enterprise/    # Enterprise status, management UI
│   │   │   │   ├── comms/         # Communication link message UI
│   │   │   │   ├── journal/       # Player knowledge browser
│   │   │   │   ├── character/     # Character sheet viewer/editor
│   │   │   │   ├── dm/            # DM dashboard and controls
│   │   │   │   │   ├── census/    # NPC census manager
│   │   │   │   │   ├── economy/   # Economy dashboard
│   │   │   │   │   ├── enterprise/# Enterprise admin tools
│   │   │   │   │   ├── comms/     # Communication link admin
│   │   │   │   │   ├── events/    # Event scheduler
│   │   │   │   │   ├── factions/  # Faction manager
│   │   │   │   │   ├── console/   # Interaction monitor + approval queue
│   │   │   │   │   └── tuning/    # Simulation parameter controls
│   │   │   │   └── common/        # Shared UI components
│   │   │   ├── hooks/             # WebSocket, game state, auth hooks
│   │   │   ├── state/             # Zustand stores (game, auth, UI)
│   │   │   └── types/
│   │   └── package.json
│   │
│   ├── server/                    # Express + Socket.io backend
│   │   ├── src/
│   │   │   ├── auth/              # User management, JWT, middleware
│   │   │   ├── routes/            # REST API routes
│   │   │   ├── socket/            # WebSocket event handlers
│   │   │   ├── simulation/        # Simulation engine
│   │   │   │   ├── clock.ts       # World clock manager
│   │   │   │   ├── npc-sim.ts     # NPC state machine and schedule
│   │   │   │   ├── economy.ts     # Economic simulation
│   │   │   │   ├── consequences.ts# Consequence engine
│   │   │   │   ├── weather.ts     # Weather lookup and effects
│   │   │   │   ├── encounters.ts  # Encounter generation
│   │   │   │   ├── factions.ts    # Faction plan advancement
│   │   │   │   ├── events.ts      # Event trigger system
│   │   │   │   ├── enterprises.ts # Enterprise stage processing
│   │   │   │   ├── comm-links.ts  # Communication link processing
│   │   │   │   └── time-advance.ts# Orchestrates all sims on clock advance
│   │   │   ├── rules/             # Pluggable rules engine
│   │   │   │   ├── interface.ts   # RulesEngine interface definition
│   │   │   │   ├── dnd5e/         # D&D 5e implementation
│   │   │   │   └── loader.ts      # Loads ruleset config files
│   │   │   ├── llm/               # LLM integration
│   │   │   │   ├── provider.ts    # Abstract LLM provider interface
│   │   │   │   ├── ollama.ts      # Ollama implementation
│   │   │   │   ├── claude.ts      # Claude API implementation
│   │   │   │   ├── dialogue.ts    # NPC dialogue generation
│   │   │   │   ├── generation.ts  # NPC population generation
│   │   │   │   ├── recap.ts       # Session recap generation
│   │   │   │   └── consequences.ts# Consequence suggestion
│   │   │   ├── services/          # Business logic
│   │   │   ├── db/                # Prisma schema, migrations, seeds
│   │   │   └── middleware/        # Auth, visibility filtering
│   │   └── package.json
│   │
│   └── shared/                    # Shared types and constants
│       ├── src/
│       │   ├── types/             # NPC, Location, Token, Currency, Auth, etc.
│       │   ├── constants/         # Knowledge levels, activities, etc.
│       │   └── calendar/          # Calendar systems (Harptos, Greyhawk, etc.)
│       └── package.json
│
├── rulesets/                      # Ruleset configuration data
│   ├── dnd5e/                     # D&D 5e SRD data
│   └── homebrew/                  # Custom overrides
│
├── seeds/                         # Initial world data
│   ├── sword-coast/               # Sword Coast locations, major NPCs
│   ├── phandalin/                 # Phandalin detail (Dragon of Icespire Peak)
│   └── weather/                   # Pre-loaded weather data
│
├── tools/                         # Utility scripts
│   ├── ddb-import/                # D&D Beyond character importer
│   ├── weather-ingest/            # Open-Meteo data download tool
│   └── seed-generator/            # AI-assisted seed data generation
│
├── deploy/                        # Deployment configs
│   ├── nginx.conf                 # nginx reverse proxy + TLS
│   ├── certbot-setup.sh           # Let's Encrypt provisioning
│   ├── setup.sh                   # Full EC2 setup script
│   └── systemd/
│       └── livingtable.service    # systemd unit file
│
├── docker-compose.yml             # Local dev: app + postgres
├── Dockerfile                     # Production build
├── .gitlab-ci.yml                 # CI/CD pipeline
├── LICENSE                        # AGPL-3.0
└── README.md
```

---

## 14. Future Features (Post-MVP)

- NPC-to-NPC relationships and off-screen social dynamics
- Multi-party support with timeline reconciliation
- Dynamic lighting and line-of-sight
- Mobile-optimized player client
- Audio ambiance (weather sounds, tavern noise, combat music)
- D&D Beyond content import (adventure modules, monsters)
- Additional rulesets (Pathfinder 2e, homebrew)
- Public campaign sharing / spectator mode
- Advanced enterprise types (spy networks, political campaigns, magical research)
- Communication link encryption/interception mechanics

---

*This document represents the complete pre-implementation design for LivingTable v4. All addenda and revisions have been consolidated into a single source of truth. Phase 1 (Internet-Ready Battle Map MVP) can begin immediately using the separate Phase 1 Implementation Plan. Each subsequent phase builds on the foundation without requiring architectural changes — the schema, interfaces, and module boundaries are designed to accommodate the full scope from day one.*
