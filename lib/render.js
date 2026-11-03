'use strict';
const http = require('./http');

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function t(obj, lang, fallback = 'ru') {
  if (obj == null) return '';
  if (typeof obj === 'string' || typeof obj === 'number') return String(obj);
  if (Array.isArray(obj)) return obj.map(x => t(x, lang, fallback)).join(', ');
  return String(obj[lang] || obj[fallback] || Object.values(obj)[0] || '');
}

function nl2br(value) { return esc(value).replace(/\r?\n/g, '<br>'); }

function formatPrice(price, currency, lang) {
  if (price == null) return lang === 'en' ? 'Price on request' : 'Цена по запросу';
  const formatted = new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'ru-BY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price);
  return formatted + ' ' + esc(currency || 'BYN');
}

function formatDate(iso, lang) {
  try { return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'ru-BY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)); }
  catch (_) { return String(iso); }
}

function absolute(originValue, url) {
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : originValue + url;
}

function jsonLdScript(obj) {
  return '<script type="application/ld+json">' + JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e') + '</script>';
}

function icon(name, size = 20) {
  const p = {
    phone: '<path d="M5 3h4l2 5-2.5 1.5a12 12 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    bulb: '<path d="M9 18h6M10 22h4"/><path d="M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3Z"/>',
    tools: '<path d="M14 6l4 4M4 20l6-6M8 4l12 12-4 4L4 8Z"/>',
    truck: '<rect x="2" y="7" width="12" height="9" rx="1"/><path d="M14 10h4l4 4v2h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
    telegram: '<path d="M21 4 3 11l6 2 2 6 3-4 4 3 3-14Z"/><path d="m9 13 8-6-6 8"/>',
    whatsapp: '<path d="M4 12a8 8 0 0 1 16 0 8 8 0 0 1-12 7L4 20l1-4a8 8 0 0 1-1-4Z"/><path d="M9 9c0 4 2 6 6 6l1-2-2-1-1 1c-1 0-2-1-2-2l1-1-1-2-2 1Z"/>',
    viber: '<path d="M12 3a8 8 0 0 0-8 8c0 4 3 8 8 9l2-3a7 7 0 0 0 6-6c0-4-4-8-8-8Z"/><path d="M9 9h6M9 12h4"/>',
    linkedin: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 10v6M8 7v.01M12 16v-4a2 2 0 0 1 4 0v4"/>',
    instagram: '<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="12" cy="12" r="4"/><path d="M17 7h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M4 20h4l10-10-4-4L4 16v4Z"/><path d="m14 6 4 4"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'
  };
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p[name] || p.gear}</svg>`;
}

function phoneHref(phone) { return 'tel:' + String(phone || '').replace(/[^+\d]/g, ''); }

function navLinks(lang, prefix) {
  const L = lang === 'en' ? {
    home: 'Home', catalog: 'Catalog', services: 'Services', brands: 'Brands',
    about: 'About', contacts: 'Contacts', careers: 'Careers', request: 'Request'
  } : {
    home: 'Главная', catalog: 'Каталог', services: 'Услуги', brands: 'Бренды',
    about: 'О нас', contacts: 'Контакты', careers: 'Вакансии', request: 'Заявка'
  };
  const home = prefix || '/';
  return [
    { href: home, label: L.home },
    { href: prefix + '/catalog', label: L.catalog },
    { href: prefix + '/services', label: L.services },
    { href: prefix + '/brands', label: L.brands },
    { href: prefix + '/about', label: L.about },
    { href: prefix + '/contacts', label: L.contacts },
    { href: prefix + '/vacancies', label: L.careers }
  ];
}

function externalAttrs(url) {
  return /^https?:\/\//i.test(url || '') ? ' target="_blank" rel="noopener noreferrer"' : '';
}

function socialLinks(settings, size = 18) {
  const items = [
    ['telegram', settings.telegram, 'Telegram'], ['whatsapp', settings.whatsapp, 'WhatsApp'],
    ['viber', settings.viber, 'Viber'], ['linkedin', settings.linkedin, 'LinkedIn'],
    ['instagram', settings.instagram, 'Instagram']
  ];
  return items.filter(x => x[1]).map(([key, url, label]) =>
    `<a class="icon-link" href="${esc(url)}"${externalAttrs(url)} aria-label="${label}" title="${label}">${icon(key, size)}</a>`
  ).join('');
}

function langSwitch(lang, basePath, query) {
  const q = query || '';
  const ru = basePath + q;
  const en = '/en' + (basePath === '/' ? '' : basePath) + q;
  return `<div class="lang-switch" aria-label="Language"><a href="${esc(ru)}" class="${lang === 'ru' ? 'is-active' : ''}" hreflang="ru">RU</a><span aria-hidden="true">/</span><a href="${esc(en)}" class="${lang === 'en' ? 'is-active' : ''}" hreflang="en">EN</a></div>`;
}

function breadcrumbs(items, lang) {
  const label = lang === 'en' ? 'Breadcrumb' : 'Хлебные крошки';
  return `<nav class="breadcrumbs" aria-label="${label}"><ol>${items.map((it, i) => {
    const last = i === items.length - 1;
    return `<li>${last || !it.href ? `<span aria-current="${last ? 'page' : 'false'}">${esc(it.label)}</span>` : `<a href="${esc(it.href)}">${esc(it.label)}</a>`}</li>`;
  }).join('')}</ol></nav>`;
}

function leadForm(csrfToken, lang, opts = {}) {
  const L = lang === 'en' ? {
    title: 'Leave a request', name: 'Name *', company: 'Company', email: 'Email *', phone: 'Phone *',
    message: 'Message *', consent: 'I agree to the processing of personal data and accept the', terms: 'terms',
    submit: 'Send request', sending: 'Sending…', success: 'Thank you! We will contact you shortly.',
    error: 'Could not send the form. Please check the fields or call us.'
  } : {
    title: 'Оставить заявку', name: 'Имя *', company: 'Компания', email: 'Email *', phone: 'Телефон *',
    message: 'Сообщение *', consent: 'Согласен(на) на обработку персональных данных и принимаю', terms: 'пользовательское соглашение',
    submit: 'Отправить заявку', sending: 'Отправляем…', success: 'Спасибо! Мы свяжемся с вами в ближайшее время.',
    error: 'Не удалось отправить форму. Проверьте поля или позвоните нам.'
  };
  const termsHref = (lang === 'en' ? '/en' : '') + '/terms';
  return `<form class="lead-form" data-lead-form data-lang="${lang}" novalidate>
    <input type="hidden" name="_csrf" value="${esc(csrfToken)}">
    <input type="hidden" name="productId" value="${esc(opts.productId || '')}">
    <input type="hidden" name="source" value="${esc(opts.source || '')}">
    <div class="honeypot" aria-hidden="true"><label>Не заполняйте это поле<input name="website" tabindex="-1" autocomplete="off"></label></div>
    <div class="form-grid">
      <label class="field"><span>${L.name}</span><input type="text" name="name" required autocomplete="name" maxlength="120"></label>
      <label class="field"><span>${L.company}</span><input type="text" name="company" autocomplete="organization" maxlength="160"></label>
      <label class="field"><span>${L.email}</span><input type="email" name="email" required autocomplete="email" maxlength="160"></label>
      <label class="field"><span>${L.phone}</span><input type="tel" name="phone" required autocomplete="tel" maxlength="40" placeholder="+375 __ ___ __ __"></label>
      <label class="field field--wide"><span>${L.message}</span><textarea name="message" required rows="4" maxlength="2000"></textarea></label>
    </div>
    <label class="checkbox"><input type="checkbox" name="consent" required><span>${L.consent} <a href="${termsHref}">${L.terms}</a>.</span></label>
    <button class="btn btn--primary" type="submit">${L.submit}</button>
    <p class="form-status" role="status" aria-live="polite" data-success="${esc(L.success)}" data-error="${esc(L.error)}" data-sending="${esc(L.sending)}"></p>
  </form>`;
}

function productCard(product, lang, prefix) {
  const title = t(product.title, lang);
  const href = prefix + '/product/' + encodeURIComponent(product.slug);
  const img = product.image || '/assets/img/placeholder.svg';
  const price = formatPrice(product.price, product.currency, lang);
  return `<article class="product-card" data-brand="${esc(product.brand || '')}" data-category="${esc(product.category || '')}" data-sku="${esc(product.sku || '')}" data-title="${esc(title)}" data-price="${product.price == null ? '' : esc(String(product.price))}">
    <a class="product-card__media" href="${href}" aria-label="${esc(title)}">
      <img src="${esc(img)}" alt="${esc(title)}" width="700" height="700" loading="lazy" decoding="async">
      <span class="product-card__sku">${esc(product.sku || '')}</span>
    </a>
    <div class="product-card__body">
      <p class="product-card__brand">${esc(product.brand || '')}</p>
      <h3><a href="${href}">${esc(title)}</a></h3>
      <p class="product-card__summary">${esc(t(product.summary, lang))}</p>
      <div class="product-card__footer"><span class="price">${price}</span><a class="btn btn--small" href="${href}">${lang === 'en' ? 'Details' : 'Подробнее'}</a></div>
    </div>
  </article>`;
}

function serviceCard(service, lang, prefix) {
  const href = prefix + '/services/' + encodeURIComponent(service.slug);
  return `<article class="service-card">
    <div class="service-card__icon">${icon(service.icon || 'gear', 28)}</div>
    <h3><a href="${href}">${esc(t(service.title, lang))}</a></h3>
    <p>${esc(t(service.summary, lang))}</p>
    <a class="text-link" href="${href}">${lang === 'en' ? 'Learn more' : 'Подробнее'} ${icon('arrow', 16)}</a>
  </article>`;
}

function brandCard(brand, lang, prefix) {
  const href = prefix + '/brands#' + encodeURIComponent(brand.slug);
  return `<article class="brand-card" id="${esc(brand.slug)}"><h3>${esc(brand.name)}</h3><p>${esc(t(brand.description, lang))}</p></article>`;
}

function organizationSchema(settings, originValue) {
  const sameAs = [settings.telegram, settings.whatsapp, settings.linkedin, settings.instagram].filter(Boolean);
  return {
    '@context': 'https://schema.org', '@type': 'Organization',
    name: t(settings.siteName, 'ru'), alternateName: t(settings.siteName, 'en'),
    url: originValue + '/', logo: absolute(originValue, settings.logo),
    email: settings.email, telephone: settings.phone1,
    taxID: settings.unp, description: t(settings.shortDescription, 'ru'),
    sameAs
  };
}

function localBusinessSchema(settings, originValue) {
  return {
    '@context': 'https://schema.org', '@type': 'LocalBusiness',
    name: t(settings.siteName, 'ru'), image: absolute(originValue, settings.ogImage),
    url: originValue + '/', telephone: settings.phone1, email: settings.email,
    taxID: settings.unp, priceRange: '$$',
    address: { '@type': 'PostalAddress', streetAddress: t(settings.address, 'ru'), addressLocality: 'Минск', addressCountry: 'BY' },
    openingHours: t(settings.workingHours, 'ru')
  };
}

function websiteSchema(settings, originValue, lang) {
  return {
    '@context': 'https://schema.org', '@type': 'WebSite',
    name: t(settings.siteName, lang), url: originValue + (lang === 'en' ? '/en' : '/'),
    inLanguage: lang, potentialAction: {
      '@type': 'SearchAction', target: originValue + (lang === 'en' ? '/en' : '') + '/catalog?q={search_term_string}',
      'query-input': 'required name=search_term_string'
    }
  };
}

function breadcrumbSchema(items, originValue) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem', position: i + 1, name: it.label,
      item: it.href ? absolute(originValue, it.href) : undefined
    })).filter(x => x.item)
  };
}

function productSchema(product, lang, originValue, canonical) {
  const base = {
    '@context': 'https://schema.org', '@type': 'Product',
    name: t(product.title, lang), sku: product.sku, brand: { '@type': 'Brand', name: product.brand },
    description: t(product.description, lang), image: [absolute(originValue, product.image)],
    url: canonical
  };
  if (product.price != null) {
    base.offers = {
      '@type': 'Offer', price: product.price, priceCurrency: product.currency || 'BYN',
      availability: product.inStock ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder',
      url: canonical, seller: { '@type': 'Organization', name: 'АЗБУТ' }
    };
  }
  return base;
}

function itemListSchema(products, lang, originValue, basePath) {
  return {
    '@context': 'https://schema.org', '@type': 'ItemList',
    itemListElement: products.map((p, i) => ({
      '@type': 'ListItem', position: i + 1, name: t(p.title, lang),
      url: originValue + (lang === 'en' ? '/en' : '') + '/product/' + p.slug
    }))
  };
}

function layout(ctx) {
  const { req, lang = 'ru', basePath = '/', title, description, body, settings, structuredData = [], csrfToken = '', preloadHero = false, noindex = false, pageClass = '', ogImage, query = '' } = ctx;
  const originValue = http.origin(req);
  const prefix = lang === 'en' ? '/en' : '';
  const home = prefix || '/';
  const canonical = originValue + (lang === 'en' ? '/en' + (basePath === '/' ? '' : basePath) : basePath);
  const ruUrl = originValue + basePath;
  const enUrl = originValue + '/en' + (basePath === '/' ? '' : basePath);
  const og = absolute(originValue, ogImage || settings.ogImage);
  const links = navLinks(lang, prefix);
  const year = new Date().getFullYear();
  const navHtml = links.map(l => `<a href="${esc(l.href)}"${basePath === l.href.replace(prefix, '') || (basePath === '/' && l.href === home) ? ' aria-current="page"' : ''}>${esc(l.label)}</a>`).join('');
  const mobileNav = links.map(l => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join('');
  const analytics = settings.analytics || {};
  const metrika = analytics.yandexMetrika ? `<script>(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");ym(${esc(analytics.yandexMetrika)},"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true});</script><noscript><div><img src="https://mc.yandex.ru/watch/${esc(analytics.yandexMetrika)}" style="position:absolute;left:-9999px" alt=""></div></noscript>` : '';
  const ga = analytics.ga4 ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(analytics.ga4)}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config',${JSON.stringify(analytics.ga4)});</script>` : '';

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex, nofollow">' : ''}
<link rel="canonical" href="${esc(canonical)}">
<link rel="alternate" hreflang="ru" href="${esc(ruUrl)}">
<link rel="alternate" hreflang="en" href="${esc(enUrl)}">
<link rel="alternate" hreflang="x-default" href="${esc(ruUrl)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(t(settings.siteName, lang))}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(og)}">
<meta property="og:locale" content="${lang === 'en' ? 'en_US' : 'ru_RU'}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(og)}">
<meta name="theme-color" content="#2b2620">
<link rel="icon" href="${esc(settings.favicon || '/assets/img/favicon.png')}" type="image/png">
<link rel="stylesheet" href="/assets/css/site.css">
${preloadHero ? `<link rel="preload" as="image" href="${esc(settings.heroSmall)}" imagesrcset="${esc(settings.heroSmall)} 640w, ${esc(settings.heroImage)} 1536w" imagesizes="100vw" fetchpriority="high">` : ''}
${structuredData.map(jsonLdScript).join('\n')}
${metrika}${ga}
</head>
<body class="${esc(pageClass)}">
<a class="skip-link" href="#main">${lang === 'en' ? 'Skip to content' : 'Перейти к содержимому'}</a>
<header class="site-header">
  <div class="topbar">
    <div class="container topbar__inner">
      <div class="topbar__contacts">
        <a href="${phoneHref(settings.phone1)}">${icon('phone', 15)} ${esc(settings.phone1)}</a>
        <a href="${phoneHref(settings.phone2)}">${icon('phone', 15)} ${esc(settings.phone2)}</a>
        <a href="mailto:${esc(settings.email)}">${icon('mail', 15)} ${esc(settings.email)}</a>
      </div>
      <div class="topbar__social">${socialLinks(settings, 16)}</div>
    </div>
  </div>
  <div class="navbar">
    <div class="container navbar__inner">
      <a class="brand" href="${esc(home)}" aria-label="${esc(t(settings.siteName, lang))}">
        <img src="${esc(settings.logo)}" alt="" width="48" height="48">
        <span>${esc(t(settings.siteName, lang))}</span>
      </a>
      <nav class="main-nav" aria-label="${lang === 'en' ? 'Main navigation' : 'Основная навигация'}">${navHtml}</nav>
      <div class="nav-actions">
        <form class="nav-search" action="${esc(prefix + '/catalog')}" method="get" role="search">
          <label class="sr-only" for="nav-q">${lang === 'en' ? 'Search catalog' : 'Поиск по каталогу'}</label>
          <input id="nav-q" type="search" name="q" placeholder="${lang === 'en' ? 'Search' : 'Поиск'}" autocomplete="off">
          <button type="submit" aria-label="${lang === 'en' ? 'Search' : 'Найти'}">${icon('search', 18)}</button>
        </form>
        <a class="btn btn--catalog" href="${esc(prefix + '/catalog')}">${icon('menu', 17)} ${lang === 'en' ? 'Catalog' : 'Каталог'}</a>
        ${langSwitch(lang, basePath, query)}
        <button class="burger" type="button" aria-expanded="false" aria-controls="mobile-menu" aria-label="${lang === 'en' ? 'Open menu' : 'Открыть меню'}"><span></span><span></span><span></span></button>
      </div>
    </div>
  </div>
  <div class="mobile-menu" id="mobile-menu" hidden>
    <nav aria-label="${lang === 'en' ? 'Mobile navigation' : 'Мобильная навигация'}">${mobileNav}</nav>
    <form class="mobile-search" action="${esc(prefix + '/catalog')}" method="get" role="search">
      <input type="search" name="q" placeholder="${lang === 'en' ? 'Search catalog' : 'Поиск по каталогу'}" aria-label="${lang === 'en' ? 'Search catalog' : 'Поиск по каталогу'}">
      <button class="btn btn--primary" type="submit">${lang === 'en' ? 'Find' : 'Найти'}</button>
    </form>
    <div class="mobile-menu__contacts">
      <a href="${phoneHref(settings.phone1)}">${icon('phone', 17)} ${esc(settings.phone1)}</a>
      <a href="mailto:${esc(settings.email)}">${icon('mail', 17)} ${esc(settings.email)}</a>
      <div class="mobile-menu__social">${socialLinks(settings, 20)}</div>
    </div>
  </div>
