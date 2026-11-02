'use strict';

const CYRILLIC = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',і:'i',ў:'u',ґ:'g'
};

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .split('')
    .map(ch => CYRILLIC[ch] !== undefined ? CYRILLIC[ch] : ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item-' + Date.now().toString(36);
}

function isSlug(value) { return /^[a-z0-9][a-z0-9-]{1,79}$/.test(String(value || '')); }

function cleanText(value, max = 2000) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .trim()
    .slice(0, max);
}

function cleanUrl(value, allowExternal = false) {
  const v = cleanText(value, 500);
  if (!v) return '';
  if (/^\/assets\/[a-z0-9_\-./]+$/i.test(v)) return v;
  if (allowExternal && /^(https?:\/\/|viber:\/\/)[^\s"'<>]+$/i.test(v)) return v;
  if (/^\/[a-z0-9_\-./?#]*$/i.test(v)) return v;
  return '';
}

function isEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(value || '').trim()); }
function isPhone(value) { return /^\+?[0-9 ()\-]{7,25}$/.test(String(value || '').trim()); }
function bool(value) { return value === true || value === 'true' || value === 'on' || value === 1 || value === '1'; }
function numberOrNull(value) {
  if (value === '' || value == null) return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}
function id(prefix) { return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }
function pick(obj, keys) { const out = {}; for (const k of keys) if (obj && Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k]; return out; }
function localized(ru, en) { return { ru: cleanText(ru), en: cleanText(en) }; }

function validateLead(payload) {
  const name = cleanText(payload.name, 120);
  const company = cleanText(payload.company, 160);
  const email = cleanText(payload.email, 160);
  const phone = cleanText(payload.phone, 40);
  const message = cleanText(payload.message, 2000);
  const website = cleanText(payload.website, 120);
  const errors = [];
  if (website) throw Object.assign(new Error('Spam detected'), { status: 400, spam: true });
  if (name.length < 2) errors.push('name');
  if (!isEmail(email)) errors.push('email');
  if (!isPhone(phone)) errors.push('phone');
  if (message.length < 5) errors.push('message');
  if (errors.length) throw Object.assign(new Error('Invalid form: ' + errors.join(', ')), { status: 422, fields: errors });
  return {
    name, company, email, phone, message,
    productId: cleanText(payload.productId, 60) || null,
    source: cleanUrl(payload.source) || '/',
    status: 'new',
    createdAt: new Date().toISOString(),
    id: id('ld')
  };
}

function validateProduct(payload, existing = {}) {
  const slug = slugify(payload.slug || payload.titleRu || existing.slug);
  if (!isSlug(slug)) throw Object.assign(new Error('Invalid slug'), { status: 422 });
  const titleRu = cleanText(payload.titleRu, 200);
  const titleEn = cleanText(payload.titleEn, 200) || titleRu;
  if (!titleRu) throw Object.assign(new Error('Title is required'), { status: 422 });
  const price = numberOrNull(payload.price);
  return {
    id: existing.id || id('pr'),
    slug,
    sku: cleanText(payload.sku, 80) || slug.toUpperCase(),
    brand: cleanText(payload.brand, 80),
    category: cleanText(payload.category, 80),
    title: localized(titleRu, titleEn),
    summary: localized(cleanText(payload.summaryRu, 400), cleanText(payload.summaryEn, 400) || cleanText(payload.summaryRu, 400)),
    description: localized(cleanText(payload.descriptionRu, 4000), cleanText(payload.descriptionEn, 4000) || cleanText(payload.descriptionRu, 4000)),
    price,
    currency: 'BYN',
    priceNote: price === null ? localized('Цена по запросу', 'Price on request') : null,
    inStock: price !== null && bool(payload.inStock),
    image: cleanUrl(payload.image) || '/assets/img/placeholder.svg',
    gallery: Array.isArray(existing.gallery) && existing.gallery.length ? existing.gallery : [cleanUrl(payload.image) || '/assets/img/placeholder.svg'],
    specs: Array.isArray(existing.specs) ? existing.specs : [],
    published: bool(payload.published),
    updatedAt: new Date().toISOString(),
    seo: {
      title: localized(cleanText(payload.seoTitleRu, 200) || (titleRu + ' — купить оптом | АЗБУТ'), cleanText(payload.seoTitleEn, 200) || (titleEn + ' — wholesale | AZBUT')),
      description: localized(cleanText(payload.seoDescriptionRu, 300) || cleanText(payload.summaryRu, 300), cleanText(payload.seoDescriptionEn, 300) || cleanText(payload.summaryRu, 300))
    }
  };
}

module.exports = {
  slugify, isSlug, cleanText, cleanUrl, isEmail, isPhone, bool, numberOrNull, id, pick, localized,
  validateLead, validateProduct
};
