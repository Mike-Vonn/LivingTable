import type { Server, Socket } from 'socket.io';
import { SOCKET_EVENTS } from '@livingtable/shared';
import type { DiceRoll } from '@livingtable/shared';
import { getSessionManager } from './index.js';

export function registerDiceHandlers(io: Server, socket: Socket): void {
  socket.on(SOCKET_EVENTS.DICE_ROLL, (roll: DiceRoll) => {
    if (!socket.data.campaignId) return;
    const room = `campaign:${socket.data.campaignId}`;

    // Stamp roller info from auth
    roll.rollerId = socket.data.user.userId;
    roll.rollerName = socket.data.user.username;

    const manager = getSessionManager(socket.data.campaignId);
    manager.addDiceRoll(roll);

    if (roll.isPrivate) {
      // Private rolls only go to DM sockets in the room
      const sockets = io.sockets.adapter.rooms.get(room);
      if (sockets) {
        for (const sid of sockets) {
          const s = io.sockets.sockets.get(sid);
          if (s && (s.data.role === 'dm' || s.id === socket.id)) {
            s.emit(SOCKET_EVENTS.DICE_ROLL, roll);
          }
        }
      }
    } else {
      io.to(room).emit(SOCKET_EVENTS.DICE_ROLL, roll);
    }
  });
}
