import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { SessionState } from '@livingtable/shared';
import { DATA_DIR } from '../config.js';

const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');

function campaignDir(campaignId: string): string {
  const dir = path.join(SESSIONS_DIR, campaignId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function saveSession(state: SessionState): void {
  const dir = campaignDir(state.campaignId);
  const filePath = path.join(dir, `${state.id}.json`);
  writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
}

export function loadSession(campaignId: string, sessionId: string): SessionState | null {
  const filePath = path.join(SESSIONS_DIR, campaignId, `${sessionId}.json`);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

export function listSessions(campaignId: string): Array<{ id: string; name: string; updatedAt: string }> {
  const dir = path.join(SESSIONS_DIR, campaignId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const state: SessionState = JSON.parse(readFileSync(path.join(dir, f), 'utf-8'));
      return { id: state.id, name: state.name, updatedAt: state.updatedAt };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function ensureDataDirs(): void {
  mkdirSync(SESSIONS_DIR, { recursive: true });
  mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });
  mkdirSync(path.join(DATA_DIR, 'auth'), { recursive: true });
}
