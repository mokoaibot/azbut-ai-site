'use strict';
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

module.exports = Object.freeze({
  ROOT,
  DATA_DIR: path.join(ROOT, 'data'),
  SEED_DIR: path.join(ROOT, 'seed'),
  BACKUP_DIR: path.join(ROOT, 'data', 'backups'),
  PUBLIC_DIR: path.join(ROOT, 'public'),
  UPLOAD_DIR: path.join(ROOT, 'public', 'assets', 'uploads'),
  AUDIT_FILE: path.join(ROOT, 'data', 'audit.log'),
  HOST: process.env.HOST || '0.0.0.0',
  PORT: Number(process.env.PORT || 3000),
  SESSION_SECRET: process.env.SESSION_SECRET || 'azbut-dev-secret-change-in-production',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'Azbut2026!',
  SITE_ORIGIN: (process.env.SITE_ORIGIN || '').replace(/\/$/, ''),
  MAX_BODY_BYTES: 6 * 1024 * 1024,
  MAX_UPLOAD_BYTES: 3 * 1024 * 1024,
  SESSION_TTL: 7 * 24 * 60 * 60 * 1000,
  CSRF_TTL: 2 * 60 * 60 * 1000,
  LANGUAGES: ['ru', 'en'],
  DEFAULT_LANG: 'ru'
});