</header>
<main id="main" class="site-main">
${body}
</main>
<footer class="site-footer">
  <div class="container footer__grid">
    <div class="footer__about">
      <a class="brand brand--footer" href="${esc(home)}"><img src="${esc(settings.logo)}" alt="" width="44" height="44"><span>${esc(t(settings.siteName, lang))}</span></a>
      <p>${esc(t(settings.shortDescription, lang))}</p>
      <div class="footer__social">${socialLinks(settings, 19)}</div>
    </div>
    <div><h2>${lang === 'en' ? 'Catalog' : 'Каталог'}</h2><ul><li><a href="${esc(prefix + '/catalog')}">${lang === 'en' ? 'All products' : 'Все товары'}</a></li><li><a href="${esc(prefix + '/services')}">${lang === 'en' ? 'Services' : 'Услуги'}</a></li><li><a href="${esc(prefix + '/brands')}">${lang === 'en' ? 'Brands' : 'Бренды'}</a></li></ul></div>
    <div><h2>${lang === 'en' ? 'Company' : 'Компания'}</h2><ul><li><a href="${esc(prefix + '/about')}">${lang === 'en' ? 'About' : 'О нас'}</a></li><li><a href="${esc(prefix + '/vacancies')}">${lang === 'en' ? 'Careers' : 'Вакансии'}</a></li><li><a href="${esc(prefix + '/contacts')}">${lang === 'en' ? 'Contacts' : 'Контакты'}</a></li><li><a href="${esc(prefix + '/terms')}">${lang === 'en' ? 'Terms' : 'Соглашение'}</a></li></ul></div>
    <div><h2>${lang === 'en' ? 'Contacts' : 'Контакты'}</h2><address><a href="${phoneHref(settings.phone1)}">${esc(settings.phone1)}</a><br><a href="${phoneHref(settings.phone2)}">${esc(settings.phone2)}</a><br><a href="mailto:${esc(settings.email)}">${esc(settings.email)}</a><br>${esc(t(settings.address, lang))}<br>${esc(t(settings.workingHours, lang))}</address><p class="footer__legal">${esc(t(settings.companyLegal, lang))}</p></div>
  </div>
  <div class="container footer__bottom"><p>© ${year} ${esc(t(settings.siteName, lang))}. ${esc(t(settings.footerNote, lang))}</p><a href="#main">${lang === 'en' ? 'Back to top ↑' : 'Наверх ↑'}</a></div>
