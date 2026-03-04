import jwt from 'jsonwebtoken';
import type { User } from '@livingtable/shared';
import { JWT_SECRET, JWT_EXPIRY } from '../config.js';

export interface JWTPayload {
  userId: string;
  username: string;
}

export function generateToken(user: User): string {
  return jwt.sign(
    { userId: user.id, username: user.username } satisfies JWTPayload,
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY },
  );
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload & JWTPayload;
    return { userId: decoded.userId, username: decoded.username };
  } catch {
    return null;
  }
}
