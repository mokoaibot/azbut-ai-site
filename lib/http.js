'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const config = require('./config');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon'
};

function origin(req) {
  if (config.SITE_ORIGIN) return config.SITE_ORIGIN;
  const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:' + config.PORT;
  return proto + '://' + host;
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function securityHeaders(res, req) {
  const isProd = Boolean(config.SITE_ORIGIN);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // В dev/preview (SITE_ORIGIN не задан) разрешаем встраивание в live-preview iframe.
  // В продакшене возвращаем строгий SAMEORIGIN.
  if (isProd) res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors " + (isProd ? "'self'" : "*"),
    "img-src 'self' data: https://mc.yandex.ru https://mc.yandex.com",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://mc.yandex.ru https://mc.yandex.com",
    "connect-src 'self' https://mc.yandex.ru https://mc.yandex.com https://www.google-analytics.com",
    "font-src 'self' data:"
  ].join('; '));
  res.setHeader('X-Request-Id', Math.random().toString(36).slice(2, 10));
}

function send(req, res, status, body, headers = {}, opts = {}) {
  securityHeaders(res, req);
  res.statusCode = status;
  const type = headers['Content-Type'] || headers['content-type'] || 'text/html; charset=utf-8';
  res.setHeader('Content-Type', type);
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (opts.cache) res.setHeader('Cache-Control', opts.cache);
  else if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-store');
  let payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body == null ? '' : body), 'utf8');
  const compressible = /text\/|application\/(json|javascript|xml)|image\/svg\+xml/.test(type);
  const accept = String(req.headers['accept-encoding'] || '');
  if (opts.compress !== false && compressible && payload.length > 1024 && /\bgzip\b/.test(accept)) {
    payload = zlib.gzipSync(payload, { level: 6 });
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
  }
  res.setHeader('Content-Length', payload.length);
  if (req.method === 'HEAD') payload = Buffer.alloc(0);
  res.end(payload);
}

function sendHtml(req, res, html, status = 200, opts = {}) {
  send(req, res, status, html, { 'Content-Type': 'text/html; charset=utf-8' }, opts);
}
function sendJson(req, res, data, status = 200, opts = {}) {
  send(req, res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8' }, opts);
}
function sendText(req, res, text, status = 200, type = 'text/plain; charset=utf-8', opts = {}) {
  send(req, res, status, text, { 'Content-Type': type }, opts);
}
function sendRedirect(req, res, location, status = 302) {
  securityHeaders(res, req);
  res.statusCode = status;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}
function sendError(req, res, status, message, lang = 'ru') {
  const title = lang === 'en' ? 'Page not found' : 'Страница не найдена';
  const text = status === 404
    ? (lang === 'en' ? 'The requested page does not exist.' : 'Запрошенная страница не существует.')
    : message;
  sendHtml(req, res, `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${status} — ${title}</title><link rel="stylesheet" href="/assets/css/site.css"></head><body><main class="container error-page"><p class="error-code">${status}</p><h1>${title}</h1><p>${text}</p><a class="btn btn--primary" href="${lang === 'en' ? '/en' : '/'}">${lang === 'en' ? 'Home' : 'На главную'}</a></main></body></html>`, status);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > config.MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseBody(req, buffer) {
  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const raw = buffer.toString('utf8');
  if (!raw) return {};
  if (type === 'application/json') {
    try { return JSON.parse(raw); } catch (_) { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
  }
  if (type === 'application/x-www-form-urlencoded') {
    const out = {};
    for (const pair of raw.split('&')) {
      const i = pair.indexOf('=');
      const k = decodeURIComponent((i < 0 ? pair : pair.slice(0, i)).replace(/\+/g, ' '));
      const v = decodeURIComponent((i < 0 ? '' : pair.slice(i + 1)).replace(/\+/g, ' '));
      out[k] = v;
    }
    return out;
  }
  return {};
}

async function readJson(req) {
  const buf = await readBody(req);
  return parseBody(req, buf);
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/favicon.ico') rel = '/assets/img/favicon.png';
  if (!rel.startsWith('/assets/')) return false;
  const full = path.resolve(config.PUBLIC_DIR, '.' + rel);
  if (!full.startsWith(config.PUBLIC_DIR + path.sep)) return false;
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return false;
  const ext = path.extname(full).toLowerCase();
  const stat = fs.statSync(full);
  const etag = '"' + stat.size.toString(16) + '-' + Math.floor(stat.mtimeMs).toString(16) + '"';
  if (req.headers['if-none-match'] === etag) {
    securityHeaders(res, req);
    res.statusCode = 304; res.end(); return true;
  }
  send(req, res, 200, fs.readFileSync(full), {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'ETag': etag,
    'Last-Modified': stat.mtime.toUTCString()
  }, { cache: 'public, max-age=3600', compress: false });
  return true;
}

module.exports = {
  origin, clientIp, securityHeaders, send, sendHtml, sendJson, sendText, sendRedirect, sendError,
  readBody, parseBody, readJson, serveStatic, MIME
};
