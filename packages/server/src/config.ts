import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// packages/server/src/ or packages/server/dist/ → project root
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

export const PORT = parseInt(process.env.PORT || '3001', 10);
export const DATA_DIR = path.resolve(PROJECT_ROOT, 'data');
export const CLIENT_DIST = path.resolve(PROJECT_ROOT, 'packages/client/dist');
export const JWT_EXPIRY = '24h';

export const CORS_ORIGINS = process.env.LIVINGTABLE_CORS_ORIGINS
  ? process.env.LIVINGTABLE_CORS_ORIGINS.split(',')
  : ['http://localhost:5173'];

function getJwtSecret(): string {
  if (process.env.LIVINGTABLE_JWT_SECRET) {
    return process.env.LIVINGTABLE_JWT_SECRET;
  }
  const secretPath = path.join(DATA_DIR, 'auth', 'jwt-secret.txt');
  mkdirSync(path.dirname(secretPath), { recursive: true });
  if (existsSync(secretPath)) {
    return readFileSync(secretPath, 'utf-8').trim();
  }
  const secret = crypto.randomBytes(64).toString('hex');
  writeFileSync(secretPath, secret, 'utf-8');
  return secret;
}

export const JWT_SECRET = getJwtSecret();
