'use strict';
const crypto = require('crypto');
const config = require('./config');
const store = require('./store');

const sessions = new Map();
const attempts = new Map();

function hashPassword(password, salt = crypto.randomBytes(16)) {
  const hash = crypto.scryptSync(String(password), salt, 64);
  return salt.toString('hex') + ':' + hash.toString('hex');
}

function verifyPassword(password, stored) {
  try {
    const [saltHex, hashHex] = String(stored).split(':');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch (_) { return false; }
}

function ensureAdmin() {
  const users = store.read('users');
  if (Array.isArray(users) && users.length) return users[0];
  const admin = {
    id: 'usr-1',
    username: 'admin',
    passwordHash: hashPassword(config.ADMIN_PASSWORD),
    role: 'admin',
    createdAt: new Date().toISOString()
  };
  store.write('users', [admin], { actor: 'system', action: 'create-admin', target: 'admin' });
  return admin;
}

function hmac(value) {
  return crypto.createHmac('sha256', config.SESSION_SECRET).update(value).digest('hex');
}

function sign(token) { return token + '.' + hmac('session:' + token); }

function verifySigned(value) {
  if (!value || typeof value !== 'string') return null;
  const idx = value.lastIndexOf('.');
  if (idx < 1) return null;
  const token = value.slice(0, idx);
  const sig = value.slice(idx + 1);
  const expected = hmac('session:' + token);
  const a = Buffer.from(sig); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return token;
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function serializeCookie(name, value, opts = {}) {
  const bits = [name + '=' + encodeURIComponent(value)];
  bits.push('Path=' + (opts.path || '/'));
  if (opts.maxAge) bits.push('Max-Age=' + opts.maxAge);
  if (opts.httpOnly !== false) bits.push('HttpOnly');
  bits.push('SameSite=' + (opts.sameSite || 'Lax'));
  if (opts.secure) bits.push('Secure');
  return bits.join('; ');
}

function createSession(res, user) {
  const token = crypto.randomBytes(32).toString('hex');
  const csrf = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { user: { id: user.id, username: user.username, role: user.role }, csrf, expires: Date.now() + config.SESSION_TTL });
  res.setHeader('Set-Cookie', serializeCookie('azbut_sid', sign(token), { maxAge: Math.floor(config.SESSION_TTL / 1000), secure: false }));
  return { token, csrf };
}

function getSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = verifySigned(cookies.azbut_sid);
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (s.expires < Date.now()) { sessions.delete(token); return null; }
  s.expires = Date.now() + config.SESSION_TTL;
  return Object.assign({ token }, s);
}

function destroySession(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const token = verifySigned(cookies.azbut_sid);
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', serializeCookie('azbut_sid', '', { maxAge: 0 }));
}

function requireAuth(req, res, opts = {}) {
  const session = getSession(req);
  if (session) return session;
  if (opts.json) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
  } else {
    res.statusCode = 302;
    res.setHeader('Location', '/admin/login?next=' + encodeURIComponent(req.url || '/admin'));
    res.end();
  }
  return null;
}

function checkCsrf(req, session) {
  if (!session) return false;
  const header = req.headers['x-csrf-token'];
  const token = Array.isArray(header) ? header[0] : header;
  const bodyToken = req.body && req.body._csrf;
  const candidate = token || bodyToken;
  if (!candidate || typeof candidate !== 'string') return false;
  const a = Buffer.from(candidate); const b = Buffer.from(session.csrf);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function publicToken(ip) {
  const period = Math.floor(Date.now() / config.CSRF_TTL);
  const sig = hmac('public:' + ip + ':' + period);
  return period + '.' + sig;
}

function verifyPublicToken(token, ip) {
  if (!token || typeof token !== 'string') return false;
  const [periodStr, sig] = token.split('.');
  const period = Number(periodStr);
  if (!Number.isFinite(period) || !sig) return false;
  const nowPeriod = Math.floor(Date.now() / config.CSRF_TTL);
  if (Math.abs(nowPeriod - period) > 1) return false;
  const expected = hmac('public:' + ip + ':' + period);
  const a = Buffer.from(sig); const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function canAttempt(ip) {
  const rec = attempts.get(ip);
  if (!rec) return true;
  if (rec.until && rec.until > Date.now()) return false;
  if (rec.until && rec.until <= Date.now()) attempts.delete(ip);
  return true;
}

function recordFailure(ip) {
  const rec = attempts.get(ip) || { count: 0, until: 0 };
  rec.count += 1;
  if (rec.count >= 5) rec.until = Date.now() + 10 * 60 * 1000;
  attempts.set(ip, rec);
}

function recordSuccess(ip) { attempts.delete(ip); }

module.exports = {
  hashPassword, verifyPassword, ensureAdmin, createSession, getSession, destroySession,
  requireAuth, checkCsrf, publicToken, verifyPublicToken, canAttempt, recordFailure, recordSuccess,
  parseCookies
};
