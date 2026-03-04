import type { Server, Socket } from 'socket.io';
import { SOCKET_EVENTS } from '@livingtable/shared';
import type { SessionState } from '@livingtable/shared';
import { getSessionManager, setSessionManager } from './index.js';
import { SessionStateManager } from '../state/session-state.js';
import { saveSession, loadSession, listSessions } from '../state/persistence.js';

export function registerSessionHandlers(io: Server, socket: Socket): void {
  const room = () => `campaign:${socket.data.campaignId}`;

  socket.on(SOCKET_EVENTS.SESSION_SAVE, () => {
    if (socket.data.role !== 'dm') return;
    if (!socket.data.campaignId) return;
    const manager = getSessionManager(socket.data.campaignId);
    saveSession(manager.getState());
    socket.emit(SOCKET_EVENTS.SESSION_SAVE, { success: true, id: manager.getState().id });
  });

  socket.on(SOCKET_EVENTS.SESSION_LOAD, (data: { sessionId: string }) => {
    if (socket.data.role !== 'dm') return;
    if (!socket.data.campaignId) return;
    const state = loadSession(socket.data.campaignId, data.sessionId);
    if (!state) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }
    const manager = new SessionStateManager(socket.data.campaignId, state);
    setSessionManager(socket.data.campaignId, manager);
    io.to(room()).emit(SOCKET_EVENTS.CAMPAIGN_STATE, manager.getState());
  });

  socket.on(SOCKET_EVENTS.SESSION_LIST, () => {
    if (!socket.data.campaignId) return;
    const sessions = listSessions(socket.data.campaignId);
    socket.emit(SOCKET_EVENTS.SESSION_LIST, sessions);
  });
}
