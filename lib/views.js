'use strict';
const R = require('./render');
const { esc, t, nl2br, icon, breadcrumbs, leadForm, productCard, serviceCard, brandCard, formatPrice } = R;

function sectionHead(kicker, title, text) {
  return `<div class="section-head"><p class="eyebrow">${esc(kicker)}</p><h2>${esc(title)}</h2>${text ? `<p class="section-head__text">${esc(text)}</p>` : ''}</div>`;
}

function pagination(ctx) {
  const { page, pages, filters, prefix, lang } = ctx;
  if (pages <= 1) return '';
  const q = new URLSearchParams();
  if (filters.q) q.set('q', filters.q);
  if (filters.brand) q.set('brand', filters.brand);
  if (filters.category) q.set('category', filters.category);
  if (filters.sort) q.set('sort', filters.sort);
  const href = i => {
    const copy = new URLSearchParams(q);
    copy.set('page', i);
    return esc(prefix + '/catalog?' + copy.toString());
  };
  const shown = new Set([1, pages, page]);
  for (let i = page - 2; i <= page + 2; i++) if (i >= 1 && i <= pages) shown.add(i);
  const items = [];
  let last = 0;
  for (const i of [...shown].sort((a, b) => a - b)) {
    if (i - last > 1) items.push('<li><span aria-hidden="true">…</span></li>');
    items.push(`<li><a href="${href(i)}"${i === page ? ' aria-current="page" class="is-active"' : ''}>${i}</a></li>`);
    last = i;
  }
  if (page > 1) items.unshift(`<li><a href="${href(page - 1)}" aria-label="${lang === 'en' ? 'Previous page' : 'Предыдущая страница'}">←</a></li>`);
  if (page < pages) items.push(`<li><a href="${href(page + 1)}" aria-label="${lang === 'en' ? 'Next page' : 'Следующая страница'}">→</a></li>`);
  return `<nav class="pagination" aria-label="${lang === 'en' ? 'Pagination' : 'Пагинация'}"><ol>${items.join('')}</ol></nav>`;
}

