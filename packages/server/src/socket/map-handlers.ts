import type { Server, Socket } from 'socket.io';
import { SOCKET_EVENTS } from '@livingtable/shared';
import type { GridConfig } from '@livingtable/shared';
import { getSessionManager } from './index.js';

export function registerMapHandlers(io: Server, socket: Socket): void {
  const room = () => `campaign:${socket.data.campaignId}`;

  socket.on(SOCKET_EVENTS.MAP_LOAD, (data: { imageUrl: string; imageWidth: number; imageHeight: number }) => {
    if (socket.data.role !== 'dm') return;
    if (!socket.data.campaignId) return;
    const manager = getSessionManager(socket.data.campaignId);
    const map = manager.loadMap(data.imageUrl, data.imageWidth, data.imageHeight);
    io.to(room()).emit(SOCKET_EVENTS.MAP_LOAD, map);
  });

  socket.on(SOCKET_EVENTS.MAP_GRID_UPDATE, (grid: Partial<GridConfig>) => {
    if (socket.data.role !== 'dm') return;
    if (!socket.data.campaignId) return;
    const manager = getSessionManager(socket.data.campaignId);
    const updated = manager.updateGrid(grid);
    io.to(room()).emit(SOCKET_EVENTS.MAP_GRID_UPDATE, updated);
  });
}
