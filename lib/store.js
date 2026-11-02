'use strict';
const fs = require('fs');
const path = require('path');
const config = require('./config');

const NAMES = ['settings', 'pages', 'services', 'brands', 'products', 'leads', 'users'];

function ensureDirs() {
  for (const dir of [config.DATA_DIR, config.SEED_DIR, config.BACKUP_DIR, config.PUBLIC_DIR, config.UPLOAD_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(config.AUDIT_FILE)) fs.writeFileSync(config.AUDIT_FILE, '');
}

function fileFor(name) {
  if (!NAMES.includes(name)) throw new Error('Unknown store: ' + name);
  return path.join(config.DATA_DIR, name + '.json');
}

function ensureSeed() {
  ensureDirs();
  for (const name of NAMES) {
    const target = fileFor(name);
    if (!fs.existsSync(target)) {
      const seed = path.join(config.SEED_DIR, name + '.json');
      if (!fs.existsSync(seed)) throw new Error('Missing seed for ' + name);
      fs.copyFileSync(seed, target);
    }
  }
}

function read(name) {
  ensureSeed();
  return JSON.parse(fs.readFileSync(fileFor(name), 'utf8'));
}

function backup(name) {
  const src = fileFor(name);
  if (!fs.existsSync(src)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(src, path.join(config.BACKUP_DIR, name + '.' + stamp + '.json'));
  const list = fs.readdirSync(config.BACKUP_DIR)
    .filter(f => f.startsWith(name + '.'))
    .sort();
  while (list.length > 12) {
    fs.unlinkSync(path.join(config.BACKUP_DIR, list.shift()));
  }
}

function appendAudit(entry) {
  ensureDirs();
  const row = Object.assign({ ts: new Date().toISOString(), ip: '' }, entry);
  fs.appendFileSync(config.AUDIT_FILE, JSON.stringify(row) + '\n', 'utf8');
}

function getAudit(limit = 100) {
  ensureDirs();
  if (!fs.existsSync(config.AUDIT_FILE)) return [];
  const lines = fs.readFileSync(config.AUDIT_FILE, 'utf8').trim().split('\n').filter(Boolean);
  return lines.slice(-limit).reverse().map(line => {
    try { return JSON.parse(line); } catch (_) { return { ts: '', action: 'raw', target: line.slice(0, 120) }; }
  });
}

function write(name, data, meta = {}) {
  ensureSeed();
  backup(name);
  const target = fileFor(name);
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, target);
  appendAudit({
    actor: meta.actor || 'system',
    action: meta.action || 'write',
    target: name + (meta.target ? ':' + meta.target : ''),
    ip: meta.ip || ''
  });
  return data;
}

function update(name, mutate, meta = {}) {
  const current = read(name);
  const next = mutate(current);
  return write(name, next, meta);
}

function listMedia() {
  ensureDirs();
  return fs.readdirSync(config.UPLOAD_DIR)
    .filter(f => /\.(webp|png|jpe?g|gif)$/i.test(f))
    .map(f => {
      const st = fs.statSync(path.join(config.UPLOAD_DIR, f));
      return { name: f, url: '/assets/uploads/' + f, size: st.size, modified: st.mtime.toISOString() };
    })
    .sort((a, b) => b.modified.localeCompare(a.modified));
}

function reset() {
  ensureDirs();
  for (const name of NAMES) {
    const seed = path.join(config.SEED_DIR, name + '.json');
    if (fs.existsSync(seed)) fs.copyFileSync(seed, fileFor(name));
  }
  appendAudit({ actor: 'system', action: 'reset', target: 'all' });
}

module.exports = { ensureDirs, ensureSeed, read, write, update, appendAudit, getAudit, listMedia, reset, fileFor, NAMES };
