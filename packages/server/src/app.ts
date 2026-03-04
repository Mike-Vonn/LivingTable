import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { CORS_ORIGINS, CLIENT_DIST, DATA_DIR } from './config.js';
import { requireAuth } from './auth/middleware.js';
import { generateToken } from './auth/tokens.js';
import { CampaignStore } from './state/campaign-store.js';
import { uploadRouter } from './uploads/handler.js';
import { ensureDataDirs } from './state/persistence.js';

export const store = new CampaignStore();

export function createApp() {
  ensureDataDirs();
  const app = express();

  app.use(cors({ origin: CORS_ORIGINS }));
  app.use(express.json());

  // Upload routes
  app.use(uploadRouter);

  // Static: uploaded files
  app.use('/uploads', express.static(path.join(DATA_DIR, 'uploads')));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // ---- Auth routes ----

  app.post('/api/auth/register', async (req, res) => {
    try {
      const { username, password, displayName, inviteCode } = req.body;
      if (!username || !password) {
        res.status(400).json({ error: 'Username and password are required' });
        return;
      }
      if (password.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters' });
        return;
      }
      const user = await store.createUser(username, password, displayName || username);
      // If invite code provided, join that campaign
      if (inviteCode) {
        try {
          store.joinCampaign(user.id, inviteCode);
        } catch {
          // User created but invite code failed — still return success
        }
      }
      const token = generateToken(user);
      res.status(201).json({ token, user: { id: user.id, username: user.username, displayName: user.displayName } });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      res.status(409).json({ error: message });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        res.status(400).json({ error: 'Username and password are required' });
        return;
      }
      const user = await store.authenticateUser(username, password);
      if (!user) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }
      const token = generateToken(user);
      res.json({ token, user: { id: user.id, username: user.username, displayName: user.displayName } });
    } catch {
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // ---- Campaign routes (all require auth) ----

  app.get('/api/campaigns', requireAuth, (req, res) => {
    const memberships = store.getUserCampaigns(req.user!.userId);
    res.json(memberships);
  });

  app.post('/api/campaigns', requireAuth, (req, res) => {
    const { name } = req.body;
    if (!name) {
      res.status(400).json({ error: 'Campaign name is required' });
      return;
    }
    const campaign = store.createCampaign(name, req.user!.userId);
    res.status(201).json(campaign);
  });

  app.get('/api/campaigns/:id', requireAuth, (req, res) => {
    const role = store.getUserRole(req.user!.userId, req.params.id);
    if (!role) {
      res.status(403).json({ error: 'Not a member of this campaign' });
      return;
    }
    const campaign = store.getCampaign(req.params.id);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    // Only DM sees the invite code
    if (role === 'dm') {
      res.json(campaign);
    } else {
      const { inviteCode: _, ...safe } = campaign;
      res.json(safe);
    }
  });

  app.post('/api/campaigns/join', requireAuth, (req, res) => {
    try {
      const { inviteCode } = req.body;
      if (!inviteCode) {
        res.status(400).json({ error: 'Invite code is required' });
        return;
      }
      const campaign = store.joinCampaign(req.user!.userId, inviteCode);
      const role = store.getUserRole(req.user!.userId, campaign.id);
      res.json({ campaign, role });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Join failed';
      const status = message === 'Invalid invite code' ? 404 : 409;
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/campaigns/:id/invite-code', requireAuth, (req, res) => {
    try {
      const inviteCode = store.regenerateInviteCode(req.params.id, req.user!.userId);
      res.json({ inviteCode });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed';
      res.status(403).json({ error: message });
    }
  });

  app.get('/api/campaigns/:id/players', requireAuth, (req, res) => {
    const role = store.getUserRole(req.user!.userId, req.params.id);
    if (!role) {
      res.status(403).json({ error: 'Not a member of this campaign' });
      return;
    }
    const players = store.getCampaignPlayers(req.params.id);
    res.json(players);
  });

  app.delete('/api/campaigns/:id/players/:userId', requireAuth, (req, res) => {
    try {
      store.removePlayerFromCampaign(req.params.id, req.params.userId, req.user!.userId);
      res.json({ success: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed';
      res.status(403).json({ error: message });
    }
  });

  // Static: client dist (production)
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(CLIENT_DIST));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    });
  }

  return app;
}