function home(ctx) {
  const { lang, prefix, settings, pages, services, products, brands, csrfToken } = ctx;
  const p = pages.home;
  const L = lang === 'en' ? {
    eyebrow: 'Industrial supply · Belarus', scroll: 'About the company', stats: 'In numbers',
    aboutKicker: 'About AZBUT', servicesKicker: 'What we do', servicesTitle: 'Key areas',
    productsKicker: 'Catalog', productsTitle: 'Popular items', productsAll: 'All products',
    ctaKicker: 'Cooperation', ctaTitle: 'Tell us about your task', ctaText: 'We will select equipment, spare parts or a lighting solution and get back to you with a commercial offer.',
    brandsKicker: 'Partners', brandsTitle: 'Brands we work with', quality: 'EAC certified · official warranty · Minsk warehouse'
  } : {
    eyebrow: 'Промышленные поставки · Беларусь', scroll: 'О компании', stats: 'В цифрах',
    aboutKicker: 'О компании', servicesKicker: 'Направления', servicesTitle: 'Ключевые направления',
    productsKicker: 'Каталог', productsTitle: 'Популярные позиции', productsAll: 'Весь каталог',
    ctaKicker: 'Сотрудничество', ctaTitle: 'Расскажите о вашей задаче', ctaText: 'Подберём технику, запчасть или решение по иллюминации и вернёмся с коммерческим предложением.',
    brandsKicker: 'Партнёры', brandsTitle: 'Бренды, с которыми работаем', quality: 'Сертификаты ЕАС · официальная гарантия · склад в Минске'
  };
  const featured = products.filter(x => x.published).slice(0, 4);
  const svc = services.filter(x => x.published).slice(0, 6);
  return `
<section class="hero">
  <img class="hero__img" src="${esc(settings.heroSmall)}" srcset="${esc(settings.heroSmall)} 640w, ${esc(settings.heroImage)} 1536w" sizes="100vw" width="1536" height="1024" alt="" fetchpriority="high" loading="eager" decoding="async">
  <div class="hero__overlay"></div>
  <div class="container hero__content">
    <p class="eyebrow eyebrow--light">${esc(L.eyebrow)}</p>
    <h1>${esc(t(p.heroTitle, lang))}</h1>
    <p class="hero__lead">${esc(t(p.heroSubtitle, lang))}</p>
    <div class="hero__actions">
      <a class="btn btn--primary btn--lg" href="#request">${esc(t(p.heroCta, lang))}</a>
      <a class="btn btn--ghost btn--lg" href="${esc(prefix + '/catalog')}">${lang === 'en' ? 'Open catalog' : 'Открыть каталог'}</a>
    </div>
    <p class="hero__quality">${icon('check', 16)} ${esc(L.quality)}</p>
  </div>
  <a class="hero__scroll" href="#about" aria-label="${esc(L.scroll)}">${icon('arrow', 20)}</a>
</section>

<section class="stats" aria-label="${esc(L.stats)}"><div class="container stats__grid">
  ${(p.stats || []).map(s => `<div class="stat"><strong>${esc(s.value)}</strong><span>${esc(t(s.label, lang))}</span></div>`).join('')}
</div></section>

<section class="section" id="about"><div class="container split">
  <div class="split__text"><p class="eyebrow">${esc(L.aboutKicker)}</p><h2>${esc(t(p.aboutTitle, lang))}</h2><p class="lead-text">${esc(t(p.aboutText, lang))}</p><a class="text-link" href="${esc(prefix + '/about')}">${lang === 'en' ? 'More about us' : 'Подробнее о компании'} ${icon('arrow', 16)}</a></div>
  <div class="split__media"><img src="/assets/img/illumination.webp" alt="${lang === 'en' ? 'Holiday illumination of a building' : 'Праздничная иллюминация здания'}" width="700" height="810" loading="lazy" decoding="async"></div>
</div></section>

<section class="section section--tint"><div class="container">
  ${sectionHead(L.servicesKicker, L.servicesTitle, lang === 'en' ? 'From spare parts to turnkey lighting projects.' : 'От подбора запчастей до монтажа иллюминации под ключ.')}
  <div class="service-grid">${svc.map(s => serviceCard(s, lang, prefix)).join('')}</div>
  <div class="section__more"><a class="btn btn--outline" href="${esc(prefix + '/services')}">${lang === 'en' ? 'All services' : 'Все услуги'}</a></div>
</div></section>

<section class="section"><div class="container">
  ${sectionHead(L.productsKicker, L.productsTitle, lang === 'en' ? 'In stock and on request — spare parts, drives and professional lighting.' : 'В наличии и под заказ — запчасти, приводы и профессиональный свет.')}
  <div class="product-grid">${featured.map(x => productCard(x, lang, prefix)).join('')}</div>
  <div class="section__more"><a class="btn btn--outline" href="${esc(prefix + '/catalog')}">${esc(L.productsAll)}</a></div>
</div></section>

<section class="section section--dark" id="request"><div class="container cta-grid">
  <div class="cta-grid__text"><p class="eyebrow eyebrow--light">${esc(L.ctaKicker)}</p><h2>${esc(L.ctaTitle)}</h2><p>${esc(L.ctaText)}</p><div class="cta-grid__contacts"><a href="tel:${esc(settings.phone1.replace(/[^+\d]/g, ''))}">${icon('phone', 18)} ${esc(settings.phone1)}</a><a href="mailto:${esc(settings.email)}">${icon('mail', 18)} ${esc(settings.email)}</a></div></div>
  <div class="cta-grid__form">${leadForm(csrfToken, lang, { source: '/' })}</div>
</div></section>

<section class="section"><div class="container">
  ${sectionHead(L.brandsKicker, L.brandsTitle, '')}
  <div class="brand-strip">${brands.filter(b => b.published).map(b => `<div class="brand-strip__item">${esc(b.name)}</div>`).join('')}</div>
</div></section>`;
}

function catalogCard(product, lang, prefix) {
  const title = t(product.title, lang);
  const href = prefix + '/product/' + encodeURIComponent(product.slug);
  const img = product.image || '/assets/img/placeholder.svg';
  const summary = t(product.summary, lang);
  const sku = product.sku || '';
  const brand = product.brand || '';
  const partLabel = lang === 'en' ? 'Part' : 'Арт.';
  return `<a class="product-card catalog-card" href="${esc(href)}" data-brand="${esc(brand)}" data-category="${esc(product.category || '')}" data-sku="${esc(sku)}" data-title="${esc(title)}" data-price="${product.price == null ? '' : esc(String(product.price))}">
    <div class="catalog-card__img"><img src="${esc(img)}" alt="${esc(title)}" width="700" height="700" loading="lazy" decoding="async"></div>
    <div class="catalog-card__body">
      <div class="catalog-card__name">${esc(title)}</div>
      <div class="catalog-card__tagline">${esc(summary)}</div>
      <div class="catalog-card__meta">${sku ? partLabel + ' ' + esc(sku) : ''}${sku && brand ? ' · ' : ''}${brand ? esc(brand) : ''}</div>
    </div>
  </a>`;
}

