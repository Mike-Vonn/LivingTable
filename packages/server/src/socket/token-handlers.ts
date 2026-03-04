import type { Server, Socket } from 'socket.io';
import { SOCKET_EVENTS } from '@livingtable/shared';
import type { Token } from '@livingtable/shared';
import { getSessionManager } from './index.js';

export function registerTokenHandlers(io: Server, socket: Socket): void {
  const room = () => `campaign:${socket.data.campaignId}`;

  socket.on(SOCKET_EVENTS.TOKEN_ADD, (token: Token) => {
    if (socket.data.role !== 'dm') return;
    if (!socket.data.campaignId) return;
    const manager = getSessionManager(socket.data.campaignId);
    const added = manager.addToken(token);
    io.to(room()).emit(SOCKET_EVENTS.TOKEN_ADD, added);
  });

  socket.on(SOCKET_EVENTS.TOKEN_MOVE, (data: { tokenId: string; x: number; y: number }) => {
    if (!socket.data.campaignId) return;
    const manager = getSessionManager(socket.data.campaignId);
    const token = manager.getToken(data.tokenId);
    if (!token) return;

    // Players can only move tokens they control
    if (socket.data.role !== 'dm' && token.controlledBy !== socket.data.user.userId) return;

    const moved = manager.moveToken(data.tokenId, data.x, data.y);
    if (moved) {
      io.to(room()).emit(SOCKET_EVENTS.TOKEN_MOVE, { tokenId: data.tokenId, x: data.x, y: data.y });
    }
  });

  socket.on(SOCKET_EVENTS.TOKEN_UPDATE, (data: { tokenId: string; updates: Partial<Token> }) => {
    if (socket.data.role !== 'dm') return;
    if (!socket.data.campaignId) return;
    const manager = getSessionManager(socket.data.campaignId);
    const updated = manager.updateToken(data.tokenId, data.updates);
    if (updated) {
      io.to(room()).emit(SOCKET_EVENTS.TOKEN_UPDATE, updated);
    }
  });

  socket.on(SOCKET_EVENTS.TOKEN_REMOVE, (data: { tokenId: string }) => {
    if (socket.data.role !== 'dm') return;
    if (!socket.data.campaignId) return;
    const manager = getSessionManager(socket.data.campaignId);
    const removed = manager.removeToken(data.tokenId);
    if (removed) {
      io.to(room()).emit(SOCKET_EVENTS.TOKEN_REMOVE, { tokenId: data.tokenId });
    }
  });
}
