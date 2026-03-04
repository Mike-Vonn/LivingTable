# LivingTable — Phase 1 Implementation Plan (Revised)
## Battle Map MVP: Detailed Task Spec for Claude Code

---

## Overview

This document is a step-by-step implementation plan for Phase 1 of LivingTable — a self-hosted, open-source virtual tabletop. Phase 1 delivers a working battle map that can be used for D&D sessions over the internet.

**What Phase 1 delivers:**
- A web-based battle map that loads map images and overlays a configurable grid
- Draggable tokens for PCs, NPCs, and monsters with real-time sync across browsers
- Fog of war that the DM reveals/hides and players see only revealed areas
- An initiative tracker sidebar
- A dice roller with results broadcast to all connected clients
- DM view (sees everything) vs Player view (sees only revealed areas and visible tokens)
- Session state that persists to a JSON file between server restarts
- Authentication with invite codes so only authorized players can join
- Campaign rooms so multiple campaigns can run on the same server
- HTTPS via nginx + Let's Encrypt for secure internet access

**What Phase 1 does NOT include:**
- No database (PostgreSQL comes in Phase 2)
- No NPC simulation, economy, or world clock
- No LLM integration
- No character sheets
- No dynamic lighting or line-of-sight

**Target deployment:** EC2 t3.medium, Node.js behind nginx with TLS termination, accessible over the internet via a domain name. Multiple campaigns (rooms) supported simultaneously.

---

## Tech Stack & Versions

```
Runtime:        Node.js 20 LTS
Language:       TypeScript 5.x (strict mode)
Package Manager: npm (workspaces for monorepo)
Frontend:       React 18, Pixi.js 7.x (via @pixi/react or raw), Zustand 4.x
Backend:        Express 4.x, Socket.io 4.x
Auth:           bcrypt (password hashing), jsonwebtoken (JWT session tokens)
Build:          Vite 5.x (frontend), tsx (backend dev), esbuild (backend prod)
Linting:        ESLint + Prettier
Testing:        Vitest (unit), Playwright (e2e, optional for Phase 1)
TLS:            nginx reverse proxy + certbot (Let's Encrypt)
```

---

## Repository Structure

Initialize as an npm workspace monorepo:

```
livingtable/
├── package.json                     # root workspace config
├── tsconfig.base.json               # shared TypeScript config
├── .gitignore
├── .gitlab-ci.yml                   # placeholder CI config
├── README.md
├── LICENSE                          # AGPL-3.0
│
├── packages/
│   ├── shared/                      # shared types and constants
│   │   ├── package.json             # name: @livingtable/shared
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── types/
│   │       │   ├── map.ts           # MapState, GridConfig, Viewport
│   │       │   ├── token.ts         # Token, TokenType, TokenVisibility
│   │       │   ├── fog.ts           # FogRegion, FogState
│   │       │   ├── initiative.ts    # InitiativeEntry, InitiativeState
│   │       │   ├── dice.ts          # DiceRoll, DiceResult
│   │       │   ├── session.ts       # SessionState (the complete game state)
│   │       │   ├── auth.ts          # User, Campaign, JoinRequest, AuthResponse
│   │       │   └── socket-events.ts # all Socket.io event names and payloads
│   │       └── constants/
│   │           ├── grid.ts          # default grid sizes, types
│   │           └── roles.ts         # 'dm' | 'player'
│   │
│   ├── server/                      # Express + Socket.io backend
│   │   ├── package.json             # name: @livingtable/server
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts             # entry point: create server, listen
│   │       ├── app.ts               # Express app setup, static serving
│   │       ├── auth/
│   │       │   ├── campaigns.ts     # campaign CRUD, invite code generation
│   │       │   ├── users.ts         # user registration, password hashing
│   │       │   ├── tokens.ts        # JWT creation and verification
│   │       │   └── middleware.ts    # Express auth middleware, Socket.io auth
│   │       ├── socket/
│   │       │   ├── index.ts         # Socket.io server setup, auth, room joining
│   │       │   ├── map-handlers.ts  # map load, viewport sync
│   │       │   ├── token-handlers.ts# token CRUD, move, visibility
│   │       │   ├── fog-handlers.ts  # fog reveal/hide
│   │       │   ├── initiative-handlers.ts
│   │       │   ├── dice-handlers.ts
│   │       │   └── session-handlers.ts  # save/load session state
│   │       ├── state/
│   │       │   ├── session-state.ts # in-memory session state manager
│   │       │   ├── campaign-store.ts# in-memory campaign and user store
│   │       │   └── persistence.ts   # save/load to JSON file
│   │       ├── uploads/
│   │       │   └── handler.ts       # map image upload via multer
│   │       └── config.ts            # port, data directory, JWT secret, etc.
│   │
│   └── client/                      # React SPA
│       ├── package.json             # name: @livingtable/client
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── main.tsx             # React entry point
│           ├── App.tsx              # top-level routing: auth screens vs game
│           ├── hooks/
│           │   ├── useSocket.ts     # Socket.io connection hook (with auth token)
│           │   ├── useGameState.ts  # subscribes to server state via socket
│           │   ├── useAuth.ts       # auth state: logged in user, campaign, JWT
│           │   └── useRole.ts       # DM vs Player role (derived from auth)
│           ├── state/
│           │   ├── gameStore.ts     # Zustand store for local game state
│           │   ├── authStore.ts     # Zustand store for auth state
│           │   └── uiStore.ts       # Zustand store for UI state (selected tool, etc.)
│           ├── components/
│           │   ├── auth/
│           │   │   ├── LoginPage.tsx        # login form
│           │   │   ├── CampaignSelect.tsx   # choose or create a campaign
│           │   │   ├── JoinCampaign.tsx     # enter invite code to join a campaign
│           │   │   └── CampaignLobby.tsx    # pre-game lobby showing connected players
│           │   ├── layout/
│           │   │   ├── AppLayout.tsx       # main layout: map + sidebar
│           │   │   ├── Sidebar.tsx         # right sidebar container
│           │   │   └── Toolbar.tsx         # top toolbar (tools, zoom, grid toggle)
│           │   ├── map/
│           │   │   ├── MapCanvas.tsx       # Pixi.js canvas container
│           │   │   ├── MapRenderer.ts      # Pixi.js application, map image sprite
│           │   │   ├── GridOverlay.ts      # Pixi.js grid rendering
│           │   │   ├── TokenLayer.ts       # Pixi.js token sprites, drag handling
│           │   │   ├── FogLayer.ts         # Pixi.js fog of war rendering
│           │   │   └── MapControls.tsx     # pan, zoom, measure controls
│           │   ├── tokens/
│           │   │   ├── TokenContextMenu.tsx # right-click menu on tokens
│           │   │   └── TokenEditor.tsx      # edit token properties panel
│           │   ├── fog/
│           │   │   └── FogTools.tsx         # DM fog reveal/hide polygon tools
│           │   ├── initiative/
│           │   │   └── InitiativeTracker.tsx # sidebar initiative list
│           │   ├── dice/
│           │   │   └── DiceRoller.tsx       # dice roller panel
│           │   ├── dm/
│           │   │   ├── DMControls.tsx       # DM-only control panel
│           │   │   ├── MapUpload.tsx        # upload map image
│           │   │   └── CampaignAdmin.tsx    # manage players, regenerate invite codes
│           │   └── common/
│           │       └── ConnectionStatus.tsx # socket connection indicator
│           └── utils/
│               ├── grid.ts                 # grid math (snap to grid, hex coords)
│               ├── geometry.ts             # polygon math for fog regions
│               └── api.ts                  # HTTP API client helpers (with JWT)
│
├── deploy/                          # deployment configs
│   ├── nginx.conf                   # nginx reverse proxy + TLS config
│   ├── certbot-setup.sh             # Let's Encrypt cert provisioning script
│   └── systemd/
│       └── livingtable.service      # systemd unit for running the server
│
├── data/                            # gitignored, runtime data
│   ├── sessions/                    # saved session JSON files (per campaign)
│   ├── uploads/                     # uploaded map images
│   └── auth/                        # campaigns.json, users.json
```

