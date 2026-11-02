'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./lib/config');
const store = require('./lib/store');
const auth = require('./lib/auth');
const httpUtil = require('./lib/http');
const R = require('./lib/render');
const V = require('./lib/validation');
const views = require('./lib/views');

const LANG_PREFIX = { ru: '', en: '/en' };

function log(...args) { console.log('[azbut]', ...args); }

function xmlEscape(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function pageContext(req, lang, basePath, query) {
  const settings = store.read('settings');
  const pages = store.read('pages');
  const services = store.read('services').filter(s => s.published);
  const brands = store.read('brands').filter(b => b.published);
  const products = store.read('products').filter(p => p.published);
  const leads = store.read('leads');
  return {
    req, lang, basePath, query: query || '',
    prefix: LANG_PREFIX[lang],
    origin: httpUtil.origin(req),
    settings, pages, services, brands, products, leads,
    csrfToken: auth.publicToken(httpUtil.clientIp(req))
  };
}

function respondPage(req, res, cfg) {
  const ctx = pageContext(req, cfg.lang || 'ru', cfg.basePath || '/', cfg.query);
  const body = typeof cfg.body === 'function' ? cfg.body(ctx) : cfg.body;
  const title = typeof cfg.title === 'function' ? cfg.title(ctx) : cfg.title;
  const description = typeof cfg.description === 'function' ? cfg.description(ctx) : cfg.description;
  const structuredData = typeof cfg.structuredData === 'function' ? cfg.structuredData(ctx) : (cfg.structuredData || []);
  const html = R.layout({
    req, lang: ctx.lang, basePath: ctx.basePath, query: ctx.query,
    title, description, body, settings: ctx.settings,
    structuredData, csrfToken: ctx.csrfToken,
    preloadHero: !!cfg.preloadHero, noindex: !!cfg.noindex,
    pageClass: cfg.pageClass || '', ogImage: cfg.ogImage,
    status: cfg.status || 200
  });
  httpUtil.sendHtml(req, res, html, cfg.status || 200);
}

function baseSchemas(ctx) {
  return [R.organizationSchema(ctx.settings, ctx.origin), R.localBusinessSchema(ctx.settings, ctx.origin)];
}

function crumbSchema(ctx, items) { return R.breadcrumbSchema(items, ctx.origin); }

function notFound(req, res, lang) {
  respondPage(req, res, {
    lang, basePath: '/', status: 404, noindex: true,
    title: lang === 'en' ? 'Page not found | AZBUT' : 'Страница не найдена | АЗБУТ',
    description: lang === 'en' ? 'The requested page does not exist.' : 'Запрошенная страница не существует.',
    body: () => views.notFoundBody(lang)
  });
}

/* ------------------------------ public pages ------------------------------ */

function homeRoute(req, res, lang, search) {
  respondPage(req, res, {
    lang, basePath: '/', query: search, preloadHero: true,
    title: ctx => R.t(ctx.pages.home.seoTitle || ctx.pages.home.title, lang),
    description: ctx => R.t(ctx.pages.home.seoDescription || ctx.pages.home.description, lang),
    body: ctx => views.home(ctx),
    structuredData: ctx => baseSchemas(ctx).concat([R.websiteSchema(ctx.settings, ctx.origin, lang)])
  });
}

function catalogRoute(req, res, lang, search, params) {
  const size = 8;
  const filters = {
    q: V.cleanText(params.get('q'), 120),
    brand: V.cleanText(params.get('brand'), 80),
    category: V.cleanText(params.get('category'), 80),
    sort: V.cleanText(params.get('sort'), 20),
    page: Math.max(1, Number(params.get('page')) || 1)
  };
  const ctx = pageContext(req, lang, '/catalog', search);
  let list = ctx.products.slice();
  if (filters.q) {
    const q = filters.q.toLowerCase();
    list = list.filter(p => [R.t(p.title, 'ru'), R.t(p.title, 'en'), p.sku, p.brand, R.t(p.summary, 'ru'), R.t(p.summary, 'en')]
      .some(v => String(v || '').toLowerCase().includes(q)));
  }
  if (filters.brand) list = list.filter(p => p.brand === filters.brand);
  if (filters.category) list = list.filter(p => p.category === filters.category);
  if (filters.sort === 'price_asc') list.sort((a, b) => (a.price == null ? Infinity : a.price) - (b.price == null ? Infinity : b.price));
  else if (filters.sort === 'price_desc') list.sort((a, b) => (b.price == null ? -Infinity : b.price) - (a.price == null ? -Infinity : a.price));
  else if (filters.sort === 'name') list.sort((a, b) => R.t(a.title, lang).localeCompare(R.t(b.title, lang)));
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(filters.page, pages);
  const slice = list.slice((page - 1) * size, page * size);
  const L = lang === 'en'
    ? { title: 'Catalog of spare parts and lighting | AZBUT', description: 'Spare parts, components, drives and professional lighting. Filter by brand, category and part number.' }
    : { title: 'Каталог запчастей и иллюминации | АЗБУТ', description: 'Запчасти, комплектующие, приводы и профессиональная иллюминация. Фильтр по бренду, категории и артикулу.' };
  respondPage(req, res, {
    lang, basePath: '/catalog', query: search,
    title: L.title, description: L.description,
    body: c => views.catalog(Object.assign({}, c, { products: slice, filters, total, page, pages, csrfToken: c.csrfToken })),
    structuredData: c => baseSchemas(c).concat([
      crumbSchema(c, [{ label: lang === 'en' ? 'Home' : 'Главная', href: LANG_PREFIX[lang] || '/' }, { label: lang === 'en' ? 'Catalog' : 'Каталог' }]),
      R.itemListSchema(slice, lang, c.origin, '/catalog')
    ])
  });
}

function productRoute(req, res, lang, slug) {
  const ctx = pageContext(req, lang, '/product/' + slug, '');
  const product = ctx.products.find(p => p.slug === slug);
  if (!product) return notFound(req, res, lang);
  const related = ctx.products.filter(p => p.id !== product.id && p.category === product.category).slice(0, 4);
  const title = R.t(product.seo && product.seo.title, lang) || (R.t(product.title, lang) + R.t(ctx.settings.seo.titleSuffix, lang));
  const description = R.t(product.seo && product.seo.description, lang) || R.t(product.summary, lang);
  const crumbs = [
    { label: lang === 'en' ? 'Home' : 'Главная', href: LANG_PREFIX[lang] || '/' },
    { label: lang === 'en' ? 'Catalog' : 'Каталог', href: LANG_PREFIX[lang] + '/catalog' },
    { label: R.t(product.title, lang) }
  ];
  respondPage(req, res, {
    lang, basePath: '/product/' + slug,
    title, description, ogImage: product.image,
    body: c => views.product(Object.assign({}, c, { product, related, csrfToken: c.csrfToken })),
    structuredData: c => baseSchemas(c).concat([
      crumbSchema(c, crumbs),
      R.productSchema(product, lang, c.origin, c.origin + (lang === 'en' ? '/en' : '') + '/product/' + slug)
    ])
  });
}

function servicesRoute(req, res, lang) {
  const L = lang === 'en'
    ? { title: 'Services | AZBUT', description: 'Comprehensive supply, foreign trade, logistics and turnkey lighting installation.' }
    : { title: 'Услуги | АЗБУТ', description: 'Комплексное снабжение, ВЭД, логистика и монтаж иллюминации под ключ.' };
  respondPage(req, res, {
    lang, basePath: '/services', title: L.title, description: L.description,
    body: c => views.servicesIndex(c),
    structuredData: c => baseSchemas(c).concat([crumbSchema(c, [{ label: lang === 'en' ? 'Home' : 'Главная', href: LANG_PREFIX[lang] || '/' }, { label: lang === 'en' ? 'Services' : 'Услуги' }])])
  });
}

function serviceRoute(req, res, lang, slug) {
  const ctx = pageContext(req, lang, '/services/' + slug, '');
  const service = ctx.services.find(s => s.slug === slug);
  if (!service) return notFound(req, res, lang);
  const title = R.t(service.seo && service.seo.title, lang) || (R.t(service.title, lang) + R.t(ctx.settings.seo.titleSuffix, lang));
  const description = R.t(service.seo && service.seo.description, lang) || R.t(service.summary, lang);
  respondPage(req, res, {
    lang, basePath: '/services/' + slug, title, description, ogImage: service.image,
    body: c => views.service(Object.assign({}, c, { service, services: c.services, csrfToken: c.csrfToken })),
    structuredData: c => baseSchemas(c).concat([crumbSchema(c, [
      { label: lang === 'en' ? 'Home' : 'Главная', href: LANG_PREFIX[lang] || '/' },
      { label: lang === 'en' ? 'Services' : 'Услуги', href: LANG_PREFIX[lang] + '/services' },
      { label: R.t(service.title, lang) }
    ])])
  });
}

function brandsRoute(req, res, lang) {
  const L = lang === 'en'
    ? { title: 'Brands | AZBUT', description: 'We supply spare parts for John Deere, CLAAS, CNH, DEUTZ, МТЗ, АМКАДОР, GOMSELMASH and Rostselmash.' }
    : { title: 'Бренды | АЗБУТ', description: 'Поставляем запчасти для John Deere, CLAAS, CNH, DEUTZ, МТЗ, АМКАДОР, Гомсельмаш и Ростсельмаш.' };
  respondPage(req, res, {
    lang, basePath: '/brands', title: L.title, description: L.description,
    body: c => views.brandsIndex(c),
    structuredData: c => baseSchemas(c).concat([crumbSchema(c, [{ label: lang === 'en' ? 'Home' : 'Главная', href: LANG_PREFIX[lang] || '/' }, { label: lang === 'en' ? 'Brands' : 'Бренды' }])])
  });
}

function simpleRoute(req, res, lang, key) {
  const ctx0 = pageContext(req, lang, '/' + key, '');
  const p = ctx0.pages[key];
  if (!p) return notFound(req, res, lang);
  respondPage(req, res, {
    lang, basePath: '/' + key,
    title: R.t(p.seoTitle || p.title, lang), description: R.t(p.seoDescription || p.description, lang),
    body: c => key === 'contacts' ? views.contacts(c) : views.simplePage(c, key),
    structuredData: c => baseSchemas(c).concat([crumbSchema(c, [{ label: lang === 'en' ? 'Home' : 'Главная', href: LANG_PREFIX[lang] || '/' }, { label: R.t(p.h1, lang) }])])
  });
}

/* ------------------------------ public API ------------------------------ */

async function leadRoute(req, res) {
  if (req.method !== 'POST') return httpUtil.sendJson(req, res, { ok: false, error: 'Method not allowed' }, 405);
  const body = await httpUtil.readJson(req);
  const ip = httpUtil.clientIp(req);
  const token = body._csrf || req.headers['x-csrf-token'];
  if (!auth.verifyPublicToken(token, ip)) return httpUtil.sendJson(req, res, { ok: false, error: 'Invalid CSRF token' }, 403);
  let lead;
  try { lead = V.validateLead(body); }
  catch (err) { return httpUtil.sendJson(req, res, { ok: false, error: err.message, fields: err.fields || [] }, err.status || 422); }
  store.update('leads', list => [lead].concat(list), { actor: 'visitor', action: 'create-lead', target: lead.id, ip });
  return httpUtil.sendJson(req, res, { ok: true, id: lead.id });
}

/* ------------------------------ sitemap / robots ------------------------------ */

function sitemapRoute(req, res) {
  const origin = httpUtil.origin(req);
  const settings = store.read('settings');
  const services = store.read('services').filter(s => s.published);
  const products = store.read('products').filter(p => p.published);
  const staticPaths = ['/', '/catalog', '/services', '/brands', '/about', '/contacts', '/vacancies', '/terms'];
  const urls = [];
  for (const lang of ['ru', 'en']) {
    const prefix = LANG_PREFIX[lang];
    for (const p of staticPaths) urls.push({ loc: origin + prefix + (p === '/' ? '' : p), lastmod: settings.updatedAt, priority: p === '/' ? '1.0' : '0.7' });
    for (const s of services) urls.push({ loc: origin + prefix + '/services/' + s.slug, lastmod: s.updatedAt, priority: '0.6' });
    for (const p of products) urls.push({ loc: origin + prefix + '/product/' + p.slug, lastmod: p.updatedAt, priority: '0.8' });
  }
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(u => `  <url><loc>${xmlEscape(u.loc)}</loc><lastmod>${xmlEscape(u.lastmod)}</lastmod><changefreq>weekly</changefreq><priority>${u.priority}</priority></url>`).join('\n') +
    '\n</urlset>';
  httpUtil.sendText(req, res, xml, 200, 'application/xml; charset=utf-8', { cache: 'public, max-age=3600' });
}

function robotsRoute(req, res) {
  const origin = httpUtil.origin(req);
  httpUtil.sendText(req, res, [
    'User-agent: *', 'Allow: /', 'Disallow: /admin/', 'Disallow: /admin/api/',
    'Disallow: /api/', 'Disallow: /data/', '', 'Sitemap: ' + origin + '/sitemap.xml', ''
  ].join('\n'), 200, 'text/plain; charset=utf-8', { cache: 'public, max-age=3600' });
}

/* ------------------------------ auth / admin ------------------------------ */

async function parseReqBody(req) {
  const buf = await httpUtil.readBody(req);
  req.body = httpUtil.parseBody(req, buf);
  return req.body;
}

function safeNext(value) {
  const v = String(value || '/admin');
  return v.startsWith('/admin') && !v.startsWith('//') ? v : '/admin';
}

async function loginRoute(req, res, params) {
  const session = auth.getSession(req);
  if (session && req.method === 'GET') return httpUtil.sendRedirect(req, res, '/admin');
  if (req.method === 'GET') {
    const csrfToken = auth.publicToken(httpUtil.clientIp(req));
    return httpUtil.sendHtml(req, res, R.adminLoginPage({ csrfToken, error: '', next: safeNext(params.get('next')) }));
  }
  if (req.method !== 'POST') return httpUtil.sendText(req, res, 'Method not allowed', 405);
  const body = await parseReqBody(req);
  const ip = httpUtil.clientIp(req);
  const csrfToken = auth.publicToken(ip);
  const errorHtml = msg => httpUtil.sendHtml(req, res, R.adminLoginPage({ csrfToken, error: msg, next: safeNext(body.next) }), 401);
  if (!auth.verifyPublicToken(body._csrf, ip)) return errorHtml('Недействительный токен формы. Обновите страницу.');
  if (!auth.canAttempt(ip)) return errorHtml('Слишком много попыток. Попробуйте через 10 минут.');
  const users = store.read('users');
  const user = users.find(u => u.username === V.cleanText(body.username, 60));
  if (!user || !auth.verifyPassword(body.password || '', user.passwordHash)) {
    auth.recordFailure(ip);
    store.appendAudit({ actor: 'guest', action: 'login-failed', target: V.cleanText(body.username, 60), ip });
    return errorHtml('Неверный логин или пароль.');
  }
  auth.recordSuccess(ip);
  auth.createSession(res, user);
  store.appendAudit({ actor: user.username, action: 'login', target: 'admin', ip });
  return httpUtil.sendRedirect(req, res, safeNext(body.next));
}

async function logoutRoute(req, res) {
  const body = await parseReqBody(req);
  const session = auth.getSession(req);
  if (!session || !auth.checkCsrf(req, Object.assign({}, session, { csrf: session.csrf }))) {
    return httpUtil.sendText(req, res, 'Forbidden', 403);
  }
  store.appendAudit({ actor: session.user.username, action: 'logout', target: 'admin', ip: httpUtil.clientIp(req) });
  auth.destroySession(req, res);
  return httpUtil.sendRedirect(req, res, '/admin/login');
}

function adminShellRoute(req, res) {
  const session = auth.requireAuth(req, res);
  if (!session) return;
  const settings = store.read('settings');
  return httpUtil.sendHtml(req, res, R.adminShell({ csrfToken: session.csrf, user: session.user, settings }));
}

/* ------------------------------ admin API ------------------------------ */

function ok(req, res, extra = {}) { return httpUtil.sendJson(req, res, Object.assign({ ok: true }, extra)); }
function fail(req, res, status, error) { return httpUtil.sendJson(req, res, { ok: false, error }, status); }

function loc(value, fallback) {
  if (value && typeof value === 'object' && ('ru' in value || 'en' in value)) {
    const ru = V.cleanText(value.ru || fallback, 4000);
    const en = V.cleanText(value.en || value.ru || fallback, 4000);
    return { ru, en };
  }
  const v = V.cleanText(value || fallback, 4000);
  return { ru: v, en: v };
}

function normalizeService(payload, existing = {}) {
  const slug = V.slugify(payload.slug || (payload.title && payload.title.ru) || existing.slug);
  if (!V.isSlug(slug)) throw Object.assign(new Error('Invalid slug'), { status: 422 });
  const title = loc(payload.title, existing.title && existing.title.ru);
  const summary = loc(payload.summary, existing.summary && existing.summary.ru);
  const body = loc(payload.body, existing.body && existing.body.ru);
  return {
    id: existing.id || payload.id || V.id('srv'), slug,
    title, summary, body,
    icon: V.cleanText(payload.icon || existing.icon || 'gear', 30),
    image: V.cleanUrl(payload.image || existing.image) || '/assets/img/hero-640.webp',
    order: Number(payload.order) || existing.order || 99,
    published: V.bool(payload.published),
    updatedAt: new Date().toISOString(),
    seo: {
      title: loc(payload.seo && payload.seo.title, title.ru),
      description: loc(payload.seo && payload.seo.description, summary.ru)
    }
  };
}

function normalizeBrand(payload, existing = {}) {
  const slug = V.slugify(payload.slug || payload.name || existing.slug);
  if (!V.isSlug(slug)) throw Object.assign(new Error('Invalid slug'), { status: 422 });
  return {
    id: existing.id || payload.id || V.id('br'), slug,
    name: V.cleanText(payload.name || existing.name, 100),
    description: loc(payload.description, existing.description && existing.description.ru),
    published: V.bool(payload.published),
    updatedAt: new Date().toISOString()
  };
}

function normalizePage(payload, existing) {
  const next = Object.assign({}, existing, { updatedAt: new Date().toISOString() });
  const keys = ['title', 'description', 'h1', 'heroTitle', 'heroSubtitle', 'heroCta', 'aboutTitle', 'aboutText', 'body', 'seoTitle', 'seoDescription'];
  for (const k of keys) {
    if (payload[k] !== undefined) next[k] = loc(payload[k], existing[k] && existing[k].ru);
  }
  if (Array.isArray(payload.stats)) next.stats = payload.stats;
  return next;
}

function normalizeSettings(payload, existing) {
  const next = Object.assign({}, existing, { updatedAt: new Date().toISOString() });
  const locKeys = ['siteName', 'tagline', 'shortDescription', 'address', 'workingHours', 'footerNote', 'companyLegal'];
  for (const k of locKeys) if (payload[k] !== undefined) next[k] = loc(payload[k], existing[k] && existing[k].ru);
  const strKeys = ['phone1', 'phone2', 'email', 'unp', 'whatsapp', 'telegram', 'viber', 'linkedin', 'instagram', 'wechat'];
  for (const k of strKeys) if (payload[k] !== undefined) next[k] = /whatsapp|telegram|viber|linkedin|instagram|wechat/.test(k) ? V.cleanUrl(payload[k], true) : V.cleanText(payload[k], 300);
  if (payload.analytics) next.analytics = { yandexMetrika: V.cleanText(payload.analytics.yandexMetrika, 30), ga4: V.cleanText(payload.analytics.ga4, 30) };
  return next;
}

function uniqueSlug(list, slug, excludeId) {
  return !list.some(x => x.slug === slug && x.id !== excludeId);
}

async function adminApiRoute(req, res, pathname) {
  const session = auth.requireAuth(req, res, { json: true });
  if (!session) return;
  const apiPath = pathname.slice('/admin/api'.length) || '/';
  const parts = apiPath.split('/').filter(Boolean);
  const method = req.method;
  const actor = session.user.username;
  const ip = httpUtil.clientIp(req);
  if (method !== 'GET') {
    await parseReqBody(req);
    if (!auth.checkCsrf(req, session)) return fail(req, res, 403, 'Invalid CSRF token');
  }

  if (method === 'GET' && apiPath === '/bootstrap') {
    const settings = store.read('settings');
    const pages = store.read('pages');
    const services = store.read('services');
    const brands = store.read('brands');
    const products = store.read('products');
    const leads = store.read('leads').slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const media = store.listMedia();
    const audit = store.getAudit(100);
    return ok(req, res, {
      settings, pages, services, brands, products, leads, media, audit,
      counts: {
        products: products.length, publishedProducts: products.filter(p => p.published).length,
        services: services.length, brands: brands.length, leads: leads.length,
        newLeads: leads.filter(l => l.status === 'new').length, media: media.length
      },
      user: session.user
    });
  }

  if (method === 'GET' && apiPath === '/audit') return ok(req, res, { audit: store.getAudit(300) });

  /* Products */
  if (parts[0] === 'products') {
    const products = store.read('products');
    if (method === 'POST' && parts.length === 1) {
      const p = V.validateProduct(req.body, {});
      if (!uniqueSlug(products, p.slug)) return fail(req, res, 409, 'Slug already exists');
      products.push(p);
      store.write('products', products, { actor, action: 'create-product', target: p.id, ip });
      return ok(req, res, { product: p });
    }
    if (parts.length === 2) {
      const idx = products.findIndex(p => p.id === parts[1]);
      if (idx < 0) return fail(req, res, 404, 'Not found');
      if (method === 'PUT') {
        const p = V.validateProduct(req.body, products[idx]);
        if (!uniqueSlug(products, p.slug, p.id)) return fail(req, res, 409, 'Slug already exists');
        products[idx] = p;
        store.write('products', products, { actor, action: 'update-product', target: p.id, ip });
        return ok(req, res, { product: p });
      }
      if (method === 'DELETE') {
        const [removed] = products.splice(idx, 1);
        store.write('products', products, { actor, action: 'delete-product', target: removed.id, ip });
        return ok(req, res, { id: removed.id });
      }
    }
  }

  /* Services */
  if (parts[0] === 'services') {
    const services = store.read('services');
    if (method === 'POST' && parts.length === 1) {
      const s = normalizeService(req.body, {});
      if (!uniqueSlug(services, s.slug)) return fail(req, res, 409, 'Slug already exists');
      services.push(s);
      store.write('services', services, { actor, action: 'create-service', target: s.id, ip });
      return ok(req, res, { service: s });
    }
    if (parts.length === 2) {
      const idx = services.findIndex(s => s.id === parts[1]);
      if (idx < 0) return fail(req, res, 404, 'Not found');
      if (method === 'PUT') {
        const s = normalizeService(req.body, services[idx]);
        if (!uniqueSlug(services, s.slug, s.id)) return fail(req, res, 409, 'Slug already exists');
        services[idx] = s;
        store.write('services', services, { actor, action: 'update-service', target: s.id, ip });
        return ok(req, res, { service: s });
      }
      if (method === 'DELETE') {
        const [removed] = services.splice(idx, 1);
        store.write('services', services, { actor, action: 'delete-service', target: removed.id, ip });
        return ok(req, res, { id: removed.id });
      }
    }
  }

  /* Brands */
  if (parts[0] === 'brands') {
    const brands = store.read('brands');
    if (method === 'POST' && parts.length === 1) {
      const b = normalizeBrand(req.body, {});
      if (!uniqueSlug(brands, b.slug)) return fail(req, res, 409, 'Slug already exists');
      brands.push(b);
      store.write('brands', brands, { actor, action: 'create-brand', target: b.id, ip });
      return ok(req, res, { brand: b });
    }
    if (parts.length === 2) {
      const idx = brands.findIndex(b => b.id === parts[1]);
      if (idx < 0) return fail(req, res, 404, 'Not found');
      if (method === 'PUT') {
        const b = normalizeBrand(req.body, brands[idx]);
        if (!uniqueSlug(brands, b.slug, b.id)) return fail(req, res, 409, 'Slug already exists');
        brands[idx] = b;
        store.write('brands', brands, { actor, action: 'update-brand', target: b.id, ip });
        return ok(req, res, { brand: b });
      }
      if (method === 'DELETE') {
        const [removed] = brands.splice(idx, 1);
        store.write('brands', brands, { actor, action: 'delete-brand', target: removed.id, ip });
        return ok(req, res, { id: removed.id });
      }
    }
  }

  /* Pages */
  if (parts[0] === 'pages' && parts.length === 2 && method === 'PUT') {
    const pages = store.read('pages');
    const key = parts[1];
    if (!Object.prototype.hasOwnProperty.call(pages, key)) return fail(req, res, 404, 'Unknown page');
    pages[key] = normalizePage(req.body, pages[key]);
    store.write('pages', pages, { actor, action: 'update-page', target: key, ip });
    return ok(req, res, { page: pages[key] });
  }

  /* Settings */
  if (apiPath === '/settings' && method === 'PUT') {
    const settings = normalizeSettings(req.body, store.read('settings'));
    store.write('settings', settings, { actor, action: 'update-settings', target: 'settings', ip });
    return ok(req, res, { settings });
  }

  /* Leads */
  if (parts[0] === 'leads' && parts.length === 2) {
    const leads = store.read('leads');
    const idx = leads.findIndex(l => l.id === parts[1]);
    if (idx < 0) return fail(req, res, 404, 'Not found');
    if (method === 'PATCH') {
      const status = V.cleanText(req.body.status, 20);
      if (!['new', 'in_progress', 'done', 'spam'].includes(status)) return fail(req, res, 422, 'Invalid status');
      leads[idx].status = status;
      store.write('leads', leads, { actor, action: 'lead-status', target: parts[1], ip });
      return ok(req, res, { lead: leads[idx] });
    }
    if (method === 'DELETE') {
      const [removed] = leads.splice(idx, 1);
      store.write('leads', leads, { actor, action: 'delete-lead', target: removed.id, ip });
      return ok(req, res, { id: removed.id });
    }
  }

  /* Media upload */
  if (apiPath === '/media' && method === 'POST') {
    const dataUrl = String(req.body.dataUrl || '');
    const m = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return fail(req, res, 422, 'Unsupported image format');
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const buf = Buffer.from(m[2], 'base64');
    if (!buf.length || buf.length > config.MAX_UPLOAD_BYTES) return fail(req, res, 413, 'File too large');
    const signatures = { png: [0x89, 0x50, 0x4e, 0x47], jpg: [0xff, 0xd8, 0xff], webp: [0x52, 0x49, 0x46, 0x46] };
    const sig = signatures[ext];
    if (!sig || !sig.every((b, i) => buf[i] === b)) return fail(req, res, 422, 'Invalid image signature');
    const name = 'img-' + Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex') + '.' + ext;
    fs.writeFileSync(path.join(config.UPLOAD_DIR, name), buf);
    store.appendAudit({ actor, action: 'upload-media', target: name, ip });
    return ok(req, res, { url: '/assets/uploads/' + name, name });
  }
  if (parts[0] === 'media' && parts.length === 2 && method === 'DELETE') {
    const name = parts[1];
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) return fail(req, res, 400, 'Invalid filename');
    const full = path.join(config.UPLOAD_DIR, name);
    if (!fs.existsSync(full)) return fail(req, res, 404, 'Not found');
    fs.unlinkSync(full);
    store.appendAudit({ actor, action: 'delete-media', target: name, ip });
    return ok(req, res, { name });
  }

  /* Password */
  if (apiPath === '/password' && method === 'POST') {
    const users = store.read('users');
    const user = users.find(u => u.id === session.user.id);
    if (!user || !auth.verifyPassword(req.body.currentPassword || '', user.passwordHash)) return fail(req, res, 403, 'Неверный текущий пароль');
    const next = String(req.body.newPassword || '');
    if (next.length < 10) return fail(req, res, 422, 'Новый пароль слишком короткий (минимум 10 символов)');
    user.passwordHash = auth.hashPassword(next);
    store.write('users', users, { actor, action: 'change-password', target: user.id, ip });
    return ok(req, res, {});
  }

  return fail(req, res, 404, 'Unknown API endpoint');
}

