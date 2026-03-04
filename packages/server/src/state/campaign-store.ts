import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import type { User, Campaign, CampaignMembership, PublicUser } from '@livingtable/shared';
import { DATA_DIR } from '../config.js';

const AUTH_DIR = path.join(DATA_DIR, 'auth');
const USERS_FILE = path.join(AUTH_DIR, 'users.json');
const CAMPAIGNS_FILE = path.join(AUTH_DIR, 'campaigns.json');
const SALT_ROUNDS = 10;

// Characters for invite codes — exclude ambiguous chars (0/O, 1/I/L)
const INVITE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)];
  }
  return code;
}

export class CampaignStore {
  private users: User[] = [];
  private campaigns: Campaign[] = [];

  constructor() {
    mkdirSync(AUTH_DIR, { recursive: true });
    this.load();
  }

  private load(): void {
    if (existsSync(USERS_FILE)) {
      this.users = JSON.parse(readFileSync(USERS_FILE, 'utf-8'));
    }
    if (existsSync(CAMPAIGNS_FILE)) {
      this.campaigns = JSON.parse(readFileSync(CAMPAIGNS_FILE, 'utf-8'));
    }
  }

  private persist(): void {
    writeFileSync(USERS_FILE, JSON.stringify(this.users, null, 2), 'utf-8');
    writeFileSync(CAMPAIGNS_FILE, JSON.stringify(this.campaigns, null, 2), 'utf-8');
  }

  // ---- Users ----

  async createUser(username: string, password: string, displayName: string): Promise<User> {
    if (this.users.find((u) => u.username === username)) {
      throw new Error('Username already taken');
    }
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user: User = {
      id: uuidv4(),
      username,
      passwordHash,
      displayName,
      createdAt: new Date().toISOString(),
    };
    this.users.push(user);
    this.persist();
    return user;
  }

  async authenticateUser(username: string, password: string): Promise<User | null> {
    const user = this.users.find((u) => u.username === username);
    if (!user) return null;
    const valid = await bcrypt.compare(password, user.passwordHash);
    return valid ? user : null;
  }

  getUserById(id: string): User | null {
    return this.users.find((u) => u.id === id) ?? null;
  }

  getPublicUser(id: string): PublicUser | null {
    const user = this.getUserById(id);
    if (!user) return null;
    return { id: user.id, username: user.username, displayName: user.displayName };
  }

  // ---- Campaigns ----

  createCampaign(name: string, dmUserId: string): Campaign {
    const now = new Date().toISOString();
    const campaign: Campaign = {
      id: uuidv4(),
      name,
      dmUserId,
      playerUserIds: [],
      inviteCode: generateInviteCode(),
      createdAt: now,
      updatedAt: now,
    };
    this.campaigns.push(campaign);
    this.persist();
    return campaign;
  }

  getCampaign(id: string): Campaign | null {
    return this.campaigns.find((c) => c.id === id) ?? null;
  }

  getCampaignByInviteCode(code: string): Campaign | null {
    return this.campaigns.find((c) => c.inviteCode === code.toUpperCase()) ?? null;
  }

  joinCampaign(userId: string, inviteCode: string): Campaign {
    const campaign = this.getCampaignByInviteCode(inviteCode);
    if (!campaign) {
      throw new Error('Invalid invite code');
    }
    if (campaign.dmUserId === userId || campaign.playerUserIds.includes(userId)) {
      throw new Error('Already a member of this campaign');
    }
    campaign.playerUserIds.push(userId);
    campaign.updatedAt = new Date().toISOString();
    this.persist();
    return campaign;
  }

  getUserCampaigns(userId: string): CampaignMembership[] {
    const memberships: CampaignMembership[] = [];
    for (const c of this.campaigns) {
      if (c.dmUserId === userId) {
        memberships.push({ campaignId: c.id, campaignName: c.name, role: 'dm' });
      } else if (c.playerUserIds.includes(userId)) {
        memberships.push({ campaignId: c.id, campaignName: c.name, role: 'player' });
      }
    }
    return memberships;
  }

  getUserRole(userId: string, campaignId: string): 'dm' | 'player' | null {
    const campaign = this.getCampaign(campaignId);
    if (!campaign) return null;
    if (campaign.dmUserId === userId) return 'dm';
    if (campaign.playerUserIds.includes(userId)) return 'player';
    return null;
  }

  regenerateInviteCode(campaignId: string, requestingUserId: string): string {
    const campaign = this.getCampaign(campaignId);
    if (!campaign) throw new Error('Campaign not found');
    if (campaign.dmUserId !== requestingUserId) throw new Error('Only the DM can regenerate invite codes');
    campaign.inviteCode = generateInviteCode();
    campaign.updatedAt = new Date().toISOString();
    this.persist();
    return campaign.inviteCode;
  }

  removePlayerFromCampaign(campaignId: string, userId: string, requestingUserId: string): void {
    const campaign = this.getCampaign(campaignId);
    if (!campaign) throw new Error('Campaign not found');
    if (campaign.dmUserId !== requestingUserId) throw new Error('Only the DM can remove players');
    campaign.playerUserIds = campaign.playerUserIds.filter((id) => id !== userId);
    campaign.updatedAt = new Date().toISOString();
    this.persist();
  }

  getCampaignPlayers(campaignId: string): PublicUser[] {
    const campaign = this.getCampaign(campaignId);
    if (!campaign) return [];
    const playerIds = [campaign.dmUserId, ...campaign.playerUserIds];
    return playerIds
      .map((id) => this.getPublicUser(id))
      .filter((u): u is PublicUser => u !== null);
  }
}