function catalog(ctx) {
  const { lang, prefix, settings, products, allProducts, brands, filters, total, page, pages, csrfToken } = ctx;
  const L = lang === 'en' ? {
    title: 'Catalog', heading: 'Spare parts & components',
    text: 'Spare parts, components and professional lighting. Use the catalog or send us a part number.',
    searchLabel: 'Search catalog', searchPlaceholder: 'Name or part number…',
    allProducts: 'All products', allBrands: 'All brands', allCategories: 'All categories',
    sort: 'Sort', def: 'Default', priceAsc: 'Price: low to high', priceDesc: 'Price: high to low', name: 'Name A–Z',
    apply: 'Apply', reset: 'Reset', empty: 'Nothing found. Try changing the filters or send a request.',
    request: 'Cannot find the part? Leave a request', extra: 'Brand & sorting', catNav: 'Catalog sections'
  } : {
    title: 'Каталог', heading: 'Запчасти и комплектующие',
    text: 'Запчасти, комплектующие и профессиональная иллюминация. Используйте каталог или отправьте нам артикул.',
    searchLabel: 'Поиск по каталогу', searchPlaceholder: 'Название или артикул…',
    allProducts: 'Все товары', allBrands: 'Все бренды', allCategories: 'Все категории',
    sort: 'Сортировка', def: 'По умолчанию', priceAsc: 'Цена: по возрастанию', priceDesc: 'Цена: по убыванию', name: 'Название А–Я',
    apply: 'Применить', reset: 'Сбросить', empty: 'Ничего не найдено. Измените фильтры или отправьте заявку.',
    request: 'Не нашли позицию? Оставьте заявку', extra: 'Бренд и сортировка', catNav: 'Разделы каталога'
  };
  const source = allProducts || products;
  const counts = {};
  source.forEach(p => { if (p.category) counts[p.category] = (counts[p.category] || 0) + 1; });
  const cats = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b, 'ru'));
  const activeCat = filters.category || '';
  const catTitle = activeCat || L.allProducts;
  const catHref = c => prefix + '/catalog?category=' + encodeURIComponent(c);
  return `
<section class="section catalog-wrap"><div class="container">
  <div class="catalog-head">
    <div class="catalog-crumbs">${breadcrumbs([{ label: lang === 'en' ? 'Home' : 'Главная', href: prefix || '/' }, { label: L.title }], lang)}</div>
    <h1>${esc(L.heading)}</h1>
    <p class="catalog-sub"><b id="catalog-title">${esc(catTitle)}</b> · <span id="catalog-count">${total}</span><span class="catalog-range" id="catalog-range"></span></p>
  </div>
  <div class="catalog-layout">
  <aside class="catalog-side">
    <form class="catalog-filters" method="get" action="${esc(prefix + '/catalog')}">
      <label class="catalog-label" for="catalog-search">${esc(L.searchLabel)}</label>
      <input id="catalog-search" class="catalog-search" type="search" name="q" value="${esc(filters.q)}" placeholder="${esc(L.searchPlaceholder)}">
      <select class="catalog-select" name="category" aria-label="${esc(L.allCategories)}">
        <option value="">${esc(L.allProducts)} (${total})</option>
        ${cats.map(c => `<option value="${esc(c)}"${activeCat === c ? ' selected' : ''}>${esc(c)} (${counts[c]})</option>`).join('')}
      </select>
      <nav class="catalog-cats" aria-label="${esc(L.catNav)}">
        <a class="catalog-cat${activeCat === '' ? ' is-active' : ''}" data-cat="" href="${esc(prefix + '/catalog')}">${esc(L.allProducts)} <span>${total}</span></a>
        ${cats.map(c => `<a class="catalog-cat${activeCat === c ? ' is-active' : ''}" data-cat="${esc(c)}" href="${esc(catHref(c))}">${esc(c)} <span>${counts[c]}</span></a>`).join('')}
      </nav>
      <details class="catalog-extra">
        <summary>${esc(L.extra)}</summary>
        <label class="catalog-field"><span>${esc(L.allBrands)}</span><select name="brand"><option value="">${esc(L.allBrands)}</option>${brands.filter(b => b.published).map(b => `<option value="${esc(b.name)}"${filters.brand === b.name ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>
        <label class="catalog-field"><span>${esc(L.sort)}</span><select name="sort"><option value="">${esc(L.def)}</option><option value="price_asc"${filters.sort === 'price_asc' ? ' selected' : ''}>${esc(L.priceAsc)}</option><option value="price_desc"${filters.sort === 'price_desc' ? ' selected' : ''}>${esc(L.priceDesc)}</option><option value="name"${filters.sort === 'name' ? ' selected' : ''}>${esc(L.name)}</option></select></label>
        <div class="catalog-actions"><button class="btn btn--primary" type="submit">${esc(L.apply)}</button><a class="btn btn--outline catalog-reset" href="${esc(prefix + '/catalog')}">${esc(L.reset)}</a></div>
      </details>
    </form>
  </aside>
  <div class="catalog-main">
    <div class="catalog-grid" id="catalog-grid">${products.map(p => catalogCard(p, lang, prefix)).join('')}</div>
    ${products.length ? pagination(ctx) : `<div class="empty-state" id="catalog-empty"><p>${esc(L.empty)}</p><a class="btn btn--primary" href="#request">${esc(L.request)}</a></div>`}
  </div>
  </div>
</div></section>
<section class="section section--dark" id="request"><div class="container cta-grid"><div class="cta-grid__text"><h2>${esc(L.request)}</h2><p>${lang === 'en' ? 'We will find the required part by number, drawing or sample.' : 'Подберём нужную позицию по артикулу, чертежу или образцу.'}</p></div><div class="cta-grid__form">${leadForm(csrfToken, lang, { source: prefix + '/catalog' })}</div></div></section>`;
}

function product(ctx) {
  const { lang, prefix, settings, product, related, csrfToken, basePath } = ctx;
  const title = t(product.title, lang);
  const L = lang === 'en' ? {
    home: 'Home', catalog: 'Catalog', sku: 'Part number', brand: 'Brand', category: 'Category',
    specs: 'Specifications', description: 'Description', request: 'Request this item', related: 'Related products',
    price: 'Price', ask: 'Request a quote', availability: 'Available', preorder: 'On request'
  } : {
    home: 'Главная', catalog: 'Каталог', sku: 'Артикул', brand: 'Бренд', category: 'Категория',
    specs: 'Характеристики', description: 'Описание', request: 'Запросить эту позицию', related: 'Смотрите также',
    price: 'Цена', ask: 'Запросить цену', availability: 'В наличии', preorder: 'Под заказ'
  };
  const img = product.image || '/assets/img/placeholder.svg';
  const gallery = (product.gallery && product.gallery.length ? product.gallery : [img]);
  return `
<section class="page-head"><div class="container">${breadcrumbs([{ label: L.home, href: prefix || '/' }, { label: L.catalog, href: prefix + '/catalog' }, { label: title }], lang)}<h1>${esc(title)}</h1><p>${esc(t(product.summary, lang))}</p></div></section>
<section class="section"><div class="container product-layout">
  <div class="product-gallery">
    <div class="product-gallery__main"><img id="product-main-image" src="${esc(gallery[0])}" alt="${esc(title)}" width="700" height="700" loading="eager" decoding="async"></div>
    ${gallery.length > 1 ? `<div class="product-gallery__thumbs">${gallery.map((g, i) => `<button type="button" data-gallery-src="${esc(g)}" aria-label="${lang === 'en' ? 'Photo' : 'Фото'} ${i + 1}"><img src="${esc(g)}" alt="" width="90" height="90" loading="lazy"></button>`).join('')}</div>` : ''}
  </div>
  <div class="product-info">
    <p class="product-info__brand">${esc(product.brand || '')} · ${esc(product.category || '')}</p>
    <div class="product-info__price">${formatPrice(product.price, product.currency, lang)}</div>
    <p class="product-info__stock ${product.inStock ? 'is-in' : ''}">${icon(product.inStock ? 'check' : 'globe', 16)} ${esc(product.inStock ? L.availability : L.preorder)}</p>
    <dl class="spec-list"><div><dt>${esc(L.sku)}</dt><dd>${esc(product.sku || '—')}</dd></div><div><dt>${esc(L.brand)}</dt><dd>${esc(product.brand || '—')}</dd></div><div><dt>${esc(L.category)}</dt><dd>${esc(product.category || '—')}</dd></div>${(product.specs || []).map(s => `<div><dt>${esc(t(s.label, lang))}</dt><dd>${esc(t(s.value, lang))}</dd></div>`).join('')}</dl>
    <a class="btn btn--primary btn--block" href="#request">${esc(product.price == null ? L.ask : L.request)}</a>
    <div class="product-info__contacts"><a href="tel:${esc(settings.phone1.replace(/[^+\d]/g, ''))}">${icon('phone', 17)} ${esc(settings.phone1)}</a><a href="mailto:${esc(settings.email)}">${icon('mail', 17)} ${esc(settings.email)}</a></div>
  </div>
</div></section>
<section class="section section--tint"><div class="container"><h2>${esc(L.description)}</h2><div class="prose">${nl2br(t(product.description, lang))}</div></div></section>
<section class="section section--dark" id="request"><div class="container cta-grid"><div class="cta-grid__text"><h2>${esc(L.request)}</h2><p>${esc(title)} · ${esc(product.sku || '')}</p><p>${lang === 'en' ? 'Specify the quantity and delivery city — we will confirm price and lead time.' : 'Укажите количество и город доставки — подтвердим цену и срок.'}</p></div><div class="cta-grid__form">${leadForm(csrfToken, lang, { productId: product.id, source: basePath })}</div></div></section>
${related.length ? `<section class="section"><div class="container">${sectionHead('', L.related, '')}<div class="product-grid">${related.map(p => productCard(p, lang, prefix)).join('')}</div></div></section>` : ''}`;
}

function servicesIndex(ctx) {
  const { lang, prefix, services } = ctx;
  const L = lang === 'en' ? { title: 'Services', text: 'Comprehensive supply, logistics and installation for businesses.' } : { title: 'Услуги', text: 'Комплексное снабжение, логистика и монтаж для бизнеса.' };
  return `<section class="page-head"><div class="container">${breadcrumbs([{ label: lang === 'en' ? 'Home' : 'Главная', href: prefix || '/' }, { label: L.title }], lang)}<h1>${esc(L.title)}</h1><p>${esc(L.text)}</p></div></section><section class="section"><div class="container"><div class="service-grid">${services.filter(s => s.published).map(s => serviceCard(s, lang, prefix)).join('')}</div></div></section>`;
}

function service(ctx) {
  const { lang, prefix, service, services, csrfToken, basePath } = ctx;
  const L = lang === 'en' ? { home: 'Home', services: 'Services', request: 'Request a service', other: 'Other services' } : { home: 'Главная', services: 'Услуги', request: 'Оставить заявку', other: 'Другие услуги' };
  const title = t(service.title, lang);
  const others = services.filter(s => s.published && s.id !== service.id).slice(0, 3);
  return `<section class="page-head"><div class="container">${breadcrumbs([{ label: L.home, href: prefix || '/' }, { label: L.services, href: prefix + '/services' }, { label: title }], lang)}<h1>${esc(title)}</h1><p>${esc(t(service.summary, lang))}</p></div></section>
<section class="section"><div class="container split"><div class="split__text"><div class="service-card__icon service-card__icon--lg">${icon(service.icon || 'gear', 34)}</div><div class="prose">${nl2br(t(service.body, lang))}</div><a class="btn btn--primary" href="#request">${esc(L.request)}</a></div><div class="split__media"><img src="${esc(service.image || '/assets/img/hero-640.webp')}" alt="${esc(title)}" width="700" height="500" loading="lazy" decoding="async"></div></div></section>
<section class="section section--dark" id="request"><div class="container cta-grid"><div class="cta-grid__text"><h2>${esc(L.request)}</h2><p>${esc(title)}</p></div><div class="cta-grid__form">${leadForm(csrfToken, lang, { source: basePath })}</div></div></section>
${others.length ? `<section class="section"><div class="container">${sectionHead('', L.other, '')}<div class="service-grid">${others.map(s => serviceCard(s, lang, prefix)).join('')}</div></div></section>` : ''}`;
}

function brandsIndex(ctx) {
  const { lang, prefix, brands } = ctx;
  const L = lang === 'en' ? { title: 'Brands', text: 'We supply parts for domestic and imported machinery.' } : { title: 'Бренды', text: 'Поставляем запчасти для отечественной и импортной техники.' };
  return `<section class="page-head"><div class="container">${breadcrumbs([{ label: lang === 'en' ? 'Home' : 'Главная', href: prefix || '/' }, { label: L.title }], lang)}<h1>${esc(L.title)}</h1><p>${esc(L.text)}</p></div></section><section class="section"><div class="container"><div class="brand-grid">${brands.filter(b => b.published).map(b => brandCard(b, lang, prefix)).join('')}</div></div></section>`;
}

function simplePage(ctx, key) {
  const { lang, prefix, pages, csrfToken, basePath } = ctx;
  const p = pages[key];
  const L = lang === 'en' ? { home: 'Home', request: 'Leave a request' } : { home: 'Главная', request: 'Оставить заявку' };
  const media = key === 'about' ? `<div class="split__media"><img src="/assets/img/light-figures.webp" alt="${lang === 'en' ? 'Light figures' : 'Световые фигуры'}" width="700" height="740" loading="lazy" decoding="async"></div>` : '';
  return `<section class="page-head"><div class="container">${breadcrumbs([{ label: L.home, href: prefix || '/' }, { label: t(p.h1, lang) }], lang)}<h1>${esc(t(p.h1, lang))}</h1><p>${esc(t(p.description, lang))}</p></div></section>
<section class="section"><div class="container ${media ? 'split' : ''}"><div class="${media ? 'split__text' : 'prose prose--narrow'}">${nl2br(t(p.body, lang))}</div>${media}</div></section>
<section class="section section--dark" id="request"><div class="container cta-grid"><div class="cta-grid__text"><h2>${esc(L.request)}</h2><p>${lang === 'en' ? 'We will answer your question and help with the selection.' : 'Ответим на ваш вопрос и поможем с подбором.'}</p></div><div class="cta-grid__form">${leadForm(csrfToken, lang, { source: basePath })}</div></div></section>`;
}

function contacts(ctx) {
  const { lang, prefix, pages, settings, csrfToken, basePath } = ctx;
  const p = pages.contacts;
  const L = lang === 'en' ? { home: 'Home', title: 'Contacts', address: 'Address', hours: 'Working hours', messengers: 'Messengers', request: 'Send a request' } : { home: 'Главная', title: 'Контакты', address: 'Адрес', hours: 'Режим работы', messengers: 'Мессенджеры', request: 'Отправить заявку' };
  return `<section class="page-head"><div class="container">${breadcrumbs([{ label: L.home, href: prefix || '/' }, { label: L.title }], lang)}<h1>${esc(t(p.h1, lang))}</h1><p>${esc(t(p.body, lang))}</p></div></section>
<section class="section"><div class="container contact-grid">
  <div class="contact-cards">
    <article class="contact-card"><span class="contact-card__icon">${icon('phone', 22)}</span><h2>${lang === 'en' ? 'Phones' : 'Телефоны'}</h2><p><a href="tel:${esc(settings.phone1.replace(/[^+\d]/g, ''))}">${esc(settings.phone1)}</a><br><a href="tel:${esc(settings.phone2.replace(/[^+\d]/g, ''))}">${esc(settings.phone2)}</a></p></article>
    <article class="contact-card"><span class="contact-card__icon">${icon('mail', 22)}</span><h2>Email</h2><p><a href="mailto:${esc(settings.email)}">${esc(settings.email)}</a></p></article>
    <article class="contact-card"><span class="contact-card__icon">${icon('globe', 22)}</span><h2>${esc(L.address)}</h2><p>${esc(t(settings.address, lang))}</p><p>${esc(t(settings.workingHours, lang))}</p><p class="contact-card__legal">${esc(t(settings.companyLegal, lang))}</p></article>
    <article class="contact-card"><span class="contact-card__icon">${icon('telegram', 22)}</span><h2>${esc(L.messengers)}</h2><div class="contact-card__social">${R.socialLinks(settings, 22)}</div></article>
  </div>
  <div class="contact-form"><h2>${esc(L.request)}</h2>${leadForm(csrfToken, lang, { source: basePath })}</div>
</div></section>`;
}

function notFoundBody(lang) {
  return `<section class="page-head"><div class="container"><p class="error-code">404</p><h1>${lang === 'en' ? 'Page not found' : 'Страница не найдена'}</h1><p>${lang === 'en' ? 'The requested page does not exist.' : 'Запрошенная страница не существует.'}</p><a class="btn btn--primary" href="${lang === 'en' ? '/en' : '/'}">${lang === 'en' ? 'Home' : 'На главную'}</a></div></section>`;
}

module.exports = { home, catalog, product, servicesIndex, service, brandsIndex, simplePage, contacts, notFoundBody };