---

## Authentication & Campaign Model

### Design

Since there's no database in Phase 1, auth state is stored in JSON files under `data/auth/`. This is simple and sufficient for a handful of campaigns with a few players each. Phase 2 migrates this to PostgreSQL.

**Users:** Each person who connects has a user account with a username and password. Users are created by the server admin (DM) or self-register with an invite code.

**Campaigns:** A campaign is a named game room. Each campaign has a DM (the creator) and a list of authorized players. Each campaign has its own session state, map, tokens, fog, etc. A campaign has an **invite code** — a short alphanumeric string the DM shares with players so they can join.

**Roles:** A user's role (DM or player) is per-campaign, not global. Someone could be a DM in one campaign and a player in another (this supports the kids running their own campaigns).

**Auth flow:**
1. User navigates to the site → sees login page
2. New user: registers with username + password (+ invite code if joining an existing campaign)
3. Existing user: logs in with username + password
4. After login: sees campaign selection screen
   - DM can create a new campaign
   - Player enters an invite code to join a campaign they haven't joined yet
   - Both see a list of campaigns they belong to
5. Select a campaign → enters the campaign lobby
6. From lobby → enter the game (battle map)
7. JWT token stored in localStorage, included in all API requests and Socket.io auth

**JWT payload:**
```typescript
{
  userId: string;
  username: string;
  iat: number;
  exp: number;   // 24-hour expiry, refresh on activity
}
```

The JWT does NOT include campaign or role info — those are looked up server-side when the user joins a campaign room. This means a user can switch campaigns without re-authenticating.

### Data Structures

**File: `packages/shared/src/types/auth.ts`**
```typescript
export interface User {
  id: string;
  username: string;
  passwordHash: string;        // bcrypt hash, never sent to client
  displayName: string;
  createdAt: string;
}

// Client-safe user (no password hash)
export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
}

export interface Campaign {
  id: string;
  name: string;                 // "Dragon of Icespire Peak", "Kids' Campaign"
  dmUserId: string;             // the user who created and DMs this campaign
  playerUserIds: string[];      // authorized player user IDs
  inviteCode: string;           // short alphanumeric code for players to join
  createdAt: string;
  updatedAt: string;
}

export interface CampaignMembership {
  campaignId: string;
  campaignName: string;
  role: 'dm' | 'player';
}

export interface AuthResponse {
  token: string;                // JWT
  user: PublicUser;
}

export interface CampaignJoinResult {
  campaign: Campaign;
  role: 'dm' | 'player';
}
```

---

## Task Breakdown

Execute these tasks in order. Each task has acceptance criteria. Do not move to the next task until the current task's acceptance criteria are met.

### Task 0: Repository Scaffolding

**What to do:**
1. Initialize the git repo
2. Create the npm workspace root `package.json`:
   ```json
   {
     "name": "livingtable",
     "private": true,
     "workspaces": ["packages/*"],
     "scripts": {
       "dev": "npm run dev --workspace=@livingtable/server & npm run dev --workspace=@livingtable/client",
       "build": "npm run build --workspace=@livingtable/shared && npm run build --workspace=@livingtable/server && npm run build --workspace=@livingtable/client"
     }
   }
   ```
