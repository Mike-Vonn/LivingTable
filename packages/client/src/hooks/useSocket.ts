import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_EVENTS } from '@livingtable/shared';
import type { SessionState, Token, MapState, GridConfig, FogRegion, InitiativeState, DiceRoll } from '@livingtable/shared';
import { useAuthStore } from '../state/authStore';
import { useGameStore } from '../state/gameStore';

export function useSocket(): Socket | null {
  const socketRef = useRef<Socket | null>(null);
  const token = useAuthStore((s) => s.token);
  const campaign = useAuthStore((s) => s.currentCampaign);

  const setSession = useGameStore((s) => s.setSession);
  const setConnectedPlayers = useGameStore((s) => s.setConnectedPlayers);
  const addToken = useGameStore((s) => s.addToken);
  const moveToken = useGameStore((s) => s.moveToken);
  const updateToken = useGameStore((s) => s.updateToken);
  const removeToken = useGameStore((s) => s.removeToken);
  const setMap = useGameStore((s) => s.setMap);
  const setGrid = useGameStore((s) => s.setGrid);
  const setFogRegion = useGameStore((s) => s.setFogRegion);
  const removeFogRegion = useGameStore((s) => s.removeFogRegion);
  const setFogEnabled = useGameStore((s) => s.setFogEnabled);
  const setInitiative = useGameStore((s) => s.setInitiative);
  const addDiceRoll = useGameStore((s) => s.addDiceRoll);
  const reset = useGameStore((s) => s.reset);

  useEffect(() => {
    if (!token || !campaign) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        reset();
      }
      return;
    }

    const socket = io({ auth: { token } });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit(SOCKET_EVENTS.JOIN_CAMPAIGN, { campaignId: campaign.campaignId });
    });

    // State sync
    socket.on(SOCKET_EVENTS.CAMPAIGN_STATE, (state: SessionState) => setSession(state));
    socket.on(SOCKET_EVENTS.CAMPAIGN_PLAYERS, (players) => setConnectedPlayers(players));

    // Token events
    socket.on(SOCKET_EVENTS.TOKEN_ADD, (t: Token) => addToken(t));
    socket.on(SOCKET_EVENTS.TOKEN_MOVE, (d: { tokenId: string; x: number; y: number }) => moveToken(d.tokenId, d.x, d.y));
    socket.on(SOCKET_EVENTS.TOKEN_UPDATE, (t: Token) => updateToken(t));
    socket.on(SOCKET_EVENTS.TOKEN_REMOVE, (d: { tokenId: string }) => removeToken(d.tokenId));

    // Map events
    socket.on(SOCKET_EVENTS.MAP_LOAD, (map: MapState) => setMap(map));
    socket.on(SOCKET_EVENTS.MAP_GRID_UPDATE, (grid: GridConfig) => setGrid(grid));

    // Fog events
    socket.on(SOCKET_EVENTS.FOG_REVEAL, (region: FogRegion) => setFogRegion(region));
    socket.on(SOCKET_EVENTS.FOG_HIDE, (d: { regionId: string }) => removeFogRegion(d.regionId));
    socket.on(SOCKET_EVENTS.FOG_TOGGLE, (d: { enabled: boolean }) => setFogEnabled(d.enabled));

    // Initiative events
    socket.on(SOCKET_EVENTS.INIT_ADD, () => { /* handled via full state */ });
    socket.on(SOCKET_EVENTS.INIT_SORT, (init: InitiativeState) => setInitiative(init));
    socket.on(SOCKET_EVENTS.INIT_CLEAR, (init: InitiativeState) => setInitiative(init));
    socket.on(SOCKET_EVENTS.INIT_TOGGLE, () => { /* handled via full state refresh */ });

    // Dice events
    socket.on(SOCKET_EVENTS.DICE_ROLL, (roll: DiceRoll) => addDiceRoll(roll));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, campaign?.campaignId]);

  return socketRef.current;
}
