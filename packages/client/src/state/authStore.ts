import { create } from 'zustand';
import type { PublicUser, CampaignMembership, AuthResponse, Campaign } from '@livingtable/shared';
import { api } from '../utils/api';

interface AuthState {
  token: string | null;
  user: PublicUser | null;
  campaigns: CampaignMembership[];
  currentCampaign: CampaignMembership | null;
  isLoading: boolean;
  error: string | null;

  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, displayName: string, inviteCode?: string) => Promise<void>;
  logout: () => void;
  fetchCampaigns: () => Promise<void>;
  selectCampaign: (campaign: CampaignMembership | null) => void;
  createCampaign: (name: string) => Promise<Campaign>;
  joinCampaign: (inviteCode: string) => Promise<void>;
  clearError: () => void;
}

function loadStoredAuth(): { token: string | null; user: PublicUser | null } {
  try {
    const token = localStorage.getItem('lt_token');
    const userJson = localStorage.getItem('lt_user');
    if (token && userJson) {
      // Basic JWT expiry check
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp * 1000 > Date.now()) {
        return { token, user: JSON.parse(userJson) };
      }
    }
  } catch { /* ignore */ }
  localStorage.removeItem('lt_token');
  localStorage.removeItem('lt_user');
  return { token: null, user: null };
}

const stored = loadStoredAuth();

export const useAuthStore = create<AuthState>((set, get) => ({
  token: stored.token,
  user: stored.user,
  campaigns: [],
  currentCampaign: null,
  isLoading: false,
  error: null,

  login: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.post<AuthResponse>('/api/auth/login', { username, password });
      localStorage.setItem('lt_token', res.token);
      localStorage.setItem('lt_user', JSON.stringify(res.user));
      set({ token: res.token, user: res.user, isLoading: false });
    } catch (err: unknown) {
      set({ isLoading: false, error: err instanceof Error ? err.message : 'Login failed' });
    }
  },

  register: async (username, password, displayName, inviteCode) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.post<AuthResponse>('/api/auth/register', {
        username, password, displayName, inviteCode,
      });
      localStorage.setItem('lt_token', res.token);
      localStorage.setItem('lt_user', JSON.stringify(res.user));
      set({ token: res.token, user: res.user, isLoading: false });
    } catch (err: unknown) {
      set({ isLoading: false, error: err instanceof Error ? err.message : 'Registration failed' });
    }
  },

  logout: () => {
    localStorage.removeItem('lt_token');
    localStorage.removeItem('lt_user');
    set({ token: null, user: null, campaigns: [], currentCampaign: null });
  },

  fetchCampaigns: async () => {
    try {
      const campaigns = await api.get<CampaignMembership[]>('/api/campaigns');
      set({ campaigns });
    } catch { /* ignore */ }
  },

  selectCampaign: (campaign) => {
    set({ currentCampaign: campaign });
  },

  createCampaign: async (name) => {
    const campaign = await api.post<Campaign>('/api/campaigns', { name });
    await get().fetchCampaigns();
    return campaign;
  },

  joinCampaign: async (inviteCode) => {
    await api.post('/api/campaigns/join', { inviteCode });
    await get().fetchCampaigns();
  },

  clearError: () => set({ error: null }),
}));