</footer>
<script src="/assets/js/site.js" defer></script>
</body>
</html>`;
}

function adminLoginPage(ctx) {
  const { csrfToken, error, next } = ctx;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Вход в админку | АЗБУТ</title><meta name="robots" content="noindex,nofollow"><link rel="stylesheet" href="/assets/css/admin.css"><link rel="icon" href="/assets/img/favicon.png"></head><body class="login-page"><main class="login-card"><div class="login-card__brand"><img src="/assets/img/logo.webp" alt="" width="64" height="64"><span>АЗБУТ</span></div><h1>Панель управления</h1><p>Введите логин и пароль для доступа к админке.</p>${error ? `<div class="alert alert--error">${esc(error)}</div>` : ''}<form method="post" action="/admin/login" autocomplete="on"><input type="hidden" name="_csrf" value="${esc(csrfToken)}"><input type="hidden" name="next" value="${esc(next || '/admin')}"><label class="field"><span>Логин</span><input name="username" required autocomplete="username" value="admin"></label><label class="field"><span>Пароль</span><input type="password" name="password" required autocomplete="current-password"></label><button class="btn btn--primary btn--block" type="submit">Войти</button></form><p class="login-hint">Демо-доступ: <code>admin</code> / <code>Azbut2026!</code>. Смените пароль после первого входа.</p></main></body></html>`;
}

