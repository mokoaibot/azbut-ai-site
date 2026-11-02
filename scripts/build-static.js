'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const PORT = 3100;
const BASE = '/azbut-ai-site';
const ORIGIN = 'https://mokoaibot.github.io';
const PUBLIC_ORIGIN = ORIGIN + BASE;

function ensure(d) { fs.mkdirSync(d, { recursive: true }); }
function write(rel, content) {
  const p = path.join(DOCS, rel);
  ensure(path.dirname(p));
  fs.writeFileSync(p, content, 'utf8');
}
function copyDir(src, dst) {
  ensure(dst);
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
function fixHtml(html) {
  let out = html.replaceAll('http://127.0.0.1:' + PORT, ORIGIN);
  // All local assets live under /assets/ -> move them under the repo subpath.
  out = out.replaceAll('/assets/', BASE + '/assets/');
  // Canonical / hreflang / OG / JSON-LD were rendered against the bare origin.
  out = out.replace(/https:\/\/mokoaibot\.github\.io\/(?!azbut-ai-site\/)/g, PUBLIC_ORIGIN + '/');
  // Remaining root-relative internal links/actions -> base path + directory slash.
  out = out.replace(/(href|src|action|value)="(\/[^"]*)"/g, (m, attr, val) => {
    if (val.startsWith('//') || val.startsWith(BASE + '/')) return m;
    let full = BASE + val;
    const qi = full.indexOf('?');
    let pathPart = qi >= 0 ? full.slice(0, qi) : full;
    const query = qi >= 0 ? full.slice(qi) : '';
    if (!pathPart.endsWith('/') && !/\.[a-z0-9]+$/i.test(pathPart)) pathPart += '/';
    return attr + '="' + pathPart + query + '"';
  });
  return out;
}
function outRel(p) {
  const clean = p.replace(/^\/+|\/+$/g, '');
  return clean ? clean + '/index.html' : 'index.html';
}
function load(name) { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', name), 'utf8')); }
function buildPaths() {
  const products = load('products.json').filter(p => p.published);
  const services = load('services.json').filter(s => s.published);
  const staticPaths = ['/', '/catalog', '/services', '/brands', '/about', '/contacts', '/vacancies', '/terms'];
  const out = [];
  for (const lang of ['ru', 'en']) {
    const prefix = lang === 'en' ? '/en' : '';
    for (const p of staticPaths) out.push(prefix + (p === '/' ? '' : p));
    for (const s of services) out.push(prefix + '/services/' + s.slug);
    for (const p of products) out.push(prefix + '/product/' + p.slug);
  }
  return out;
}
function sitemap(paths) {
  const now = new Date().toISOString();
  const urls = paths.map(p => {
    const loc = PUBLIC_ORIGIN + (p === '/' ? '/' : p + '/');
    const priority = p === '/' ? '1.0' : (p.includes('/product/') ? '0.8' : '0.7');
    return '  <url><loc>' + loc + '</loc><lastmod>' + now + '</lastmod><changefreq>weekly</changefreq><priority>' + priority + '</priority></url>';
  });
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.join('\n') + '\n</urlset>\n';
}
function adminStub() {
  return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Админка | АЗБУТ</title><style>body{margin:0;background:#11151b;color:#e9edf3;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;display:grid;place-items:center;min-height:100vh;padding:20px}.card{max-width:620px;background:#181e27;border:1px solid #2c3543;border-radius:14px;padding:32px}h1{color:#fcbf5b;margin-top:0}p{color:#9aa7b8}a{color:#fcbf5b}code{background:#202833;padding:2px 6px;border-radius:5px}</style></head><body><div class="card"><h1>Панель управления требует сервера</h1><p>Эта страница — статическая витрина на GitHub Pages. Админка, JSON-хранилище, загрузка файлов и приём заявок работают только в Node.js-версии сайта.</p><p>Запустите локально: <code>cd azbut-rebuild &amp;&amp; npm start</code>, затем откройте <code>/admin</code> (демо-доступ <code>admin / Azbut2026!</code>).</p><p><a href="../">← Вернуться на сайт</a> · <a href="https://github.com/mokoaibot/azbut-ai-site">Репозиторий на GitHub ↗</a></p></div></body></html>\n';
}

async function main() {
  fs.rmSync(DOCS, { recursive: true, force: true });
  ensure(DOCS);
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { PORT: String(PORT), HOST: '127.0.0.1', SITE_ORIGIN: ORIGIN }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverLog = '';
  child.stdout.on('data', d => { serverLog += d.toString(); });
  child.stderr.on('data', d => { serverLog += d.toString(); });

  async function waitHealth() {
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch('http://127.0.0.1:' + PORT + '/health');
        if (r.ok) return;
      } catch (_) {}
      await new Promise(r => setTimeout(r, 200));
    }
    throw new Error('SSR server did not start:\n' + serverLog);
  }

  const paths = buildPaths();
  try {
    await waitHealth();
    for (const p of paths) {
      const r = await fetch('http://127.0.0.1:' + PORT + p, { headers: { Accept: 'text/html' } });
      const text = await r.text();
      if (!r.ok) throw new Error('Failed ' + p + ' -> ' + r.status);
      write(outRel(p), fixHtml(text));
    }
    const r404 = await fetch('http://127.0.0.1:' + PORT + '/no-such-page-xyz');
    write('404.html', fixHtml(await r404.text()));
  } finally {
    child.kill('SIGTERM');
  }

  copyDir(path.join(ROOT, 'public', 'assets'), path.join(DOCS, 'assets'));
  const siteJs = fs.readFileSync(path.join(ROOT, 'public', 'assets', 'js', 'site.js'), 'utf8');
  write('assets/js/site.js', 'window.__AZBUT_STATIC__=true;\n' + siteJs);
  write('.nojekyll', '');
  write('robots.txt', [
    'User-agent: *', 'Allow: /',
    'Disallow: ' + BASE + '/admin/',
    'Disallow: ' + BASE + '/api/',
    'Disallow: ' + BASE + '/data/', '',
    'Sitemap: ' + PUBLIC_ORIGIN + '/sitemap.xml', ''
  ].join('\n'));
  write('sitemap.xml', sitemap(paths));
  write('admin/index.html', adminStub());

  let count = 0;
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.isDirectory()) walk(path.join(d, e.name)); else count++; } })(DOCS);
  console.log('[build:static] docs/ готов: ' + count + ' файлов, ' + paths.length + ' страниц (RU+EN)');
  console.log('[build:static] URL: ' + PUBLIC_ORIGIN + '/');
}

main().catch(e => { console.error('[build:static] ОШИБКА', e); process.exit(1); });
