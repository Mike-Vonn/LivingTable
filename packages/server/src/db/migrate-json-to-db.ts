/**
 * One-time migration script: JSON files → PostgreSQL
 *
 * Reads existing data/auth/users.json and data/auth/campaigns.json
 * and inserts them into PostgreSQL via Prisma.
 *
 * Run with: npx tsx src/db/migrate-json-to-db.ts
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from './client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const AUTH_DIR = path.join(PROJECT_ROOT, 'data', 'auth');
const USERS_FILE = path.join(AUTH_DIR, 'users.json');
const CAMPAIGNS_FILE = path.join(AUTH_DIR, 'campaigns.json');

interface JsonUser {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
  createdAt: string;
}

interface JsonCampaign {
  id: string;
  name: string;
  dmUserId: string;
  playerUserIds: string[];
  inviteCode: string;
  createdAt: string;
  updatedAt: string;
}

async function migrate() {
  console.log('Starting JSON → PostgreSQL migration...\n');

  // Load JSON data
  let users: JsonUser[] = [];
  let campaigns: JsonCampaign[] = [];

  if (existsSync(USERS_FILE)) {
    users = JSON.parse(readFileSync(USERS_FILE, 'utf-8'));
    console.log(`Found ${users.length} users in ${USERS_FILE}`);
  } else {
    console.log('No users.json found — skipping users.');
  }

  if (existsSync(CAMPAIGNS_FILE)) {
    campaigns = JSON.parse(readFileSync(CAMPAIGNS_FILE, 'utf-8'));
    console.log(`Found ${campaigns.length} campaigns in ${CAMPAIGNS_FILE}`);
  } else {
    console.log('No campaigns.json found — skipping campaigns.');
  }

  if (users.length === 0 && campaigns.length === 0) {
    console.log('\nNothing to migrate.');
    return;
  }

  // Migrate users
  for (const user of users) {
    const existing = await prisma.user.findUnique({ where: { id: user.id } });
    if (existing) {
      console.log(`  User "${user.username}" already exists — skipping.`);
      continue;
    }
    await prisma.user.create({
      data: {
        id: user.id,
        username: user.username,
        passwordHash: user.passwordHash,
        displayName: user.displayName,
        createdAt: new Date(user.createdAt),
      },
    });
    console.log(`  Migrated user: ${user.username}`);
  }

  // Migrate campaigns + memberships
  for (const campaign of campaigns) {
    const existing = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    if (existing) {
      console.log(`  Campaign "${campaign.name}" already exists — skipping.`);
      continue;
    }
    await prisma.campaign.create({
      data: {
        id: campaign.id,
        name: campaign.name,
        dmUserId: campaign.dmUserId,
        inviteCode: campaign.inviteCode,
        createdAt: new Date(campaign.createdAt),
        updatedAt: new Date(campaign.updatedAt),
        members: {
          create: [
            // DM membership
            { userId: campaign.dmUserId, role: 'dm' },
            // Player memberships
            ...campaign.playerUserIds.map((userId) => ({
              userId,
              role: 'player' as const,
            })),
          ],
        },
      },
    });
    console.log(`  Migrated campaign: ${campaign.name} (DM + ${campaign.playerUserIds.length} players)`);
  }

  console.log('\nMigration complete!');
}

migrate()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