function adminShell(ctx) {
  const { csrfToken, user, settings } = ctx;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Админка | АЗБУТ</title><meta name="robots" content="noindex,nofollow"><link rel="stylesheet" href="/assets/css/admin.css"><link rel="icon" href="/assets/img/favicon.png"></head><body class="admin-page">
<div class="admin-layout">
  <aside class="admin-sidebar" id="admin-sidebar">
    <div class="admin-brand"><img src="/assets/img/logo.webp" alt="" width="40" height="40"><div><strong>АЗБУТ</strong><span>Панель управления</span></div></div>
    <nav class="admin-nav" aria-label="Разделы админки">
      <a href="#dashboard" data-section="dashboard">Дашборд</a>
      <a href="#products" data-section="products">Товары</a>
      <a href="#services" data-section="services">Услуги</a>
      <a href="#brands" data-section="brands">Бренды</a>
      <a href="#pages" data-section="pages">Страницы и SEO</a>
      <a href="#leads" data-section="leads">Заявки</a>
      <a href="#settings" data-section="settings">Настройки</a>
      <a href="#media" data-section="media">Медиа</a>
      <a href="#security" data-section="security">Безопасность</a>
      <a href="#audit" data-section="audit">Журнал</a>
    </nav>
    <div class="admin-sidebar__foot"><a class="admin-view-site" href="/" target="_blank" rel="noopener">Открыть сайт ↗</a><form method="post" action="/admin/logout"><input type="hidden" name="_csrf" value="${esc(csrfToken)}"><button type="submit">Выйти</button></form></div>
  </aside>
  <div class="admin-main">
    <header class="admin-topbar"><button class="admin-burger" type="button" aria-expanded="false" aria-controls="admin-sidebar" aria-label="Меню">☰</button><div><strong id="admin-section-title">Дашборд</strong><span id="admin-section-sub">Сводка по сайту</span></div><div class="admin-user">${esc(user.username)} <span class="admin-avatar">${esc(user.username.slice(0,1).toUpperCase())}</span></div></header>
    <div class="admin-content" id="admin-app"><div class="admin-loading">Загружаем данные…</div></div>
  </div>
</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script>window.__ADMIN__=${JSON.stringify({ csrf: csrfToken, user: { username: user.username, role: user.role }, siteName: settings.siteName.ru }).replace(/</g, '\\u003c')};</script>
<script src="/assets/js/admin.js" defer></script>
</body></html>`;
}

module.exports = {
  esc, t, nl2br, formatPrice, formatDate, absolute, jsonLdScript, icon, phoneHref, navLinks,
  externalAttrs, socialLinks, langSwitch, breadcrumbs, leadForm, productCard, serviceCard, brandCard,
  organizationSchema, localBusinessSchema, websiteSchema, breadcrumbSchema, productSchema, itemListSchema,
  layout, adminLoginPage, adminShell
};
