import type { Request, Response, NextFunction } from 'express';
import type { Socket } from 'socket.io';
import { verifyToken, type JWTPayload } from './tokens.js';

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }
  const payload = verifyToken(header.slice(7));
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
  req.user = payload;
  next();
}

export function socketAuth(socket: Socket, next: (err?: Error) => void): void {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) {
    next(new Error('Authentication required'));
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    next(new Error('Invalid or expired token'));
    return;
  }
  socket.data.user = payload;
  next();
}