/* ------------------------------ router ------------------------------ */

async function handle(req, res) {
  const parsed = new URL(req.url, 'http://localhost');
  let pathname = parsed.pathname;
  const search = parsed.search;
  const params = parsed.searchParams;
  const method = req.method;

  if (pathname !== '/' && pathname.endsWith('/')) {
    return httpUtil.sendRedirect(req, res, pathname.replace(/\/+$/, '') + search, 301);
  }

  if (pathname === '/health' && method === 'GET') {
    return httpUtil.sendJson(req, res, { ok: true, uptime: process.uptime(), time: new Date().toISOString() });
  }
  if (pathname === '/robots.txt' && method === 'GET') return robotsRoute(req, res);
  if (pathname === '/sitemap.xml' && method === 'GET') return sitemapRoute(req, res);
  if (httpUtil.serveStatic(req, res, pathname)) return;

  if (pathname === '/data/audit.log' && method === 'GET') {
    const session = auth.requireAuth(req, res);
    if (!session) return;
    store.ensureDirs();
    return httpUtil.sendText(req, res, fs.readFileSync(config.AUDIT_FILE, 'utf8'), 200, 'text/plain; charset=utf-8');
  }

  if (pathname === '/api/lead') return leadRoute(req, res);

  if (pathname === '/admin/login') return loginRoute(req, res, params);
  if (pathname === '/admin/logout' && method === 'POST') return logoutRoute(req, res);
  if (pathname.startsWith('/admin/api/')) return adminApiRoute(req, res, pathname);
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return adminShellRoute(req, res);

  let lang = 'ru';
  let basePath = pathname;
  if (pathname === '/en' || pathname.startsWith('/en/')) {
    lang = 'en';
    basePath = pathname.slice(3) || '/';
  }

  if (basePath === '/') return homeRoute(req, res, lang, search);
  if (basePath === '/catalog') return catalogRoute(req, res, lang, search, params);
  if (basePath.startsWith('/product/')) return productRoute(req, res, lang, decodeURIComponent(basePath.slice('/product/'.length)));
  if (basePath === '/services') return servicesRoute(req, res, lang);
  if (basePath.startsWith('/services/')) return serviceRoute(req, res, lang, decodeURIComponent(basePath.slice('/services/'.length)));
  if (basePath === '/brands') return brandsRoute(req, res, lang);
  if (['/about', '/contacts', '/vacancies', '/terms'].includes(basePath)) return simpleRoute(req, res, lang, basePath.slice(1));

  return notFound(req, res, lang);
}

function start() {
  store.ensureDirs();
  store.ensureSeed();
  auth.ensureAdmin();
  const server = http.createServer((req, res) => {
    handle(req, res).catch(err => {
      const status = err && err.status ? err.status : 500;
      if (status === 500) console.error('[azbut] ERROR', err);
      const isApi = req.url && (req.url.startsWith('/admin/api/') || req.url.startsWith('/api/'));
      if (isApi) return httpUtil.sendJson(req, res, { ok: false, error: status === 500 ? 'Internal server error' : err.message }, status);
      return httpUtil.sendError(req, res, status, err.message || 'Error');
    });
  });
  server.listen(config.PORT, config.HOST, () => {
    log('Сервер запущен: http://' + config.HOST + ':' + config.PORT);
    log('Публичная часть: /  · Админка: /admin');
    log('Демо-доступ: admin / ' + config.ADMIN_PASSWORD);
    log('Seed-данные: ' + config.SEED_DIR + ' · Резервные копии: ' + config.BACKUP_DIR);
  });
}

if (require.main === module) start();
module.exports = { start, handle };
