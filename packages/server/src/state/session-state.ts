import { v4 as uuidv4 } from 'uuid';
import type {
  SessionState,
  MapState,
  GridConfig,
  Token,
  FogRegion,
  InitiativeEntry,
  DiceRoll,
} from '@livingtable/shared';
import { DEFAULT_GRID } from '@livingtable/shared';

const MAX_DICE_HISTORY = 50;

function createDefaultSession(campaignId: string): SessionState {
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    campaignId,
    name: 'Default Session',
    map: {
      imageUrl: null,
      imageWidth: 0,
      imageHeight: 0,
      grid: { ...DEFAULT_GRID },
    },
    tokens: [],
    fog: { enabled: false, regions: [] },
    initiative: { entries: [], round: 1, active: false, currentIndex: -1 },
    diceHistory: [],
    createdAt: now,
    updatedAt: now,
  };
}

export class SessionStateManager {
  private state: SessionState;

  constructor(campaignId: string, existingState?: SessionState) {
    this.state = existingState ?? createDefaultSession(campaignId);
  }

  getState(): SessionState {
    return this.state;
  }

  private touch(): void {
    this.state.updatedAt = new Date().toISOString();
  }

  // ---- Map ----

  loadMap(imageUrl: string, imageWidth: number, imageHeight: number): MapState {
    this.state.map.imageUrl = imageUrl;
    this.state.map.imageWidth = imageWidth;
    this.state.map.imageHeight = imageHeight;
    this.touch();
    return this.state.map;
  }

  updateGrid(grid: Partial<GridConfig>): GridConfig {
    Object.assign(this.state.map.grid, grid);
    this.touch();
    return this.state.map.grid;
  }

  // ---- Tokens ----

  addToken(token: Token): Token {
    this.state.tokens.push(token);
    this.touch();
    return token;
  }

  moveToken(tokenId: string, x: number, y: number): Token | null {
    const token = this.state.tokens.find((t) => t.id === tokenId);
    if (!token) return null;
    token.x = x;
    token.y = y;
    this.touch();
    return token;
  }

  updateToken(tokenId: string, updates: Partial<Token>): Token | null {
    const token = this.state.tokens.find((t) => t.id === tokenId);
    if (!token) return null;
    const { id: _id, ...safeUpdates } = updates;
    Object.assign(token, safeUpdates);
    this.touch();
    return token;
  }

  removeToken(tokenId: string): boolean {
    const idx = this.state.tokens.findIndex((t) => t.id === tokenId);
    if (idx === -1) return false;
    this.state.tokens.splice(idx, 1);
    this.touch();
    return true;
  }

  getToken(tokenId: string): Token | null {
    return this.state.tokens.find((t) => t.id === tokenId) ?? null;
  }

  // ---- Fog ----

  revealFog(region: FogRegion): FogRegion {
    region.revealed = true;
    this.state.fog.regions.push(region);
    this.touch();
    return region;
  }

  hideFog(regionId: string): boolean {
    const idx = this.state.fog.regions.findIndex((r) => r.id === regionId);
    if (idx === -1) return false;
    this.state.fog.regions.splice(idx, 1);
    this.touch();
    return true;
  }

  toggleFog(enabled: boolean): boolean {
    this.state.fog.enabled = enabled;
    this.touch();
    return enabled;
  }

  // ---- Initiative ----

  addInitiative(entry: InitiativeEntry): InitiativeEntry {
    this.state.initiative.entries.push(entry);
    this.sortInitiative();
    this.touch();
    return entry;
  }

  removeInitiative(entryId: string): boolean {
    const idx = this.state.initiative.entries.findIndex((e) => e.id === entryId);
    if (idx === -1) return false;
    this.state.initiative.entries.splice(idx, 1);
    if (this.state.initiative.currentIndex >= this.state.initiative.entries.length) {
      this.state.initiative.currentIndex = 0;
    }
    this.touch();
    return true;
  }

  updateInitiative(entryId: string, updates: Partial<InitiativeEntry>): InitiativeEntry | null {
    const entry = this.state.initiative.entries.find((e) => e.id === entryId);
    if (!entry) return null;
    const { id: _id, ...safeUpdates } = updates;
    Object.assign(entry, safeUpdates);
    this.touch();
    return entry;
  }

  nextTurn(): { currentIndex: number; round: number } {
    const init = this.state.initiative;
    if (init.entries.length === 0) return { currentIndex: -1, round: init.round };

    // Deactivate current
    if (init.currentIndex >= 0 && init.currentIndex < init.entries.length) {
      init.entries[init.currentIndex].isActive = false;
    }

    init.currentIndex++;
    if (init.currentIndex >= init.entries.length) {
      init.currentIndex = 0;
      init.round++;
    }

    init.entries[init.currentIndex].isActive = true;
    this.touch();
    return { currentIndex: init.currentIndex, round: init.round };
  }

  sortInitiative(): void {
    this.state.initiative.entries.sort((a, b) => b.initiative - a.initiative);
  }

  clearInitiative(): void {
    this.state.initiative.entries = [];
    this.state.initiative.round = 1;
    this.state.initiative.currentIndex = -1;
    this.state.initiative.active = false;
    this.touch();
  }

  toggleInitiative(active: boolean): boolean {
    this.state.initiative.active = active;
    if (active && this.state.initiative.entries.length > 0 && this.state.initiative.currentIndex === -1) {
      this.state.initiative.currentIndex = 0;
      this.state.initiative.entries[0].isActive = true;
    }
    this.touch();
    return active;
  }

  // ---- Dice ----

  addDiceRoll(roll: DiceRoll): DiceRoll {
    this.state.diceHistory.push(roll);
    if (this.state.diceHistory.length > MAX_DICE_HISTORY) {
      this.state.diceHistory = this.state.diceHistory.slice(-MAX_DICE_HISTORY);
    }
    this.touch();
    return roll;
  }

  // ---- Session ----

  replaceState(state: SessionState): void {
    this.state = state;
  }
}
