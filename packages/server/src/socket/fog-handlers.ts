import type { Server, Socket } from 'socket.io';
import { SOCKET_EVENTS } from '@livingtable/shared';
import type { FogRegion } from '@livingtable/shared';
import { getSessionManager } from './index.js';

export function registerFogHandlers(io: Server, socket: Socket): void {
  const room = () => `campaign:${socket.data.campaignId}`;

  socket.on(SOCKET_EVENTS.FOG_REVEAL, (region: FogRegion) => {
    if (socket.data.role !== 'dm') return;
    if (!socket.data.campaignId) return;
    const manager = getSessionManager(socket.data.campaignId);
    const revealed = manager.revealFog(region);
    io.to(room()).emit(SOCKET_EVENTS.FOG_REVEAL, revealed);
  });

  socket.on(SOCKET_EVENTS.FOG_HIDE, (data: { regionId: string }) => {
    if (socket.data.role !== 'dm') return;
    if (!socket.data.campaignId) return;
    const manager = getSessionManager(socket.data.campaignId);
    const hidden = manager.hideFog(data.regionId);
    if (hidden) {
      io.to(room()).emit(SOCKET_EVENTS.FOG_HIDE, { regionId: data.regionId });
    }
  });

  socket.on(SOCKET_EVENTS.FOG_TOGGLE, (data: { enabled: boolean }) => {
    if (socket.data.role !== 'dm') return;
    if (!socket.data.campaignId) return;
    const manager = getSessionManager(socket.data.campaignId);
    const enabled = manager.toggleFog(data.enabled);
    io.to(room()).emit(SOCKET_EVENTS.FOG_TOGGLE, { enabled });
  });
}
