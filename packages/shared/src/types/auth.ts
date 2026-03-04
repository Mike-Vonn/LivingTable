export interface User {
  id: string;
  username: string;
  passwordHash: string;          // bcrypt hash, never sent to client
  displayName: string;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
}

export interface Campaign {
  id: string;
  name: string;
  dmUserId: string;
  playerUserIds: string[];
  inviteCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignMembership {
  campaignId: string;
  campaignName: string;
  role: 'dm' | 'player';
}

export interface AuthResponse {
  token: string;
  user: PublicUser;
}
