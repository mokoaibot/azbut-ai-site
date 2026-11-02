'use strict';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
let passed = 0, failed = 0;

function assert(cond, name, detail) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
}
async function get(path, opts = {}) {
  const res = await fetch(BASE + path, Object.assign({ redirect: 'manual' }, opts));
  const text = await res.text();
  return { res, text, status: res.status, headers: res.headers };
}
function cookieFrom(res) {
  const raw = res.headers.get('set-cookie') || '';
  return raw.split(';')[0];
}
function hiddenValue(html, name) {
  const re = new RegExp('name="' + name + '"[^>]*value="([^"]*)"');
  const m = html.match(re);
  return m ? m[1] : '';
}

(async () => {
  console.log('Проверка ' + BASE + '\n');
  try {
    const home = await get('/');
    assert(home.status === 200, 'GET / → 200');
    assert(/<html lang="ru">/.test(home.text), 'lang="ru"');
    assert((home.text.match(/<h1[\s>]/g) || []).length === 1, 'ровно один H1 на главной');
    assert(/rel="canonical"/.test(home.text), 'canonical');
    assert(/hreflang="en"/.test(home.text) && /hreflang="x-default"/.test(home.text), 'hreflang ru/en/x-default');
    assert(/application\/ld\+json/.test(home.text), 'JSON-LD');
    assert(/name="description" content="[^"]{40,}"/.test(home.text), 'meta description');
    assert((home.text.match(/class="site-header"/g) || []).length === 1, 'одна шапка');
    assert(home.headers.get('x-content-type-options') === 'nosniff', 'security header X-Content-Type-Options');
    assert(/max-age=/.test(home.headers.get('strict-transport-security') || ''), 'HSTS');
    const devMode = !process.env.SITE_ORIGIN;
    const csp = home.headers.get('content-security-policy') || '';
    assert(!devMode || (!home.headers.get('x-frame-options') && /frame-ancestors \*/.test(csp)), 'dev: preview iframe не блокируется');

    const en = await get('/en');
    assert(en.status === 200 && /<html lang="en">/.test(en.text), 'GET /en → 200, lang="en"');

    const catalog = await get('/catalog?q=звездочка');
    assert(catalog.status === 200 && /Цепная звездочка/.test(catalog.text), 'поиск по каталогу работает');

    const product = await get('/product/tsepnaya-zvezdochka-az71882');
    assert(product.status === 200 && /"@type":"Product"/.test(product.text), 'карточка товара + Product schema');

    const service = await get('/services/lighting');
    assert(service.status === 200 && /Профессиональная иллюминация/.test(service.text), 'страница услуги');

    const about = await get('/about');
    const contacts = await get('/contacts');
    assert(about.status === 200 && contacts.status === 200, 'статические страницы /about и /contacts');

    const sitemap = await get('/sitemap.xml');
    assert(sitemap.status === 200 && /\/product\//.test(sitemap.text) && /\/en\/catalog/.test(sitemap.text), 'sitemap.xml содержит товары и EN-версии');

    const robots = await get('/robots.txt');
    assert(robots.status === 200 && /Disallow: \/admin\//.test(robots.text), 'robots.txt закрывает админку');

    const missing = await get('/no-such-page-xyz');
    assert(missing.status === 404, 'неизвестный URL → 404');

    const adminAnon = await get('/admin');
    assert(adminAnon.status === 302 && /\/admin\/login/.test(adminAnon.headers.get('location') || ''), '/admin без сессии → редирект на логин');
    const apiAnon = await get('/admin/api/bootstrap');
    assert(apiAnon.status === 401, '/admin/api/bootstrap без сессии → 401');

    const loginPage = await get('/admin/login');
    const csrf = hiddenValue(loginPage.text, '_csrf');
    assert(!!csrf, 'CSRF-токен на странице логина');
    const login = await get('/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: csrf, username: 'admin', password: 'Azbut2026!', next: '/admin' }).toString()
    });
    const cookie = cookieFrom(login.res);
    assert(login.status === 302 && cookie.startsWith('azbut_sid='), 'логин с демо-паролем → сессия');
    const boot = await get('/admin/api/bootstrap', { headers: { Cookie: cookie } });
    let bootData = {};
    try { bootData = JSON.parse(boot.text); } catch (_) {}
    assert(boot.status === 200 && bootData.ok === true && Array.isArray(bootData.products), 'admin bootstrap отдаёт данные');
    assert(bootData.counts && bootData.counts.products >= 10, 'в каталоге ≥10 товаров');

    const leadCsrf = hiddenValue(home.text, '_csrf');
    const lead = await get('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: new URLSearchParams({ _csrf: leadCsrf, name: 'Тест Тестов', email: 'test@example.by', phone: '+375 29 000 00 00', message: 'Проверка формы заявки', source: '/' }).toString()
    });
    assert(lead.status === 200 && /"ok":true/.test(lead.text), 'публичная форма заявки создаёт лид');

    const leadNoCsrf = await get('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ name: 'Тест', email: 'test@example.by', phone: '+375 29 000 00 00', message: 'Без токена' }).toString()
    });
    assert(leadNoCsrf.status === 403, 'заявка без CSRF → 403');

    const health = await get('/health');
    assert(health.status === 200 && /"ok":true/.test(health.text), '/health');

    console.log('\nИтого: ' + passed + ' прошло, ' + failed + ' не прошло.');
    process.exitCode = failed ? 1 : 0;
  } catch (err) {
    console.error('Критическая ошибка проверки:', err);
    process.exitCode = 1;
  }
})();