3. Create `tsconfig.base.json` with strict mode, ES2022 target, module NodeNext
4. Create all three packages (`shared`, `server`, `client`) with their `package.json` and `tsconfig.json` files
5. Install dependencies:
   - `shared`: typescript (dev)
   - `server`: express, socket.io, multer, cors, uuid, bcrypt, jsonwebtoken, typescript, tsx, @types/express, @types/multer, @types/cors, @types/uuid, @types/bcrypt, @types/jsonwebtoken (dev types)
   - `client`: react, react-dom, pixi.js, @pixi/react, socket.io-client, zustand, typescript, vite, @vitejs/plugin-react, @types/react, @types/react-dom
6. Create `.gitignore` (node_modules, dist, data/)
7. Create placeholder `README.md` and `LICENSE` (AGPL-3.0)
8. Create `deploy/` directory with placeholder nginx.conf and systemd service file
9. Verify `npm install` succeeds from the root
10. Create placeholder `src/index.ts` in each package that exports an empty object or logs a startup message

**Acceptance criteria:**
- `npm install` completes without errors from root
- `npx tsc --noEmit` in each package succeeds
- Git repo has initial commit with all scaffolding

---

### Task 1: Shared Types

**What to do:**
Define all shared TypeScript types that server and client will use. These are the data contracts.

**File: `packages/shared/src/types/token.ts`**
```typescript
export interface Token {
  id: string;
  name: string;
  type: 'pc' | 'npc' | 'monster' | 'object';
  x: number;                    // grid position (column)
  y: number;                    // grid position (row)
  width: number;                // grid cells wide (default 1)
  height: number;               // grid cells tall (default 1)
  imageUrl: string | null;      // token image URL, null = colored circle
  color: string;                // fallback color if no image: hex string
  label: string;                // short label displayed on token
  visible: boolean;             // DM can toggle visibility; hidden tokens not shown to players
  conditions: string[];         // status conditions displayed as icons
  hp?: { current: number; max: number };
  initiative?: number;
  notes: string;                // DM notes
  controlledBy: 'dm' | string;  // 'dm' or user ID who can move this token
}
```

**File: `packages/shared/src/types/map.ts`**
```typescript
export interface MapState {
  imageUrl: string | null;       // URL to the map image (relative path)
  imageWidth: number;            // natural pixel width of map image
  imageHeight: number;           // natural pixel height of map image
  grid: GridConfig;
}

export interface GridConfig {
  type: 'square' | 'hex-h' | 'hex-v' | 'none';
  cellSize: number;              // pixels per grid cell
  offsetX: number;               // pixel offset to align grid with map
  offsetY: number;
  visible: boolean;              // show/hide grid lines
  snapToGrid: boolean;           // tokens snap to grid positions
  color: string;                 // grid line color
  opacity: number;               // grid line opacity 0-1
}

export interface Viewport {
  x: number;                     // pan offset X
  y: number;                     // pan offset Y
  scale: number;                 // zoom level
}
```

**File: `packages/shared/src/types/fog.ts`**
```typescript
export interface FogState {
  enabled: boolean;
  regions: FogRegion[];          // revealed regions (everything else is fogged)
}

export interface FogRegion {
  id: string;
  // Polygon defined as array of [x, y] points in map pixel coordinates
  points: [number, number][];
  revealed: boolean;             // true = players can see this area
}
```

**File: `packages/shared/src/types/initiative.ts`**
```typescript
export interface InitiativeEntry {
  id: string;                    // matches a token ID
  name: string;
  initiative: number;
  isActive: boolean;             // whose turn it is
  isNPC: boolean;                // DM-controlled
  hp?: { current: number; max: number };
}

export interface InitiativeState {
  entries: InitiativeEntry[];
  round: number;
  active: boolean;               // is initiative tracking active
  currentIndex: number;          // index into sorted entries array
}
```

**File: `packages/shared/src/types/dice.ts`**
```typescript
export interface DiceRoll {
  id: string;
  odulerId: string;             // user ID of the roller
  rollerName: string;            // display name
  expression: string;            // "2d6+3", "1d20", "4d6kh3"
  results: number[];             // individual die results
  modifier: number;
  total: number;
  timestamp: number;
  isPrivate: boolean;            // DM-only roll (whisper)
}
```

**File: `packages/shared/src/types/session.ts`**
```typescript
import { MapState } from './map';
import { Token } from './token';
import { FogState } from './fog';
import { InitiativeState } from './initiative';
import { DiceRoll } from './dice';

export interface SessionState {
  id: string;
  campaignId: string;            // which campaign this session belongs to
  name: string;
  map: MapState;
  tokens: Token[];
  fog: FogState;
  initiative: InitiativeState;
  diceHistory: DiceRoll[];       // last N rolls
  createdAt: string;             // ISO timestamp
  updatedAt: string;
}
```

**File: `packages/shared/src/types/auth.ts`**
```typescript
export interface User {
  id: string;
  username: string;
  passwordHash: string;          // bcrypt hash, never sent to client
  displayName: string;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
}

export interface Campaign {
  id: string;
  name: string;
  dmUserId: string;
  playerUserIds: string[];
  inviteCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignMembership {
  campaignId: string;
  campaignName: string;
  role: 'dm' | 'player';
}

export interface AuthResponse {
  token: string;
  user: PublicUser;
}
```

**File: `packages/shared/src/types/socket-events.ts`**
```typescript
export const SOCKET_EVENTS = {
  // Connection & Auth
  JOIN_CAMPAIGN: 'campaign:join',       // client → server: { campaignId }
  CAMPAIGN_STATE: 'campaign:state',     // server → client: full SessionState
  CAMPAIGN_PLAYERS: 'campaign:players', // server → all: connected player list
  
  // Map
  MAP_LOAD: 'map:load',
  MAP_GRID_UPDATE: 'map:grid:update',
  
  // Tokens
  TOKEN_ADD: 'token:add',
  TOKEN_MOVE: 'token:move',
  TOKEN_UPDATE: 'token:update',
  TOKEN_REMOVE: 'token:remove',
  
  // Fog
  FOG_REVEAL: 'fog:reveal',
  FOG_HIDE: 'fog:hide',
  FOG_TOGGLE: 'fog:toggle',
  
  // Initiative
  INIT_ADD: 'init:add',
  INIT_REMOVE: 'init:remove',
  INIT_UPDATE: 'init:update',
  INIT_NEXT: 'init:next',
  INIT_SORT: 'init:sort',
  INIT_CLEAR: 'init:clear',
  INIT_TOGGLE: 'init:toggle',
  
  // Dice
  DICE_ROLL: 'dice:roll',
  
  // Session
  SESSION_SAVE: 'session:save',
  SESSION_LOAD: 'session:load',
  SESSION_LIST: 'session:list',
} as const;
```

