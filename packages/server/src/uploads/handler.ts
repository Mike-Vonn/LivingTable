import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../auth/middleware.js';
import { store } from '../app.js';
import { DATA_DIR } from '../config.js';

const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const campaignId = req.body.campaignId || req.query.campaignId;
    const dir = path.join(UPLOADS_DIR, campaignId || 'misc');
    mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPEG, and WEBP images are allowed'));
    }
  },
});

export const uploadRouter = Router();

uploadRouter.post('/api/upload/map', requireAuth, upload.single('map'), (req, res) => {
  const campaignId = req.body.campaignId || req.query.campaignId;
  if (!campaignId) {
    res.status(400).json({ error: 'campaignId is required' });
    return;
  }

  const role = store.getUserRole(req.user!.userId, campaignId);
  if (role !== 'dm') {
    res.status(403).json({ error: 'Only the DM can upload maps' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  const url = `/uploads/${campaignId}/${req.file.filename}`;
  res.json({ url });
});
