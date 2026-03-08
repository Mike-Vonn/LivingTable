import type { Server, Socket } from 'socket.io';
import { SOCKET_EVENTS } from '@livingtable/shared';
import { store } from '../app.js';
import { SessionStateManager } from '../state/session-state.js';
import { registerTokenHandlers } from './token-handlers.js';
import { registerMapHandlers } from './map-handlers.js';
import { registerFogHandlers } from './fog-handlers.js';
import { registerInitiativeHandlers } from './initiative-handlers.js';
import { registerDiceHandlers } from './dice-handlers.js';
import { registerSessionHandlers } from './session-handlers.js';

// One session state manager per campaign
const sessions = new Map<string, SessionStateManager>();

export function getSessionManager(campaignId: string): SessionStateManager {
  let manager = sessions.get(campaignId);
  if (!manager) {
    manager = new SessionStateManager(campaignId);
    sessions.set(campaignId, manager);
  }
  return manager;
}

export function setSessionManager(campaignId: string, manager: SessionStateManager): void {
  sessions.set(campaignId, manager);
}

// Track connected players per campaign
const connectedPlayers = new Map<string, Map<string, { userId: string; username: string; socketId: string }>>();

function getConnectedPlayerList(campaignId: string) {
  const players = connectedPlayers.get(campaignId);
  if (!players) return [];
  return Array.from(players.values()).map((p) => ({
    userId: p.userId,
    username: p.username,
  }));
}

export function registerSocketHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as { userId: string; username: string };
    console.log(`Socket connected: ${user.username} (${socket.id})`);

    // Handle campaign join
    socket.on(SOCKET_EVENTS.JOIN_CAMPAIGN, async (data: { campaignId: string }) => {
      const { campaignId } = data;
      const role = await store.getUserRole(user.userId, campaignId);

      if (!role) {
        socket.emit('error', { message: 'Not a member of this campaign' });
        return;
      }

      // Leave any previous campaign room
      if (socket.data.campaignId) {
        const prevRoom = `campaign:${socket.data.campaignId}`;
        socket.leave(prevRoom);
        // Remove from connected players
        connectedPlayers.get(socket.data.campaignId)?.delete(socket.id);
        io.to(prevRoom).emit(SOCKET_EVENTS.CAMPAIGN_PLAYERS, getConnectedPlayerList(socket.data.campaignId));
      }

      // Join the campaign room
      const room = `campaign:${campaignId}`;
      socket.join(room);
      socket.data.campaignId = campaignId;
      socket.data.role = role;

      // Track connected player
      if (!connectedPlayers.has(campaignId)) {
        connectedPlayers.set(campaignId, new Map());
      }
      connectedPlayers.get(campaignId)!.set(socket.id, {
        userId: user.userId,
        username: user.username,
        socketId: socket.id,
      });

      // Send current session state
      const manager = getSessionManager(campaignId);
      socket.emit(SOCKET_EVENTS.CAMPAIGN_STATE, manager.getState());

      // Broadcast updated player list
      io.to(room).emit(SOCKET_EVENTS.CAMPAIGN_PLAYERS, getConnectedPlayerList(campaignId));

      console.log(`${user.username} joined campaign ${campaignId} as ${role}`);
    });

    // Register all event handlers
    registerTokenHandlers(io, socket);
    registerMapHandlers(io, socket);
    registerFogHandlers(io, socket);
    registerInitiativeHandlers(io, socket);
    registerDiceHandlers(io, socket);
    registerSessionHandlers(io, socket);

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${user.username} (${socket.id})`);

      if (socket.data.campaignId) {
        const campaignId = socket.data.campaignId;
        connectedPlayers.get(campaignId)?.delete(socket.id);
        const room = `campaign:${campaignId}`;
        io.to(room).emit(SOCKET_EVENTS.CAMPAIGN_PLAYERS, getConnectedPlayerList(campaignId));

        // Clean up empty player maps
        if (connectedPlayers.get(campaignId)?.size === 0) {
          connectedPlayers.delete(campaignId);
        }
      }
    });
  });
}