**File: `packages/shared/src/constants/grid.ts`**
```typescript
import { GridConfig } from '../types/map';

export const DEFAULT_GRID: GridConfig = {
  type: 'square',
  cellSize: 70,
  offsetX: 0,
  offsetY: 0,
  visible: true,
  snapToGrid: true,
  color: '#000000',
  opacity: 0.2,
};
```

Export everything from `packages/shared/src/index.ts`.

**Acceptance criteria:**
- All types compile with no errors
- `packages/shared` builds successfully
- Types are importable from `@livingtable/shared` in both server and client packages

---

### Task 2: Authentication System

**What to do:**
Build the auth layer before anything else. All subsequent server features depend on knowing who is connected and what they're authorized to do.

**`packages/server/src/config.ts`:**
- PORT from env or default 3001
- DATA_DIR: `../../data` (relative to server root)
- CLIENT_DIST: path to built client dist folder
- JWT_SECRET: from env variable `LIVINGTABLE_JWT_SECRET`, or generate a random one on first startup and save to `data/auth/jwt-secret.txt`
- JWT_EXPIRY: `'24h'`
- CORS origins: from env or default `['http://localhost:5173']`

**`packages/server/src/state/campaign-store.ts`:**
- Class `CampaignStore` that manages users and campaigns in memory, persisted to JSON files
- On startup: loads `data/auth/users.json` and `data/auth/campaigns.json` (creates empty files if they don't exist)
- Methods:
  - `createUser(username, password, displayName): User` — hashes password with bcrypt, saves
  - `authenticateUser(username, password): User | null` — verifies password
  - `getUserById(id): User | null`
  - `createCampaign(name, dmUserId): Campaign` — generates a random 6-character invite code
  - `getCampaign(id): Campaign | null`
  - `getCampaignByInviteCode(code): Campaign | null`
  - `joinCampaign(userId, inviteCode): Campaign` — adds user to campaign's playerUserIds
  - `getUserCampaigns(userId): CampaignMembership[]` — returns all campaigns the user belongs to with their role
  - `regenerateInviteCode(campaignId, requestingUserId): string` — DM only, generates new code
  - `removePlayerFromCampaign(campaignId, userId, requestingUserId): void` — DM only
  - `persist(): void` — writes current state to JSON files
- All mutating methods call `persist()` automatically

**`packages/server/src/auth/tokens.ts`:**
- `generateToken(user: User): string` — creates JWT with userId and username
- `verifyToken(token: string): JWTPayload | null` — verifies and decodes JWT
- Uses the JWT_SECRET from config

**`packages/server/src/auth/middleware.ts`:**
- Express middleware `requireAuth`: extracts JWT from `Authorization: Bearer <token>` header, verifies, attaches user to `req.user`
- Socket.io middleware: extracts JWT from `socket.handshake.auth.token`, verifies, attaches user to `socket.data.user`. Rejects connection if invalid.

**REST API routes (in `packages/server/src/app.ts` or separate route files):**

`POST /api/auth/register`
- Body: `{ username, password, displayName, inviteCode? }`
- If inviteCode provided: registers user AND joins them to that campaign
- Returns: `{ token, user }` (AuthResponse)
- Validation: username must be unique, password min 6 chars

`POST /api/auth/login`
- Body: `{ username, password }`
- Returns: `{ token, user }` (AuthResponse)
- Returns 401 if invalid credentials

`GET /api/campaigns` (requires auth)
- Returns: `CampaignMembership[]` — campaigns the authenticated user belongs to

`POST /api/campaigns` (requires auth)
- Body: `{ name }`
- Creates a new campaign with the authenticated user as DM
- Returns: the created Campaign (with invite code)

`POST /api/campaigns/join` (requires auth)
- Body: `{ inviteCode }`
- Joins the authenticated user to the campaign as a player
- Returns: `{ campaign, role }`
- Returns 404 if invite code not found
- Returns 409 if user already in the campaign

`POST /api/campaigns/:id/invite-code` (requires auth, DM only)
- Regenerates the invite code for a campaign
- Returns: `{ inviteCode }`

`GET /api/campaigns/:id/players` (requires auth, campaign member only)
- Returns: `PublicUser[]` — list of players in the campaign

`DELETE /api/campaigns/:id/players/:userId` (requires auth, DM only)
- Removes a player from the campaign

**Socket.io auth integration (`packages/server/src/socket/index.ts`):**
- Socket.io server uses the auth middleware to verify JWT on connection
- After auth, client sends `JOIN_CAMPAIGN` with `{ campaignId }`
- Server verifies the user is a member of that campaign
- Server joins the socket to a Socket.io room named `campaign:{campaignId}`
- Server stores `socket.data.campaignId` and `socket.data.role` ('dm' or 'player')
- Server emits `CAMPAIGN_STATE` with the full SessionState for that campaign
- Server broadcasts `CAMPAIGN_PLAYERS` to the room with the updated connected player list
- All subsequent event handlers scope to the socket's campaign room

**Acceptance criteria:**
- A new user can register via `POST /api/auth/register`
- A user can log in and receive a JWT
- API requests without a valid JWT return 401
- A user can create a campaign and gets an invite code
- Another user can register with the invite code and is automatically joined to the campaign
- An existing user can join a campaign with an invite code via `POST /api/campaigns/join`
- Socket.io connections without a valid JWT are rejected
- Socket.io clients can join a campaign room and receive the session state
- DM can regenerate invite codes
- DM can remove players from a campaign
- Campaign and user data persist to JSON files and survive server restart

---

### Task 3: Server Foundation

**What to do:**
Build the Express + Socket.io server that manages game state and broadcasts events. This task builds on the auth system from Task 2.

**`packages/server/src/state/session-state.ts`:**
- Class `SessionStateManager` that holds the current `SessionState` in memory
- **One instance per campaign** — the server maintains a `Map<campaignId, SessionStateManager>`
- Methods for every mutation: `addToken`, `moveToken`, `updateToken`, `removeToken`, `revealFog`, `hideFog`, `addInitiative`, `nextTurn`, `rollDice`, `loadMap`, `updateGrid`
- Each mutation method returns the updated state (or the relevant delta)
- Constructor creates a default empty session state with the campaignId

**`packages/server/src/state/persistence.ts`:**
- `saveSession(state: SessionState, dir: string): Promise<void>` — writes `{campaignId}/{sessionName}.json` to `data/sessions/`
- `loadSession(campaignId: string, sessionId: string, dir: string): Promise<SessionState>`
- `listSessions(campaignId: string, dir: string): Promise<string[]>` — lists sessions for a campaign
- Ensure data directories exist on startup (mkdirp)
- Session files are organized by campaign: `data/sessions/{campaignId}/`

**`packages/server/src/uploads/handler.ts`:**
- Express route `POST /api/upload/map` (requires auth, DM only)
- Accepts a single image file (PNG, JPEG, WEBP), max 50MB
- Saves to `data/uploads/{campaignId}/` with a UUID filename preserving extension
- Returns `{ url: '/uploads/{campaignId}/{filename}' }`

**Socket.io event handlers:**
All handlers now scope to the socket's campaign room (`socket.data.campaignId`). Events are broadcast to `campaign:{campaignId}` room, not globally.

All handler files follow this pattern:
- Validate event payload
- Check permissions: use `socket.data.role` to determine if user is DM or player
- Call the appropriate SessionStateManager method for this campaign
- Broadcast the event to all other clients in the campaign room

Implement all handler files:
- `token-handlers.ts` — TOKEN_ADD, TOKEN_MOVE, TOKEN_UPDATE, TOKEN_REMOVE
  - Only DM can add/remove tokens
  - Players can only move tokens where `controlledBy` matches their user ID
- `map-handlers.ts` — MAP_LOAD, MAP_GRID_UPDATE (DM only)
- `fog-handlers.ts` — FOG_REVEAL, FOG_HIDE, FOG_TOGGLE (DM only)
- `initiative-handlers.ts` — all INIT_* events (DM controls most; players can add their own)
- `dice-handlers.ts` — DICE_ROLL
  - If `isPrivate`, only emit to sockets in the room with role 'dm'
  - Include `rollerId` and `rollerName` from `socket.data.user`
- `session-handlers.ts` — SESSION_SAVE, SESSION_LOAD, SESSION_LIST (DM only)

**`packages/server/src/app.ts`:**
- Express app with:
  - CORS middleware (configured origins from env)
  - JSON body parser
  - Auth routes (register, login)
  - Campaign routes (CRUD, join, invite code) — all behind `requireAuth`
  - Upload route — behind `requireAuth` + DM check
  - Static file serving for uploads (`/uploads` → `data/uploads/`)
  - Static file serving for client dist in production (`/` → client dist folder)
  - Health check: `GET /api/health` → `{ status: 'ok' }`

**`packages/server/src/index.ts`:**
- Create HTTP server from Express app
- Attach Socket.io with auth middleware
- Register all socket handlers
- Listen on configured port
- Log startup message with URL

**Acceptance criteria:**
- Server starts with `npm run dev`
- `GET /api/health` returns `{ status: 'ok' }`
- An authenticated Socket.io client can connect, join a campaign room, and receive CAMPAIGN_STATE
- Map image upload works via `POST /api/upload/map` (requires auth)
- Session save/load round-trips correctly to JSON files, organized by campaign
- Multiple campaigns can run simultaneously with independent state
- Events in one campaign room do not leak to other campaign rooms

---

### Task 4: Client Auth Flow

**What to do:**
Implement the client-side authentication, campaign selection, and Socket.io connection with JWT.

**`packages/client/src/state/authStore.ts`:**
- Zustand store holding:
  - `token: string | null` — JWT, persisted to localStorage
  - `user: PublicUser | null`
  - `currentCampaign: CampaignMembership | null`
  - `campaigns: CampaignMembership[]`
- Actions: `login`, `register`, `logout`, `selectCampaign`, `fetchCampaigns`
- On app startup: if token exists in localStorage, verify it's not expired, set user state

**`packages/client/src/utils/api.ts`:**
- HTTP client helper that automatically includes `Authorization: Bearer <token>` header
- Methods: `get(url)`, `post(url, body)`, `delete(url)`
- On 401 response: clear auth store, redirect to login

**`packages/client/src/hooks/useSocket.ts`:**
- Creates Socket.io connection with `auth: { token }` in handshake
- Only connects when user has a valid token AND has selected a campaign
- On connect: emits `JOIN_CAMPAIGN` with `{ campaignId }`
- On `CAMPAIGN_STATE`: updates the game store
- On `CAMPAIGN_PLAYERS`: updates connected player list
- On disconnect: shows reconnecting state
- Reconnects automatically with the same auth token

**`packages/client/src/hooks/useAuth.ts`:**
- Convenience hook that reads from authStore
- Provides: `isLoggedIn`, `user`, `currentCampaign`, `role`, `isLoading`
- `role` is derived from `currentCampaign.role`

**`packages/client/src/components/auth/LoginPage.tsx`:**
- Two tabs: "Login" and "Register"
- Login form: username, password → calls `POST /api/auth/login`
- Register form: username, password, display name, optional invite code → calls `POST /api/auth/register`
- On success: stores token, navigates to campaign selection
- On error: shows error message
- Clean, simple design

**`packages/client/src/components/auth/CampaignSelect.tsx`:**
- Shows after login if no campaign is selected
- Lists campaigns the user belongs to, with role badge (DM / Player)
- "Create Campaign" button (opens inline form: campaign name → `POST /api/campaigns`)
- "Join Campaign" button (opens inline form: invite code → `POST /api/campaigns/join`)
- Click a campaign to select it and enter the game

**`packages/client/src/components/auth/CampaignLobby.tsx`:**
- Optional: shown briefly after selecting a campaign, before entering the game
- Shows campaign name, connected players, DM status
- DM sees invite code with copy button, and option to regenerate
- "Enter Game" button → transitions to the battle map view
- Can be skipped (go straight to game) if preferred for simplicity

**`packages/client/src/components/dm/CampaignAdmin.tsx`:**
- DM-only panel accessible from the sidebar or settings
- Shows current invite code with copy button
- Regenerate invite code button
- List of campaign members with option to remove players
- Campaign name (editable?)

**`packages/client/src/App.tsx`:**
- Routing logic:
  - If not logged in → show LoginPage
  - If logged in but no campaign selected → show CampaignSelect
  - If logged in and campaign selected and socket connected → show AppLayout (game)
  - If socket disconnected → show reconnecting overlay on top of game

**`packages/client/vite.config.ts`:**
- React plugin
- Proxy `/api`, `/socket.io`, and `/uploads` to `http://localhost:3001` in dev mode

**Acceptance criteria:**
- New user can register via the web UI
- Existing user can log in
- After login, user sees their campaigns
- DM can create a new campaign and sees the invite code
- A player can join a campaign using an invite code (during registration or after login)
- Selecting a campaign connects to the Socket.io server with JWT auth
- Unauthorized socket connections are rejected
- After joining a campaign, the game state loads
- Refreshing the page re-authenticates using the stored JWT (no re-login needed)
- DM can share the invite code; it's easily copy-pasteable
- DM can regenerate the invite code from within the game
- Logging out clears the token and returns to login page

---

### Task 5: Map Rendering

**What to do:**
Implement the Pixi.js map canvas that displays a map image with a grid overlay.

**`packages/client/src/components/map/MapRenderer.ts`:**
- Class that manages a Pixi.js Application
- Initializes with a container DOM element
- Manages layers (bottom to top):
  1. Map image sprite (background)
  2. Grid overlay (lines)
  3. Token layer (sprites)
  4. Fog of war layer (semi-transparent overlay)
  5. Measurement/drawing layer (top)
- Handles pan (middle-mouse drag or spacebar+drag) and zoom (scroll wheel)
- Viewport state (pan offset, zoom level) is local to each client
- Exposes methods: `loadMap(url, width, height)`, `updateGrid(config)`, `resize()`

**`packages/client/src/components/map/GridOverlay.ts`:**
- Pixi.js Graphics object that draws grid lines
- Square grid: horizontal + vertical lines at cellSize intervals
- Hex grid (horizontal): offset hex pattern (implement but lower priority)
- Respects grid config: color, opacity, offset, visibility
- Redraws when grid config changes

**`packages/client/src/components/map/MapCanvas.tsx`:**
- React component that creates the DOM container and initializes MapRenderer
- Handles resize events (ResizeObserver on container)
- Bridges React state (from Zustand) to Pixi.js (imperative calls)
- When map state changes in store → calls MapRenderer methods

**`packages/client/src/components/dm/MapUpload.tsx`:**
- DM-only component: file input for map image
- Uploads to `/api/upload/map` with JWT in the Authorization header
- Emits MAP_LOAD event with the image URL
- Grid configuration controls: cell size slider, offset X/Y, type selector

**Acceptance criteria:**
- DM can upload a map image and it displays in the canvas
- Grid overlay appears on top of the map image
- Grid cell size, offset, and color can be adjusted and the grid updates live
- Pan (middle mouse or space+drag) and zoom (scroll wheel) work smoothly
- Grid can be toggled visible/hidden
- When DM loads a map, all connected player clients also see it (including remote players)
- Map and grid state persists when a new client connects (CAMPAIGN_STATE sync)

---

### Task 6: Token System

**What to do:**
Implement tokens that can be placed on the map and dragged in real-time.

**`packages/client/src/components/map/TokenLayer.ts`:**
- Manages a Pixi.js Container of token sprites
- Each token is a Pixi.js Container with:
  - A colored circle (or loaded image sprite) sized to the grid cell
  - A text label centered on the token
  - An optional HP bar below the token
  - Condition icons (small colored dots) above the token
- Tokens snap to grid when `snapToGrid` is enabled
- DM sees all tokens. Players see only tokens with `visible: true`
- Supports drag: pointerdown → start drag, pointermove → update, pointerup → emit TOKEN_MOVE
- Permission check: players can only drag tokens where `controlledBy` matches their user ID

**`packages/client/src/components/tokens/TokenContextMenu.tsx`:**
- Right-click on a token opens a context menu:
  - Edit (opens TokenEditor)
  - Toggle Visible (DM only)
  - Add to Initiative
  - Remove (DM only)
  - Set HP
  - Add Condition

**`packages/client/src/components/tokens/TokenEditor.tsx`:**
- Panel/modal for editing token properties:
  - Name, label, type (PC/NPC/Monster/Object)
  - Color picker
  - Image URL (or upload)
  - Size (1x1, 2x2, 3x3)
  - HP current/max
  - Notes
  - Controlled by: dropdown with "DM" and connected player names/IDs
- DM can edit any token. Players can only edit tokens they control.
- Changes emit TOKEN_UPDATE

**DM Token Add Workflow:**
- DM selects "Add Token" tool from toolbar
- Clicks on map → quick-add dialog: name, type, color/image
- Token appears at clicked grid position
- Emits TOKEN_ADD

**Acceptance criteria:**
- DM can add tokens to the map at grid positions
- Tokens display as colored circles with labels
- Tokens can be dragged to new grid positions with snap-to-grid
- Token movement syncs in real-time to all clients (including remote)
- Players can only drag tokens assigned to them (matched by user ID)
- Players cannot see tokens marked as `visible: false`
- DM can toggle token visibility
- Token right-click context menu works
- Token properties can be edited
- HP bar displays when HP is set

---

### Task 7: Fog of War

**What to do:**
Implement fog of war where the DM reveals areas for players.

**Approach:** Full-screen semi-opaque black overlay. Revealed regions are "holes" cut using polygon masks.

**`packages/client/src/components/map/FogLayer.ts`:**
- Pixi.js implementation:
  - Full-coverage dark rectangle (black, alpha ~0.85)
  - Revealed FogRegions cut as holes
  - Use `graphics.beginHole()` / `endHole()` or render texture approach
- DM view: fog at reduced opacity (alpha ~0.3) — DM sees through it
- Player view: fog fully opaque — hidden areas completely black

**`packages/client/src/components/fog/FogTools.tsx`:**
- DM-only toolbar:
  - "Reveal" tool: click to place polygon vertices, double-click to close → emits FOG_REVEAL
  - "Hide" tool: click a revealed region to re-fog → emits FOG_HIDE
  - "Reveal Rectangle" shortcut: drag to reveal rectangular area
  - "Reveal All" / "Hide All" buttons
  - Toggle fog on/off

**`packages/client/src/utils/geometry.ts`:**
- `isPointInPolygon(point, polygon)` — ray casting
- `polygonFromRect(x, y, width, height)` — rectangle helper
- `snapPolygonToGrid(polygon, gridConfig)` — snap vertices to grid

**Acceptance criteria:**
- Map starts fully fogged for players
- DM can draw polygon regions to reveal areas
- Reveals appear immediately for all clients (local and remote)
- DM can re-hide previously revealed areas
- DM sees fog at reduced opacity
- Players see fog as fully opaque
- Fog state persists in session state
- Tokens in fogged areas are not visible to players

---

### Task 8: Initiative Tracker

**What to do:**
Sidebar initiative tracker for combat.

**`packages/client/src/components/initiative/InitiativeTracker.tsx`:**
- Sidebar panel with ordered combatant list
- Each entry: name, initiative value, HP bar, active turn indicator
- Sorted by initiative (highest first)
- Current turn highlighted
- DM controls: Add, Next Turn, Sort, Clear, drag to reorder, remove entries
- Player view: read-only, sees order and current turn
- Round counter at top: "Round 1", "Round 2", etc.
- "Add to Initiative" from token context menu pre-fills name

**Acceptance criteria:**
- DM can add/remove initiative entries
- Entries sort by initiative value
- DM advances turns; active indicator moves, rounds increment on wrap
- All clients see initiative state in real-time
- Players see but cannot modify initiative

---

### Task 9: Dice Roller

**What to do:**
Dice roller supporting standard RPG notation with broadcast results.

**`packages/client/src/components/dice/DiceRoller.tsx`:**
- Sidebar panel with:
  - Input field for dice notation: `1d20`, `2d6+3`, `4d6kh3`, `1d20+5`
  - Quick buttons: d4, d6, d8, d10, d12, d20, d100
  - "Roll" button / Enter to execute
  - "Private Roll" checkbox (DM only)
- Results display: roller name, expression, individual dice, total, timestamp
- History: scrollable, last ~50 rolls
- Private rolls shown only in DM's history

**Dice parser (in shared or client utils):**
- Parse: `NdS`, `NdS+M`, `NdS-M`, `NdSkhN` (keep highest), `NdSklN` (keep lowest)
- Generate random results, calculate total

**Acceptance criteria:**
- `1d20+5` rolls a d20 and adds 5
- Results broadcast to all clients in the campaign room
- DM private rolls only appear in DM's view
- Quick-roll buttons work
- `4d6kh3` correctly keeps highest 3 of 4 dice
- History shows last ~50 rolls with roller name

---

### Task 10: Session Persistence

**What to do:**
Save/load game state between sessions, per campaign.

**DM Controls:**
- "Save Session" button → saves to `data/sessions/{campaignId}/{name}.json`
- "Load Session" button → list of saved sessions for this campaign, click to load
- "New Session" button → fresh empty session
- Auto-save every 5 minutes to `data/sessions/{campaignId}/autosave.json`

**Server:**
- SESSION_SAVE: serialize, write to campaign-specific directory
- SESSION_LOAD: read, deserialize, replace state, broadcast CAMPAIGN_STATE
- SESSION_LIST: return available sessions for the campaign
- Auto-save timer per active campaign

**Acceptance criteria:**
- DM can save with a name
- DM can list and load saved sessions
- Loading replaces state for all connected clients
- All state (map, tokens, fog, initiative) round-trips through save/load
- Auto-save runs every 5 minutes
- Sessions are isolated per campaign (campaign A's sessions not visible in campaign B)

---

### Task 11: Polish, View Separation & Deployment Config

**What to do:**
Finalize DM/Player separation, add keyboard shortcuts, and create deployment configs.

**DM View:**
- Sees all tokens (hidden ones at reduced opacity)
- Sees fog at reduced opacity
- Has access to: fog tools, token add, initiative controls, session management, map upload, grid config, campaign admin
- "DM" badge in UI

**Player View:**
- Sees only `visible: true` tokens
- Fog fully opaque
- Cannot access DM tools
- Can move their assigned tokens
- Can roll dice
- Initiative tracker read-only
- Player name badge in UI

**Keyboard shortcuts:**
- `Space + drag` = pan
- `Scroll` = zoom
- `Escape` = deselect / close modal
- `Delete` = remove selected token (DM only)
- `G` = toggle grid

**Connection status:** Green/red indicator showing socket connection state.

**`deploy/nginx.conf`:**
```nginx
server {
    listen 80;
    server_name livingtable.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name livingtable.example.com;

    ssl_certificate /etc/letsencrypt/live/livingtable.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/livingtable.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;   # 24 hours for long-lived websocket
    }

    # API and uploads
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50M;   # for map uploads
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    # Client SPA
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**`deploy/certbot-setup.sh`:**
```bash
#!/bin/bash
# Run this once on the EC2 instance to provision TLS certs
# Replace livingtable.example.com with your actual domain

DOMAIN="livingtable.example.com"
EMAIL="admin@example.com"

sudo apt update
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive

# Auto-renewal is set up by certbot automatically via systemd timer
echo "TLS certificate provisioned for $DOMAIN"
echo "Auto-renewal is enabled via systemd timer"
```

**`deploy/systemd/livingtable.service`:**
```ini
[Unit]
Description=LivingTable VTT Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/livingtable
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=LIVINGTABLE_JWT_SECRET=CHANGE_ME_TO_A_RANDOM_STRING
ExecStart=/usr/bin/node packages/server/dist/index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**`deploy/setup.sh`:** (optional convenience script)
```bash
#!/bin/bash
# Full deployment setup on a fresh EC2 Ubuntu instance
set -e

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx

# Clone and build
cd /home/ubuntu
git clone <REPO_URL> livingtable
cd livingtable
npm install
npm run build

# Set up systemd service
sudo cp deploy/systemd/livingtable.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable livingtable
sudo systemctl start livingtable

# Set up nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/livingtable
sudo ln -sf /etc/nginx/sites-available/livingtable /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

# TLS (run after DNS is pointed to this server)
# sudo bash deploy/certbot-setup.sh

echo "LivingTable deployed. Set up DNS and run certbot-setup.sh for TLS."
```

**Acceptance criteria:**
- DM and Player views are demonstrably different
- A full combat encounter can be run over the internet:
  - DM on one network, player(s) on different network(s)
  - Load map, place tokens, reveal fog, track initiative, roll dice, move tokens
- Multiple campaigns can run simultaneously with separate state
- Players in campaign A cannot see or affect campaign B
- Multiple browser windows can connect as different users with different roles
- State stays in sync across all clients regardless of network
- nginx config handles WebSocket upgrade correctly
- HTTPS works with Let's Encrypt certs
- Server runs as a systemd service and auto-restarts on crash
- Invite code flow works: DM shares code → player registers/joins → sees the campaign

---

## Deployment Checklist (for after Phase 1 code is complete)

**Local development:**
```bash
npm install
npm run dev         # starts server (3001) + client dev server (5173)
# Open http://localhost:5173
```

**Production deployment on EC2:**
1. Launch EC2 t3.medium with Ubuntu 24.04
2. Point DNS (e.g., `vtt.yourdomain.com`) to the instance's public IP
3. SSH in, run `deploy/setup.sh`
4. Edit `/etc/systemd/system/livingtable.service` — set `LIVINGTABLE_JWT_SECRET` to a random 64-char string
5. Edit `/etc/nginx/sites-available/livingtable` — replace `livingtable.example.com` with your domain
6. Run `sudo bash deploy/certbot-setup.sh` (after DNS propagates)
7. `sudo systemctl restart livingtable nginx`
8. Navigate to `https://vtt.yourdomain.com` — register as DM, create campaign, share invite code

**Docker (stretch goal):**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install && npm run build
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "packages/server/dist/index.js"]
```

---

## Notes for Claude Code

- Build each task fully before moving to the next. Run `npx tsc --noEmit` frequently.
- Prefer explicit types over `any`. Use shared types from `@livingtable/shared` everywhere.
- **Auth is non-negotiable.** Every API route (except register, login, and health) must go through `requireAuth` middleware. Every socket connection must present a valid JWT. Every socket event handler must verify the user is a member of the campaign they're operating on.
- **Campaign isolation is critical.** State for campaign A must never leak to campaign B. Socket.io rooms enforce this: all broadcasts go to `campaign:{campaignId}`, never globally.
- The Pixi.js rendering code is imperative, not React-declarative. React components are thin wrappers that bridge Zustand state to Pixi method calls. Do not try to make Pixi.js reactive.
- Socket.io events are the source of truth for multiplayer state. Client emits event → server validates and broadcasts → client applies change on receiving broadcast. Do not apply optimistically.
- For fog of war polygons in Pixi.js: draw a full-screen black Graphics, then cut revealed regions as holes: `graphics.beginFill(0x000000, alpha); graphics.drawRect(0, 0, w, h); for each region: graphics.beginHole(); graphics.drawPolygon(points); graphics.endHole(); graphics.endFill();`
- Keep the UI simple and functional. No design system needed in Phase 1. Inline styles or a single CSS file.
- Test with multiple browser windows: register two users, create a campaign as one (DM), join as the other (player) using the invite code. Verify state sync, permission enforcement, and view separation.
- The JWT secret MUST come from environment variable in production, never hardcoded. For local dev, auto-generating and saving to a file is fine.
- Password hashing: use bcrypt with salt rounds = 10. Never store or transmit plaintext passwords.
- Invite codes should be 6 alphanumeric characters (uppercase), easy to read aloud and type. Exclude ambiguous characters (0/O, 1/I/L).
