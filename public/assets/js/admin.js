(function () {
  'use strict';
  var API = '/admin/api';
  var CFG = window.__ADMIN__ || { csrf: '', user: {} };
  var app = document.getElementById('admin-app');
  var sidebar = document.getElementById('admin-sidebar');
  var toastEl = document.getElementById('toast');
  var state = { data: null, section: (location.hash || '#dashboard').slice(1) };
  var toastTimer = null;

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function toast(msg, isError) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.className = 'toast is-visible' + (isError ? ' is-error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.className = 'toast'; }, 3200);
  }
  async function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', headers: { 'X-CSRF-Token': CFG.csrf, 'Accept': 'application/json' } };
    if (opts.body) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    var res = await fetch(API + path, init);
    if (res.status === 401) { location.href = '/admin/login'; throw new Error('Unauthorized'); }
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.ok === false) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  }
  function fmtDate(iso) { try { return new Date(iso).toLocaleString('ru-BY'); } catch (e) { return iso; } }
  function statusLabel(s) { return ({ new: 'Новая', in_progress: 'В работе', done: 'Закрыта', spam: 'Спам' })[s] || s; }
  function titleMap(section) {
    return ({
      dashboard: ['Дашборд', 'Сводка по сайту'], products: ['Товары', 'Каталог и цены'], services: ['Услуги', 'Направления работы'],
      brands: ['Бренды', 'Партнёры и производители'], pages: ['Страницы и SEO', 'Метаданные и тексты'],
      leads: ['Заявки', 'Обращения с сайта'], settings: ['Настройки', 'Контакты, аналитика и SEO'],
      media: ['Медиа', 'Загруженные изображения'], security: ['Безопасность', 'Пароль и сессия'],
      audit: ['Журнал', 'История изменений']
    })[section] || ['Админка', ''];
  }
  function setTitle(section) {
    var t = titleMap(section);
    var a = $('#admin-section-title'), b = $('#admin-section-sub');
    if (a) a.textContent = t[0]; if (b) b.textContent = t[1];
    document.title = t[0] + ' | Админка АЗБУТ';
  }
  function nav() {
    $$('.admin-nav a').forEach(function (a) { a.classList.toggle('is-active', a.dataset.section === state.section); });
    if (sidebar) sidebar.classList.remove('is-open');
  }

  /* ---------- field/modal helpers ---------- */
  function fieldHtml(f, val) {
    var id = 'f_' + f.name;
    var v = val == null ? '' : val;
    var cls = 'field' + (f.wide ? ' field--wide' : '') + (f.type === 'checkbox' ? ' field--checkbox' : '');
    var control = '';
    if (f.type === 'textarea') {
      control = '<textarea id="' + id + '" name="' + f.name + '" rows="' + (f.rows || 4) + '"' + (f.required ? ' required' : '') + '>' + esc(v) + '</textarea>';
    } else if (f.type === 'select') {
      control = '<select id="' + id + '" name="' + f.name + '">' + (f.options || []).map(function (o) {
        var value = typeof o === 'string' ? o : o.value, label = typeof o === 'string' ? o : o.label;
        return '<option value="' + esc(value) + '"' + (String(v) === String(value) ? ' selected' : '') + '>' + esc(label) + '</option>';
      }).join('') + '</select>';
    } else if (f.type === 'checkbox') {
      control = '<label><input id="' + id + '" type="checkbox" name="' + f.name + '"' + (v ? ' checked' : '') + '><span>' + esc(f.label) + '</span></label>' + (f.help ? '<span class="help">' + esc(f.help) + '</span>' : '');
      return '<div class="' + cls + '">' + control + '</div>';
    } else if (f.type === 'image') {
      control = '<div class="image-field"><img data-image-preview src="' + esc(v || '/assets/img/placeholder.svg') + '" alt="" width="90" height="90">' +
        '<input type="hidden" name="' + f.name + '" value="' + esc(v) + '">' +
        '<input type="file" data-file-input accept="image/png,image/jpeg,image/webp">' +
        '<button class="btn btn--small btn--ghost" type="button" data-clear-image>Очистить</button></div>' +
        (f.help ? '<span class="help">' + esc(f.help) + '</span>' : '');
    } else {
      control = '<input id="' + id + '" type="' + (f.type || 'text') + '" name="' + f.name + '" value="' + esc(v) + '"' + (f.required ? ' required' : '') + (f.step ? ' step="' + f.step + '"' : '') + (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + '>';
    }
    return '<div class="' + cls + '"><label for="' + id + '">' + esc(f.label) + (f.required ? ' *' : '') + '</label>' + control + (f.help ? '<span class="help">' + esc(f.help) + '</span>' : '') + '</div>';
  }
  function collectForm(form, fields) {
    var out = {};
    fields.forEach(function (f) {
      var el = form.elements.namedItem(f.name);
      if (!el) return;
      out[f.name] = f.type === 'checkbox' ? el.checked : String(el.value || '').trim();
    });
    return out;
  }
  function closeModal(back) { if (back && back.parentNode) back.parentNode.removeChild(back); }
  function openModal(title, fields, values, onSubmit) {
    var back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
      '<div class="modal__head"><h2>' + esc(title) + '</h2><button class="modal__close" type="button" data-close aria-label="Закрыть">×</button></div>' +
      '<form id="modal-form"><div class="modal__body"><div class="form-grid">' + fields.map(function (f) { return fieldHtml(f, values[f.name]); }).join('') + '</div></div>' +
      '<div class="modal__foot"><button class="btn btn--ghost" type="button" data-close>Отмена</button><button class="btn btn--primary" type="submit">Сохранить</button></div></form></div>';
    document.body.appendChild(back);
    var form = $('#modal-form', back);
    back.addEventListener('click', function (e) { if (e.target === back || e.target.closest('[data-close]')) closeModal(back); });
    var fileInput = $('[data-file-input]', back);
    if (fileInput) {
      fileInput.addEventListener('change', async function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        try {
          var url = await uploadImage(file);
          $('input[type="hidden"][name="' + fields.find(function (f) { return f.type === 'image'; }).name + '"]', back).value = url;
          $('[data-image-preview]', back).src = url;
          toast('Изображение загружено');
        } catch (err) { toast(err.message, true); }
      });
    }
    var clear = $('[data-clear-image]', back);
    if (clear) clear.addEventListener('click', function () {
      var imgField = fields.find(function (f) { return f.type === 'image'; });
      $('input[type="hidden"][name="' + imgField.name + '"]', back).value = '/assets/img/placeholder.svg';
      $('[data-image-preview]', back).src = '/assets/img/placeholder.svg';
    });
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var payload = collectForm(form, fields);
      var btn = $('button[type="submit"]', back); btn.disabled = true; btn.textContent = 'Сохраняем…';
      try { await onSubmit(payload); closeModal(back); await refresh(); toast('Сохранено'); }
      catch (err) { toast(err.message, true); btn.disabled = false; btn.textContent = 'Сохранить'; }
    });
  }
  function readFileAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader(); r.onload = function () { resolve(r.result); }; r.onerror = reject; r.readAsDataURL(file);
    });
  }
  async function uploadImage(file) {
    if (file.size > 3 * 1024 * 1024) throw new Error('Файл больше 3 МБ');
    var dataUrl = await readFileAsDataURL(file);
    var res = await api('/media', { method: 'POST', body: { filename: file.name, dataUrl: dataUrl } });
    return res.url;
  }

  /* ---------- mappers ---------- */
  function fromProduct(p) {
    return {
      id: p.id, slug: p.slug, sku: p.sku, brand: p.brand, category: p.category,
      titleRu: p.title.ru, titleEn: p.title.en, summaryRu: p.summary.ru, summaryEn: p.summary.en,
      descriptionRu: p.description.ru, descriptionEn: p.description.en,
      price: p.price == null ? '' : p.price, image: p.image, published: p.published, inStock: p.inStock,
      seoTitleRu: p.seo && p.seo.title ? p.seo.title.ru : '', seoTitleEn: p.seo && p.seo.title ? p.seo.title.en : '',
      seoDescriptionRu: p.seo && p.seo.description ? p.seo.description.ru : '', seoDescriptionEn: p.seo && p.seo.description ? p.seo.description.en : ''
    };
  }
  var productFields = [
    { name: 'slug', label: 'Slug (URL)', required: true, help: 'Латиницей, например: chain-sprocket-az71882' },
    { name: 'sku', label: 'Артикул', required: true },
    { name: 'brand', label: 'Бренд' }, { name: 'category', label: 'Категория' },
    { name: 'titleRu', label: 'Название RU', required: true }, { name: 'titleEn', label: 'Название EN' },
    { name: 'summaryRu', label: 'Кратко RU', type: 'textarea', wide: true }, { name: 'summaryEn', label: 'Кратко EN', type: 'textarea', wide: true },
    { name: 'descriptionRu', label: 'Описание RU', type: 'textarea', wide: true, rows: 5 }, { name: 'descriptionEn', label: 'Описание EN', type: 'textarea', wide: true, rows: 5 },
    { name: 'price', label: 'Цена, BYN', type: 'number', step: '0.01', help: 'Оставьте пустым, если «цена по запросу»' },
    { name: 'image', label: 'Изображение', type: 'image', wide: true },
    { name: 'seoTitleRu', label: 'SEO title RU', wide: true }, { name: 'seoTitleEn', label: 'SEO title EN', wide: true },
    { name: 'seoDescriptionRu', label: 'SEO description RU', type: 'textarea', wide: true }, { name: 'seoDescriptionEn', label: 'SEO description EN', type: 'textarea', wide: true },
    { name: 'published', label: 'Опубликовано', type: 'checkbox' }, { name: 'inStock', label: 'В наличии', type: 'checkbox' }
  ];
  function fromService(s) {
    return {
      id: s.id, slug: s.slug, titleRu: s.title.ru, titleEn: s.title.en,
      summaryRu: s.summary.ru, summaryEn: s.summary.en, bodyRu: s.body.ru, bodyEn: s.body.en,
      image: s.image, icon: s.icon, order: s.order, published: s.published,
      seoTitleRu: s.seo && s.seo.title ? s.seo.title.ru : '', seoTitleEn: s.seo && s.seo.title ? s.seo.title.en : '',
      seoDescriptionRu: s.seo && s.seo.description ? s.seo.description.ru : '', seoDescriptionEn: s.seo && s.seo.description ? s.seo.description.en : ''
    };
  }
  function toServicePayload(f, existing) {
    return {
      id: existing && existing.id, slug: f.slug, icon: f.icon || 'gear', image: f.image || '/assets/img/hero-640.webp',
      order: Number(f.order) || 99, published: !!f.published, updatedAt: new Date().toISOString(),
      title: { ru: f.titleRu, en: f.titleEn || f.titleRu }, summary: { ru: f.summaryRu, en: f.summaryEn || f.summaryRu },
      body: { ru: f.bodyRu, en: f.bodyEn || f.bodyRu },
      seo: { title: { ru: f.seoTitleRu, en: f.seoTitleEn || f.seoTitleRu }, description: { ru: f.seoDescriptionRu, en: f.seoDescriptionEn || f.seoDescriptionRu } }
    };
  }
  var serviceFields = [
    { name: 'slug', label: 'Slug', required: true }, { name: 'icon', label: 'Иконка', type: 'select', options: ['gear', 'tractor', 'bulb', 'globe', 'tools', 'excavator'] },
    { name: 'titleRu', label: 'Название RU', required: true }, { name: 'titleEn', label: 'Название EN' },
    { name: 'summaryRu', label: 'Кратко RU', type: 'textarea', wide: true }, { name: 'summaryEn', label: 'Кратко EN', type: 'textarea', wide: true },
    { name: 'bodyRu', label: 'Текст RU', type: 'textarea', wide: true, rows: 5 }, { name: 'bodyEn', label: 'Текст EN', type: 'textarea', wide: true, rows: 5 },
    { name: 'image', label: 'Изображение', type: 'image', wide: true }, { name: 'order', label: 'Порядок', type: 'number' },
    { name: 'seoTitleRu', label: 'SEO title RU', wide: true }, { name: 'seoTitleEn', label: 'SEO title EN', wide: true },
    { name: 'seoDescriptionRu', label: 'SEO description RU', type: 'textarea', wide: true }, { name: 'seoDescriptionEn', label: 'SEO description EN', type: 'textarea', wide: true },
    { name: 'published', label: 'Опубликовано', type: 'checkbox' }
  ];
  function fromBrand(b) { return { id: b.id, slug: b.slug, name: b.name, descriptionRu: b.description.ru, descriptionEn: b.description.en, published: b.published }; }
  function toBrandPayload(f, existing) {
    return { id: existing && existing.id, slug: f.slug, name: f.name, description: { ru: f.descriptionRu, en: f.descriptionEn || f.descriptionRu }, published: !!f.published, updatedAt: new Date().toISOString() };
  }
  var brandFields = [
    { name: 'slug', label: 'Slug', required: true }, { name: 'name', label: 'Название', required: true },
    { name: 'descriptionRu', label: 'Описание RU', type: 'textarea', wide: true }, { name: 'descriptionEn', label: 'Описание EN', type: 'textarea', wide: true },
    { name: 'published', label: 'Опубликовано', type: 'checkbox' }
  ];
  function fromPage(key, p) {
    return {
      key: key, titleRu: p.title.ru, titleEn: p.title.en, descriptionRu: p.description.ru, descriptionEn: p.description.en,
      h1Ru: p.h1 ? p.h1.ru : '', h1En: p.h1 ? p.h1.en : '',
      heroTitleRu: p.heroTitle ? p.heroTitle.ru : '', heroTitleEn: p.heroTitle ? p.heroTitle.en : '',
      heroSubtitleRu: p.heroSubtitle ? p.heroSubtitle.ru : '', heroSubtitleEn: p.heroSubtitle ? p.heroSubtitle.en : '',
      heroCtaRu: p.heroCta ? p.heroCta.ru : '', heroCtaEn: p.heroCta ? p.heroCta.en : '',
      aboutTitleRu: p.aboutTitle ? p.aboutTitle.ru : '', aboutTitleEn: p.aboutTitle ? p.aboutTitle.en : '',
      aboutTextRu: p.aboutText ? p.aboutText.ru : '', aboutTextEn: p.aboutText ? p.aboutText.en : '',
      bodyRu: p.body ? p.body.ru : '', bodyEn: p.body ? p.body.en : '',
      seoTitleRu: p.seoTitle ? p.seoTitle.ru : '', seoTitleEn: p.seoTitle ? p.seoTitle.en : '',
      seoDescriptionRu: p.seoDescription ? p.seoDescription.ru : '', seoDescriptionEn: p.seoDescription ? p.seoDescription.en : ''
    };
  }
  function toPagePayload(f, existing) {
    var out = { updatedAt: new Date().toISOString() };
    ['title', 'description', 'h1', 'heroTitle', 'heroSubtitle', 'heroCta', 'aboutTitle', 'aboutText', 'body', 'seoTitle', 'seoDescription'].forEach(function (base) {
      var ru = f[base + 'Ru'], en = f[base + 'En'] || ru;
      if (existing[base] !== undefined || ru) out[base] = { ru: ru || '', en: en || '' };
    });
    if (existing.stats) out.stats = existing.stats;
    return out;
  }
  var pageFields = [
    { name: 'titleRu', label: 'Title RU', wide: true }, { name: 'titleEn', label: 'Title EN', wide: true },
    { name: 'descriptionRu', label: 'Description RU', type: 'textarea', wide: true }, { name: 'descriptionEn', label: 'Description EN', type: 'textarea', wide: true },
    { name: 'h1Ru', label: 'H1 RU' }, { name: 'h1En', label: 'H1 EN' },
    { name: 'heroTitleRu', label: 'Hero заголовок RU' }, { name: 'heroTitleEn', label: 'Hero заголовок EN' },
    { name: 'heroSubtitleRu', label: 'Hero подзаголовок RU', type: 'textarea', wide: true }, { name: 'heroSubtitleEn', label: 'Hero подзаголовок EN', type: 'textarea', wide: true },
    { name: 'heroCtaRu', label: 'Hero CTA RU' }, { name: 'heroCtaEn', label: 'Hero CTA EN' },
    { name: 'aboutTitleRu', label: 'Блок «О компании» RU' }, { name: 'aboutTitleEn', label: 'Блок «О компании» EN' },
    { name: 'aboutTextRu', label: 'Текст о компании RU', type: 'textarea', wide: true, rows: 5 }, { name: 'aboutTextEn', label: 'Текст о компании EN', type: 'textarea', wide: true, rows: 5 },
    { name: 'bodyRu', label: 'Основной текст RU', type: 'textarea', wide: true, rows: 7 }, { name: 'bodyEn', label: 'Основной текст EN', type: 'textarea', wide: true, rows: 7 },
    { name: 'seoTitleRu', label: 'SEO title RU', wide: true }, { name: 'seoTitleEn', label: 'SEO title EN', wide: true },
    { name: 'seoDescriptionRu', label: 'SEO description RU', type: 'textarea', wide: true }, { name: 'seoDescriptionEn', label: 'SEO description EN', type: 'textarea', wide: true }
  ];
  function fromSettings(s) {
    return {
      siteNameRu: s.siteName.ru, siteNameEn: s.siteName.en, taglineRu: s.tagline.ru, taglineEn: s.tagline.en,
      shortDescriptionRu: s.shortDescription.ru, shortDescriptionEn: s.shortDescription.en,
      phone1: s.phone1, phone2: s.phone2, email: s.email, addressRu: s.address.ru, addressEn: s.address.en,
      unp: s.unp, workingHoursRu: s.workingHours.ru, workingHoursEn: s.workingHours.en,
      whatsapp: s.whatsapp, telegram: s.telegram, viber: s.viber, linkedin: s.linkedin, instagram: s.instagram, wechat: s.wechat || '',
      footerNoteRu: s.footerNote.ru, footerNoteEn: s.footerNote.en,
      yandexMetrika: s.analytics && s.analytics.yandexMetrika || '', ga4: s.analytics && s.analytics.ga4 || ''
    };
  }
  function toSettingsPayload(f, existing) {
    return {
      siteName: { ru: f.siteNameRu, en: f.siteNameEn || f.siteNameRu }, tagline: { ru: f.taglineRu, en: f.taglineEn || f.taglineRu },
      shortDescription: { ru: f.shortDescriptionRu, en: f.shortDescriptionEn || f.shortDescriptionRu },
      phone1: f.phone1, phone2: f.phone2, email: f.email, address: { ru: f.addressRu, en: f.addressEn || f.addressRu },
      unp: f.unp, companyLegal: existing.companyLegal, workingHours: { ru: f.workingHoursRu, en: f.workingHoursEn || f.workingHoursRu },
      whatsapp: f.whatsapp, telegram: f.telegram, viber: f.viber, linkedin: f.linkedin, instagram: f.instagram, wechat: f.wechat,
      heroImage: existing.heroImage, heroSmall: existing.heroSmall, logo: existing.logo, favicon: existing.favicon, ogImage: existing.ogImage,
      analytics: { yandexMetrika: f.yandexMetrika, ga4: f.ga4 }, seo: existing.seo,
      footerNote: { ru: f.footerNoteRu, en: f.footerNoteEn || f.footerNoteRu }, updatedAt: new Date().toISOString()
    };
  }
  var settingsFields = [
    { name: 'siteNameRu', label: 'Название сайта RU' }, { name: 'siteNameEn', label: 'Название сайта EN' },
    { name: 'taglineRu', label: 'Слоган RU', wide: true }, { name: 'taglineEn', label: 'Слоган EN', wide: true },
    { name: 'shortDescriptionRu', label: 'Короткое описание RU', type: 'textarea', wide: true }, { name: 'shortDescriptionEn', label: 'Короткое описание EN', type: 'textarea', wide: true },
    { name: 'phone1', label: 'Телефон 1' }, { name: 'phone2', label: 'Телефон 2' },
    { name: 'email', label: 'Email', type: 'email' }, { name: 'unp', label: 'УНП' },
    { name: 'addressRu', label: 'Адрес RU', wide: true }, { name: 'addressEn', label: 'Адрес EN', wide: true },
    { name: 'workingHoursRu', label: 'Режим работы RU' }, { name: 'workingHoursEn', label: 'Режим работы EN' },
    { name: 'whatsapp', label: 'WhatsApp URL', wide: true }, { name: 'telegram', label: 'Telegram URL', wide: true },
    { name: 'viber', label: 'Viber URL', wide: true }, { name: 'linkedin', label: 'LinkedIn URL', wide: true },
    { name: 'instagram', label: 'Instagram URL', wide: true }, { name: 'wechat', label: 'WeChat URL', wide: true },
    { name: 'footerNoteRu', label: 'Примечание в футере RU', type: 'textarea', wide: true }, { name: 'footerNoteEn', label: 'Примечание в футере EN', type: 'textarea', wide: true },
    { name: 'yandexMetrika', label: 'ID Яндекс.Метрики', help: 'Оставьте пустым, если счётчик не нужен' }, { name: 'ga4', label: 'ID GA4', help: 'Например G-XXXXXXX' }
  ];

  /* ---------- sections ---------- */
  function renderDashboard() {
    var d = state.data, c = d.counts;
    var recent = d.leads.slice(0, 5).map(function (l) {
      return '<tr><td>' + esc(l.name) + '</td><td>' + esc(l.company || '—') + '</td><td><span class="badge ' + esc(l.status) + '">' + esc(statusLabel(l.status)) + '</span></td><td>' + esc(fmtDate(l.createdAt)) + '</td></tr>';
    }).join('') || '<tr><td colspan="4" class="empty">Заявок пока нет</td></tr>';
    app.innerHTML = '<div class="admin-grid g4">' +
      '<div class="card"><h3>Товаров</h3><div class="big blue">' + c.products + '</div><div class="hint">опубликовано ' + c.publishedProducts + '</div></div>' +
      '<div class="card"><h3>Заявок</h3><div class="big warn">' + c.leads + '</div><div class="hint">новых ' + c.newLeads + '</div></div>' +
      '<div class="card"><h3>Услуг</h3><div class="big good">' + c.services + '</div><div class="hint">брендов ' + c.brands + '</div></div>' +
      '<div class="card"><h3>Медиа</h3><div class="big">' + c.media + '</div><div class="hint">файлов в загрузках</div></div></div>' +
      '<div class="admin-grid g2" style="margin-top:16px"><div class="card"><div class="section-head"><h2>Последние заявки</h2><a class="btn btn--small" href="#leads">Все →</a></div><div class="table-wrap"><table><thead><tr><th>Имя</th><th>Компания</th><th>Статус</th><th>Дата</th></tr></thead><tbody>' + recent + '</tbody></table></div></div>' +
      '<div class="card"><div class="section-head"><h2>Быстрые действия</h2></div><div class="quick-links"><a class="btn btn--small" href="#products">+ Товар</a><a class="btn btn--small" href="#services">+ Услуга</a><a class="btn btn--small" href="#pages">SEO страниц</a><a class="btn btn--small" href="#media">Загрузить изображение</a><a class="btn btn--small" href="/" target="_blank" rel="noopener">Открыть сайт ↗</a></div><div class="section-head" style="margin-top:20px"><h2>Последние изменения</h2></div><pre class="audit">' + esc(d.audit.slice(0, 8).map(function (a) { return fmtDate(a.ts) + '  ' + a.actor + '  ' + a.action + '  ' + a.target; }).join('\n') || 'Нет записей') + '</pre></div></div>';
  }
  function renderProducts() {
    var d = state.data;
    var rows = d.products.map(function (p) {
      return '<tr><td><img class="thumb" src="' + esc(p.image || '/assets/img/placeholder.svg') + '" alt="" loading="lazy"></td><td><strong>' + esc(p.title.ru) + '</strong><br><span class="mono">' + esc(p.slug) + '</span></td><td>' + esc(p.sku) + '</td><td>' + esc(p.brand || '—') + '</td><td>' + (p.price == null ? '<span class="badge off">по запросу</span>' : esc(p.price) + ' BYN') + '</td><td><span class="badge ' + (p.published ? 'ok' : 'off') + '">' + (p.published ? 'Да' : 'Нет') + '</span></td><td><div class="row-actions"><button class="btn btn--small" data-edit="' + esc(p.id) + '">Изменить</button><button class="btn btn--small btn--danger" data-del="' + esc(p.id) + '">Удалить</button></div></td></tr>';
    }).join('') || '<tr><td colspan="7" class="empty">Товаров нет</td></tr>';
    app.innerHTML = '<div class="section-head"><div><h2>Товары</h2><p>Всего: ' + d.products.length + '</p></div><button class="btn btn--primary" data-add>+ Добавить товар</button></div><div class="table-wrap"><table><thead><tr><th>Фото</th><th>Название</th><th>Артикул</th><th>Бренд</th><th>Цена</th><th>Опубл.</th><th>Действия</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    $('[data-add]', app).addEventListener('click', function () { openModal('Новый товар', productFields, { published: true }, async function (f) { await api('/products', { method: 'POST', body: f }); }); });
    $$('[data-edit]', app).forEach(function (b) { b.addEventListener('click', function () { var p = d.products.find(function (x) { return x.id === b.dataset.edit; }); openModal('Редактировать товар', productFields, fromProduct(p), async function (f) { await api('/products/' + encodeURIComponent(p.id), { method: 'PUT', body: f }); }); }); });
    $$('[data-del]', app).forEach(function (b) { b.addEventListener('click', async function () { if (!confirm('Удалить товар?')) return; try { await api('/products/' + encodeURIComponent(b.dataset.del), { method: 'DELETE' }); await refresh(); toast('Товар удалён'); } catch (e) { toast(e.message, true); } }); });
  }
  function renderServices() {
    var d = state.data;
    var rows = d.services.map(function (s) {
      return '<tr><td>' + esc(s.order) + '</td><td><strong>' + esc(s.title.ru) + '</strong><br><span class="mono">' + esc(s.slug) + '</span></td><td>' + esc(s.summary.ru) + '</td><td><span class="badge ' + (s.published ? 'ok' : 'off') + '">' + (s.published ? 'Да' : 'Нет') + '</span></td><td><div class="row-actions"><button class="btn btn--small" data-edit="' + esc(s.id) + '">Изменить</button><button class="btn btn--small btn--danger" data-del="' + esc(s.id) + '">Удалить</button></div></td></tr>';
    }).join('');
    app.innerHTML = '<div class="section-head"><div><h2>Услуги</h2><p>Направления работы на сайте</p></div><button class="btn btn--primary" data-add>+ Добавить услугу</button></div><div class="table-wrap"><table><thead><tr><th>№</th><th>Название</th><th>Кратко</th><th>Опубл.</th><th>Действия</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    $('[data-add]', app).addEventListener('click', function () { openModal('Новая услуга', serviceFields, { published: true, icon: 'gear', order: 99 }, async function (f) { await api('/services', { method: 'POST', body: toServicePayload(f, {}) }); }); });
    $$('[data-edit]', app).forEach(function (b) { b.addEventListener('click', function () { var s = d.services.find(function (x) { return x.id === b.dataset.edit; }); openModal('Редактировать услугу', serviceFields, fromService(s), async function (f) { await api('/services/' + encodeURIComponent(s.id), { method: 'PUT', body: toServicePayload(f, s) }); }); }); });
    $$('[data-del]', app).forEach(function (b) { b.addEventListener('click', async function () { if (!confirm('Удалить услугу?')) return; try { await api('/services/' + encodeURIComponent(b.dataset.del), { method: 'DELETE' }); await refresh(); toast('Услуга удалена'); } catch (e) { toast(e.message, true); } }); });
  }
  function renderBrands() {
    var d = state.data;
    var rows = d.brands.map(function (b) {
      return '<tr><td><strong>' + esc(b.name) + '</strong><br><span class="mono">' + esc(b.slug) + '</span></td><td>' + esc(b.description.ru) + '</td><td><span class="badge ' + (b.published ? 'ok' : 'off') + '">' + (b.published ? 'Да' : 'Нет') + '</span></td><td><div class="row-actions"><button class="btn btn--small" data-edit="' + esc(b.id) + '">Изменить</button><button class="btn btn--small btn--danger" data-del="' + esc(b.id) + '">Удалить</button></div></td></tr>';
    }).join('');
    app.innerHTML = '<div class="section-head"><div><h2>Бренды</h2><p>Производители в каталоге</p></div><button class="btn btn--primary" data-add>+ Добавить бренд</button></div><div class="table-wrap"><table><thead><tr><th>Название</th><th>Описание</th><th>Опубл.</th><th>Действия</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    $('[data-add]', app).addEventListener('click', function () { openModal('Новый бренд', brandFields, { published: true }, async function (f) { await api('/brands', { method: 'POST', body: toBrandPayload(f, {}) }); }); });
    $$('[data-edit]', app).forEach(function (b) { b.addEventListener('click', function () { var x = d.brands.find(function (o) { return o.id === b.dataset.edit; }); openModal('Редактировать бренд', brandFields, fromBrand(x), async function (f) { await api('/brands/' + encodeURIComponent(x.id), { method: 'PUT', body: toBrandPayload(f, x) }); }); }); });
    $$('[data-del]', app).forEach(function (b) { b.addEventListener('click', async function () { if (!confirm('Удалить бренд?')) return; try { await api('/brands/' + encodeURIComponent(b.dataset.del), { method: 'DELETE' }); await refresh(); toast('Бренд удалён'); } catch (e) { toast(e.message, true); } }); });
  }
  function renderPages() {
    var d = state.data;
    var cards = Object.keys(d.pages).map(function (k) {
      var p = d.pages[k];
      return '<div class="card"><h3>' + esc(k) + '</h3><p style="color:var(--muted);font-size:12px">' + esc(p.description.ru) + '</p><p class="mono">' + esc(p.seoTitle && p.seoTitle.ru || '') + '</p><button class="btn btn--small" data-page="' + esc(k) + '">Редактировать</button></div>';
    }).join('');
    app.innerHTML = '<div class="section-head"><div><h2>Страницы и SEO</h2><p>Title, description, H1 и тексты для RU/EN</p></div></div><div class="admin-grid g2">' + cards + '</div>';
    $$('[data-page]', app).forEach(function (b) { b.addEventListener('click', function () { var k = b.dataset.page, p = d.pages[k]; openModal('Страница: ' + k, pageFields, fromPage(k, p), async function (f) { await api('/pages/' + encodeURIComponent(k), { method: 'PUT', body: toPagePayload(f, p) }); }); }); });
  }
  function renderLeads() {
    var d = state.data;
    var rows = d.leads.map(function (l) {
      return '<tr><td>' + esc(fmtDate(l.createdAt)) + '</td><td><strong>' + esc(l.name) + '</strong><br><span class="mono">' + esc(l.email) + '</span></td><td>' + esc(l.phone) + '</td><td>' + esc(l.company || '—') + '</td><td>' + esc(l.message) + '</td><td><select data-status="' + esc(l.id) + '">' + ['new', 'in_progress', 'done', 'spam'].map(function (s) { return '<option value="' + s + '"' + (l.status === s ? ' selected' : '') + '>' + esc(statusLabel(s)) + '</option>'; }).join('') + '</select></td><td><button class="btn btn--small btn--danger" data-del="' + esc(l.id) + '">Удалить</button></td></tr>';
    }).join('') || '<tr><td colspan="7" class="empty">Заявок нет</td></tr>';
    app.innerHTML = '<div class="section-head"><div><h2>Заявки</h2><p>Всего: ' + d.leads.length + ' · новых: ' + d.counts.newLeads + '</p></div></div><div class="table-wrap"><table><thead><tr><th>Дата</th><th>Имя</th><th>Телефон</th><th>Компания</th><th>Сообщение</th><th>Статус</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    $$('[data-status]', app).forEach(function (sel) { sel.addEventListener('change', async function () { try { await api('/leads/' + encodeURIComponent(sel.dataset.status), { method: 'PATCH', body: { status: sel.value } }); await refresh(); toast('Статус обновлён'); } catch (e) { toast(e.message, true); } }); });
    $$('[data-del]', app).forEach(function (b) { b.addEventListener('click', async function () { if (!confirm('Удалить заявку?')) return; try { await api('/leads/' + encodeURIComponent(b.dataset.del), { method: 'DELETE' }); await refresh(); toast('Заявка удалена'); } catch (e) { toast(e.message, true); } }); });
  }
  function renderSettings() {
    var s = state.data.settings;
    app.innerHTML = '<div class="section-head"><div><h2>Настройки сайта</h2><p>Контакты, реквизиты, счётчики и служебные тексты</p></div><button class="btn btn--primary" data-save>Сохранить</button></div><form id="settings-form" class="card"><div class="form-grid">' + settingsFields.map(function (f) { return fieldHtml(f, fromSettings(s)[f.name]); }).join('') + '</div></form>';
    $('#settings-form', app).addEventListener('submit', function (e) { e.preventDefault(); $('[data-save]', app).click(); });
    $('[data-save]', app).addEventListener('click', async function () {
      var form = $('#settings-form', app), payload = collectForm(form, settingsFields);
      try { await api('/settings', { method: 'PUT', body: toSettingsPayload(payload, s) }); await refresh(); toast('Настройки сохранены'); } catch (e) { toast(e.message, true); }
    });
  }
  function renderMedia() {
    var d = state.data;
    var items = d.media.map(function (m) {
      return '<div class="media-item"><img src="' + esc(m.url) + '" alt="" loading="lazy"><div class="media-item__body"><code>' + esc(m.url) + '</code><span class="mono">' + Math.round(m.size / 1024) + ' КБ</span><div class="media-item__actions"><button class="btn btn--small" data-copy="' + esc(m.url) + '">Копировать</button><button class="btn btn--small btn--danger" data-del="' + esc(m.name) + '">Удалить</button></div></div></div>';
    }).join('') || '<div class="empty">Загруженных файлов нет</div>';
    app.innerHTML = '<div class="section-head"><div><h2>Медиа</h2><p>PNG, JPEG или WebP до 3 МБ</p></div><label class="btn btn--primary">Загрузить<input type="file" data-upload accept="image/png,image/jpeg,image/webp" hidden></label></div><div class="media-grid">' + items + '</div>';
    $('[data-upload]', app).addEventListener('change', async function (e) { var f = e.target.files && e.target.files[0]; if (!f) return; try { await uploadImage(f); await refresh(); toast('Файл загружен'); } catch (err) { toast(err.message, true); } });
    $$('[data-copy]', app).forEach(function (b) { b.addEventListener('click', async function () { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Путь скопирован'); } catch (e) { toast(b.dataset.copy); } }); });
    $$('[data-del]', app).forEach(function (b) { b.addEventListener('click', async function () { if (!confirm('Удалить файл?')) return; try { await api('/media/' + encodeURIComponent(b.dataset.del), { method: 'DELETE' }); await refresh(); toast('Файл удалён'); } catch (e) { toast(e.message, true); } }); });
  }
  function renderSecurity() {
    app.innerHTML = '<div class="admin-grid g2"><div class="card"><h2>Смена пароля</h2><form id="password-form"><div class="field"><label for="cur">Текущий пароль</label><input id="cur" name="currentPassword" type="password" required autocomplete="current-password"></div><div class="field"><label for="new">Новый пароль</label><input id="new" name="newPassword" type="password" required minlength="10" autocomplete="new-password"></div><div class="field"><label for="rep">Повторите пароль</label><input id="rep" name="repeatPassword" type="password" required autocomplete="new-password"></div><button class="btn btn--primary" type="submit">Сменить пароль</button></form></div><div class="card"><h2>Сессия</h2><p style="color:var(--muted)">Пользователь: <strong>' + esc(CFG.user.username) + '</strong></p><p style="color:var(--muted)">Роль: <strong>' + esc(CFG.user.role) + '</strong></p><p style="color:var(--muted)">Cookie: <code>azbut_sid</code>, HttpOnly, SameSite=Lax, 7 дней. Все изменяющие запросы защищены CSRF-токеном.</p><div class="alert" style="background:#f5a52418;border:1px solid #f5a52455;color:#ffc66b">Для продакшена задайте <code>SESSION_SECRET</code> и <code>ADMIN_PASSWORD</code> через переменные окружения и включите HTTPS.</div></div></div>';
    $('#password-form', app).addEventListener('submit', async function (e) {
      e.preventDefault();
      var f = e.target, cur = f.currentPassword.value, next = f.newPassword.value, rep = f.repeatPassword.value;
      if (next !== rep) { toast('Пароли не совпадают', true); return; }
      try { await api('/password', { method: 'POST', body: { currentPassword: cur, newPassword: next } }); f.reset(); toast('Пароль изменён'); } catch (err) { toast(err.message, true); }
    });
  }
  function renderAudit() {
    var d = state.data;
    var rows = d.audit.map(function (a) {
      return '<tr><td>' + esc(fmtDate(a.ts)) + '</td><td>' + esc(a.actor || '') + '</td><td>' + esc(a.action || '') + '</td><td>' + esc(a.target || '') + '</td><td class="mono">' + esc(a.ip || '') + '</td></tr>';
    }).join('');
    app.innerHTML = '<div class="section-head"><div><h2>Журнал изменений</h2><p>Последние ' + d.audit.length + ' событий</p></div><a class="btn btn--small" href="/data/audit.log" target="_blank" rel="noopener">Скачать лог ↗</a></div><div class="table-wrap"><table><thead><tr><th>Дата</th><th>Кто</th><th>Действие</th><th>Объект</th><th>IP</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  var renderers = { dashboard: renderDashboard, products: renderProducts, services: renderServices, brands: renderBrands, pages: renderPages, leads: renderLeads, settings: renderSettings, media: renderMedia, security: renderSecurity, audit: renderAudit };
  function render() {
    if (!state.data) return;
    setTitle(state.section); nav();
    (renderers[state.section] || renderDashboard)();
  }
  async function refresh() { state.data = await api('/bootstrap'); render(); }

  var burger = document.querySelector('.admin-burger');
  if (burger && sidebar) burger.addEventListener('click', function () { sidebar.classList.toggle('is-open'); burger.setAttribute('aria-expanded', String(sidebar.classList.contains('is-open'))); });
  $$('.admin-nav a').forEach(function (a) { a.addEventListener('click', function () { if (sidebar) sidebar.classList.remove('is-open'); }); });
  window.addEventListener('hashchange', function () { state.section = (location.hash || '#dashboard').slice(1); render(); });

  refresh().catch(function (e) { app.innerHTML = '<div class="alert alert--error">Не удалось загрузить данные: ' + esc(e.message) + '</div>'; });
})();
