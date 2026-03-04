import { create } from 'zustand';
import type { SessionState, Token, MapState, FogState, InitiativeState, DiceRoll, PublicUser } from '@livingtable/shared';

interface GameState {
  session: SessionState | null;
  connectedPlayers: Array<{ userId: string; username: string }>;

  setSession: (session: SessionState) => void;
  setConnectedPlayers: (players: Array<{ userId: string; username: string }>) => void;

  // Granular updates from socket events
  addToken: (token: Token) => void;
  moveToken: (tokenId: string, x: number, y: number) => void;
  updateToken: (token: Token) => void;
  removeToken: (tokenId: string) => void;
  setMap: (map: MapState) => void;
  setGrid: (grid: MapState['grid']) => void;
  setFogRegion: (region: FogState['regions'][0]) => void;
  removeFogRegion: (regionId: string) => void;
  setFogEnabled: (enabled: boolean) => void;
  setInitiative: (initiative: InitiativeState) => void;
  addDiceRoll: (roll: DiceRoll) => void;
  reset: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  session: null,
  connectedPlayers: [],

  setSession: (session) => set({ session }),
  setConnectedPlayers: (players) => set({ connectedPlayers: players }),

  addToken: (token) => set((s) => {
    if (!s.session) return s;
    return { session: { ...s.session, tokens: [...s.session.tokens, token] } };
  }),

  moveToken: (tokenId, x, y) => set((s) => {
    if (!s.session) return s;
    return {
      session: {
        ...s.session,
        tokens: s.session.tokens.map((t) => t.id === tokenId ? { ...t, x, y } : t),
      },
    };
  }),

  updateToken: (token) => set((s) => {
    if (!s.session) return s;
    return {
      session: {
        ...s.session,
        tokens: s.session.tokens.map((t) => t.id === token.id ? token : t),
      },
    };
  }),

  removeToken: (tokenId) => set((s) => {
    if (!s.session) return s;
    return {
      session: {
        ...s.session,
        tokens: s.session.tokens.filter((t) => t.id !== tokenId),
      },
    };
  }),

  setMap: (map) => set((s) => {
    if (!s.session) return s;
    return { session: { ...s.session, map } };
  }),

  setGrid: (grid) => set((s) => {
    if (!s.session) return s;
    return { session: { ...s.session, map: { ...s.session.map, grid } } };
  }),

  setFogRegion: (region) => set((s) => {
    if (!s.session) return s;
    return {
      session: {
        ...s.session,
        fog: { ...s.session.fog, regions: [...s.session.fog.regions, region] },
      },
    };
  }),

  removeFogRegion: (regionId) => set((s) => {
    if (!s.session) return s;
    return {
      session: {
        ...s.session,
        fog: {
          ...s.session.fog,
          regions: s.session.fog.regions.filter((r) => r.id !== regionId),
        },
      },
    };
  }),

  setFogEnabled: (enabled) => set((s) => {
    if (!s.session) return s;
    return { session: { ...s.session, fog: { ...s.session.fog, enabled } } };
  }),

  setInitiative: (initiative) => set((s) => {
    if (!s.session) return s;
    return { session: { ...s.session, initiative } };
  }),

  addDiceRoll: (roll) => set((s) => {
    if (!s.session) return s;
    return {
      session: {
        ...s.session,
        diceHistory: [...s.session.diceHistory, roll],
      },
    };
  }),

  reset: () => set({ session: null, connectedPlayers: [] }),
}));
