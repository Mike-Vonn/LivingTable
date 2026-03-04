import type { Server, Socket } from 'socket.io';
import { SOCKET_EVENTS } from '@livingtable/shared';
import type { InitiativeEntry } from '@livingtable/shared';
import { getSessionManager } from './index.js';

export function registerInitiativeHandlers(io: Server, socket: Socket): void {
  const room = () => `campaign:${socket.data.campaignId}`;

  socket.on(SOCKET_EVENTS.INIT_ADD, (entry: InitiativeEntry) => {
    if (!socket.data.campaignId) return;
    // Players can add their own; DM can add anyone
    if (socket.data.role !== 'dm' && entry.isNPC) return;
    const manager = getSessionManager(socket.data.campaignId);
    const added = manager.addInitiative(entry);
    io.to(room()).emit(SOCKET_EVENTS.INIT_ADD, added);
  });

  socket.on(SOCKET_EVENTS.INIT_REMOVE, (data: { entryId: string }) => {
    if (socket.data.role !== 'dm') return;
    if (!socket.data.campaignId) return;
    const manager = getSessionManager(socket.data.campaignId);
    const removed = manager.removeInitiative(data.entryId);
    if (removed) {
      io.to(room()).emit(SOCKET_EVENTS.INIT_REMOVE, { entryId: data.entryId });
    }
  });

  socket.on(SOCKET_EVENTS.INIT_UPDATE, (data: { entryId: string; updates: Partial<InitiativeEntry> }) => {
    if (!socket.data.campaignId) return;
    const manager = getSessionManager(socket.data.campaignId);
    const updated = manager.updateInitiative(data.entryId, data.updates);
    if (updated) {
      io.to(room()).emit(SOCKET_EVENTS.INIT_UPDATE, updated);
    }
  });

  socket.on(SOCKET_EVENTS.INIT_NEXT, () => {
    if (socket.data.role !== 'dm') return;
    if (!socket.data.campaignId) return;
    const manager = getSessionManager(socket.data.campaignId);
    const result = manager.nextTurn();
    io.to(room()).emit(SOCKET_EVENTS.INIT_NEXT, result);
  });

  socket.on(SOCKET_EVENTS.INIT_SORT, () => {
    if (socket.data.role !== 'dm') return;
    if (!socket.data.campaignId) return;
    const manager = getSessionManager(socket.data.campaignId);
    manager.sortInitiative();
    io.to(room()).emit(SOCKET_EVENTS.INIT_SORT, manager.getState().initiative);
  });

  socket.on(SOCKET_EVENTS.INIT_CLEAR, () => {
    if (socket.data.role !== 'dm') return;
    if (!socket.data.campaignId) return;
    const manager = getSessionManager(socket.data.campaignId);
    manager.clearInitiative();
    io.to(room()).emit(SOCKET_EVENTS.INIT_CLEAR, manager.getState().initiative);
  });

  socket.on(SOCKET_EVENTS.INIT_TOGGLE, (data: { active: boolean }) => {
    if (socket.data.role !== 'dm') return;
    if (!socket.data.campaignId) return;
    const manager = getSessionManager(socket.data.campaignId);
    const active = manager.toggleInitiative(data.active);
    io.to(room()).emit(SOCKET_EVENTS.INIT_TOGGLE, { active });
  });
}
