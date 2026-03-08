import bcrypt from 'bcrypt';
import type { User, Campaign, CampaignMembership, PublicUser } from '@livingtable/shared';
import { prisma } from '../db/client.js';

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

/** Map a Prisma campaign + members to the shared Campaign type */
function toCampaign(row: {
  id: string;
  name: string;
  dmUserId: string;
  inviteCode: string;
  createdAt: Date;
  updatedAt: Date;
  members?: { userId: string; role: string }[];
}): Campaign {
  const playerUserIds = (row.members ?? [])
    .filter((m) => m.role === 'player')
    .map((m) => m.userId);
  return {
    id: row.id,
    name: row.name,
    dmUserId: row.dmUserId,
    playerUserIds,
    inviteCode: row.inviteCode,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toUser(row: {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
  createdAt: Date;
}): User {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.passwordHash,
    displayName: row.displayName,
    createdAt: row.createdAt.toISOString(),
  };
}

export class CampaignStore {
  // ---- Users ----

  async createUser(username: string, password: string, displayName: string): Promise<User> {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    try {
      const row = await prisma.user.create({
        data: { username, passwordHash, displayName },
      });
      return toUser(row);
    } catch (err: unknown) {
      // Prisma unique constraint error
      if ((err as { code?: string }).code === 'P2002') {
        throw new Error('Username already taken');
      }
      throw err;
    }
  }

  async authenticateUser(username: string, password: string): Promise<User | null> {
    const row = await prisma.user.findUnique({ where: { username } });
    if (!row) return null;
    const valid = await bcrypt.compare(password, row.passwordHash);
    return valid ? toUser(row) : null;
  }

  async getUserById(id: string): Promise<User | null> {
    const row = await prisma.user.findUnique({ where: { id } });
    return row ? toUser(row) : null;
  }

  async getPublicUser(id: string): Promise<PublicUser | null> {
    const row = await prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, displayName: true },
    });
    return row ?? null;
  }

  // ---- Campaigns ----

  async createCampaign(name: string, dmUserId: string): Promise<Campaign> {
    const campaign = await prisma.campaign.create({
      data: {
        name,
        dmUserId,
        inviteCode: generateInviteCode(),
        members: {
          create: { userId: dmUserId, role: 'dm' },
        },
      },
      include: { members: { select: { userId: true, role: true } } },
    });
    return toCampaign(campaign);
  }

  async getCampaign(id: string): Promise<Campaign | null> {
    const row = await prisma.campaign.findUnique({
      where: { id },
      include: { members: { select: { userId: true, role: true } } },
    });
    return row ? toCampaign(row) : null;
  }

  async getCampaignByInviteCode(code: string): Promise<Campaign | null> {
    const row = await prisma.campaign.findUnique({
      where: { inviteCode: code.toUpperCase() },
      include: { members: { select: { userId: true, role: true } } },
    });
    return row ? toCampaign(row) : null;
  }

  async joinCampaign(userId: string, inviteCode: string): Promise<Campaign> {
    const campaign = await prisma.campaign.findUnique({
      where: { inviteCode: inviteCode.toUpperCase() },
      include: { members: { select: { userId: true, role: true } } },
    });
    if (!campaign) {
      throw new Error('Invalid invite code');
    }
    const alreadyMember = campaign.members.some((m) => m.userId === userId);
    if (alreadyMember) {
      throw new Error('Already a member of this campaign');
    }
    await prisma.campaignMember.create({
      data: { campaignId: campaign.id, userId, role: 'player' },
    });
    // Re-fetch to include the new member
    const updated = await prisma.campaign.findUnique({
      where: { id: campaign.id },
      include: { members: { select: { userId: true, role: true } } },
    });
    return toCampaign(updated!);
  }

  async getUserCampaigns(userId: string): Promise<CampaignMembership[]> {
    const memberships = await prisma.campaignMember.findMany({
      where: { userId },
      include: { campaign: { select: { id: true, name: true } } },
    });
    return memberships.map((m) => ({
      campaignId: m.campaign.id,
      campaignName: m.campaign.name,
      role: m.role as 'dm' | 'player',
    }));
  }

  async getUserRole(userId: string, campaignId: string): Promise<'dm' | 'player' | null> {
    const member = await prisma.campaignMember.findUnique({
      where: { campaignId_userId: { campaignId, userId } },
    });
    return member ? (member.role as 'dm' | 'player') : null;
  }

  async regenerateInviteCode(campaignId: string, requestingUserId: string): Promise<string> {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error('Campaign not found');
    if (campaign.dmUserId !== requestingUserId) throw new Error('Only the DM can regenerate invite codes');
    const newCode = generateInviteCode();
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { inviteCode: newCode },
    });
    return newCode;
  }

  async removePlayerFromCampaign(campaignId: string, userId: string, requestingUserId: string): Promise<void> {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error('Campaign not found');
    if (campaign.dmUserId !== requestingUserId) throw new Error('Only the DM can remove players');
    await prisma.campaignMember.deleteMany({
      where: { campaignId, userId, role: 'player' },
    });
  }

  async getCampaignPlayers(campaignId: string): Promise<PublicUser[]> {
    const members = await prisma.campaignMember.findMany({
      where: { campaignId },
      include: {
        user: { select: { id: true, username: true, displayName: true } },
      },
    });
    return members.map((m) => m.user);
  }
}
