#!/usr/bin/env python3
"""Import the real azbut.by catalog from the public Tilda Store API.

Usage:
    python3 scripts/import-tilda.py                 # full import + images
    python3 scripts/import-tilda.py --offline      # reuse cached raw JSON
    python3 scripts/import-tilda.py --limit 50     # smoke run, no damage control

Requires Pillow only for image conversion (`pip install Pillow`). No Node deps.
The Tilda catalog has no real prices, so every imported product keeps
price=None and therefore no schema.org Offer is emitted.
"""

import argparse
import ast
import concurrent.futures
import hashlib
import html
import io
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIT = Path('/home/user/azbut_audit/tilda_products_raw.json')
API = 'https://store.tildaapi.biz/api/getproductslist/'
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
    'Referer': 'https://azbut.by/catalog',
    'Accept': '*/*',
}
IMG_DIR = ROOT / 'public' / 'assets' / 'img' / 'products'
PLACEHOLDER = '/assets/img/placeholder.svg'
ROOT_PART = 686800396042

CYR = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
}


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def plain(value):
    if not value:
        return ''
    if isinstance(value, (list, dict)):
        value = json.dumps(value, ensure_ascii=False)
    p = TextExtractor()
    try:
        p.feed(str(value))
        p.close()
    except Exception:
        return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', str(value))).strip()
    return re.sub(r'\s+', ' ', html.unescape(''.join(p.parts))).strip()


def clip(value, size):
    value = plain(value)
    return value if len(value) <= size else value[:size - 1].rstrip() + '…'


def slugify(value, fallback='item'):
    value = plain(value).lower()
    out = []
    for ch in value:
        if ch in CYR:
            out.append(CYR[ch])
        elif ch.isascii() and (ch.isalnum()):
            out.append(ch)
        else:
            out.append('-')
    slug = re.sub(r'-+', '-', ''.join(out)).strip('-')
    return slug[:70] or fallback


def fetch_slice(index, size=500):
    params = {
        'storepartuid': '686800396042',
        'recid': '2261506411',
        'c': str(int(time.time() * 1000)),
        'getallparts': 'true',
        'getoptions': 'true',
        'slice': str(index),
        'size': str(size),
    }
    req = urllib.request.Request(API + '?' + urllib.parse.urlencode(params), headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode('utf-8', 'replace'))


def load_raw(offline=False):
    if offline and AUDIT.exists():
        return json.loads(AUDIT.read_text(encoding='utf-8'))
    products, meta, index = [], None, 1
    while True:
        data = fetch_slice(index)
        if meta is None:
            meta = {k: v for k, v in data.items() if k != 'products'}
        batch = data.get('products', [])
        products.extend(batch)
        print(f'[tilda] slice {index}: {len(batch)} items, total={data.get("total")}')
        nxt = data.get('nextslice')
        if not nxt or not batch or len(products) >= (data.get('total') or 0):
            break
        index = int(nxt)
        if index > 20:
            break
    seen = {}
    for p in products:
        seen.setdefault(p.get('uid'), p)
    out = {'meta': meta, 'products': list(seen.values())}
    AUDIT.parent.mkdir(parents=True, exist_ok=True)
    AUDIT.write_text(json.dumps(out, ensure_ascii=False), encoding='utf-8')
    return out


def as_list(value):
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return parsed
        except Exception:
            pass
    return []


def part_ids(product):
    raw = product.get('partuids')
    if isinstance(raw, str):
        try:
            raw = ast.literal_eval(raw)
        except Exception:
            return []
    return [str(x) for x in (raw or [])]


def image_urls(product, limit=4):
    urls = []
    for item in as_list(product.get('gallery')):
        u = (item or {}).get('img') if isinstance(item, dict) else None
        if u and u not in urls:
            urls.append(u)
    for item in as_list(product.get('editions')):
        u = (item or {}).get('img') if isinstance(item, dict) else None
        if u and u not in urls:
            urls.append(u)
    return urls[:limit]


def local_name(url):
    return hashlib.sha1(url.encode('utf-8')).hexdigest()[:16] + '.webp'


def download_one(url):
    target = IMG_DIR / local_name(url)
    if target.exists():
        return url, str(target.relative_to(ROOT / 'public')).replace(os.sep, '/'), None
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=45) as resp:
                raw = resp.read()
            from PIL import Image, ImageOps
            im = Image.open(io.BytesIO(raw))
            im = ImageOps.exif_transpose(im).convert('RGB')
            im.thumbnail((700, 700), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, 'WEBP', quality=72, method=5)
            target.write_bytes(buf.getvalue())
            return url, '/assets/img/products/' + target.name, None
        except Exception as exc:
            err = f'{type(exc).__name__}: {exc}'
            time.sleep(0.4 * (attempt + 1))
    return url, PLACEHOLDER, err


def build_products(raw, image_map, limit=None):
    parts = {str(p['uid']): (p.get('title') or '').strip() for p in raw['meta']['parts']}
    now = datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    products = []
    source = raw['products'][:limit] if limit else raw['products']
    used_slugs = set()
    for index, p in enumerate(source):
        uid = str(p.get('uid') or index)
        title = plain(p.get('title')) or f'Артикул {p.get("sku") or uid}'
        sku = plain(p.get('sku')) or uid
        brand = plain(p.get('brand'))
        if not brand:
            for prop in as_list(p.get('properties')):
                if isinstance(prop, dict) and 'бренд' in plain(prop.get('title')).lower():
                    brand = plain(prop.get('values'))
                    break
        brand = brand or 'Без бренда'
        ids = part_ids(p)
        names = [parts[i] for i in ids if parts.get(i)]
        category = names[-1] if names else 'Разное'
        url_path = urllib.parse.urlparse(p.get('url') or '').path.rstrip('/')
        slug = url_path.split('/tproduct/')[-1] if '/tproduct/' in url_path else slugify(title, 'item-' + uid)
        slug = re.sub(r'[^a-zA-Z0-9._-]+', '-', slug).strip('-')[:100] or ('item-' + uid)
        base_slug = slug
        n = 2
        while slug in used_slugs:
            slug = f'{base_slug}-{n}'
            n += 1
        used_slugs.add(slug)
        gallery = [image_map.get(u, PLACEHOLDER) for u in image_urls(p)]
        gallery = [g for g in gallery if g]
        if not gallery:
            gallery = [PLACEHOLDER]
        # De-duplicate placeholder while keeping at least one image.
        gallery = list(dict.fromkeys(gallery)) or [PLACEHOLDER]
        summary = clip(p.get('descr') or p.get('text') or title, 230)
        description = clip(p.get('text') or p.get('descr') or title, 1400)
        specs = [
            {'label': {'ru': 'Артикул', 'en': 'Part number'}, 'value': {'ru': sku, 'en': sku}},
            {'label': {'ru': 'Бренд', 'en': 'Brand'}, 'value': {'ru': brand, 'en': brand}},
            {'label': {'ru': 'Раздел', 'en': 'Category'}, 'value': {'ru': category, 'en': category}},
        ]
        for prop in as_list(p.get('properties'))[:4]:
            if isinstance(prop, dict):
                label = plain(prop.get('title'))
                value = plain(prop.get('values'))
                if label and value:
                    specs.append({'label': {'ru': label, 'en': label}, 'value': {'ru': value, 'en': value}})
        for ch in as_list(p.get('characteristics'))[:4]:
            if isinstance(ch, dict):
                label = plain(ch.get('title') or ch.get('name'))
                value = plain(ch.get('value') or ch.get('values'))
                if label and value:
                    specs.append({'label': {'ru': label, 'en': label}, 'value': {'ru': value, 'en': value}})
        products.append({
            'id': 'tilda-' + uid,
            'slug': slug,
            'sku': sku,
            'brand': brand,
            'category': category,
            # Supplier data is Russian only; EN pages keep the original wording
            # instead of inventing a translation.
            'title': {'ru': title, 'en': title},
            'summary': {'ru': summary, 'en': summary},
            'description': {'ru': description, 'en': description},
            'price': None,
            'currency': 'BYN',
            'priceNote': {'ru': 'Цена по запросу', 'en': 'Price on request'},
            'inStock': False,
            'image': gallery[0],
            'gallery': gallery,
            'specs': specs[:9],
            'published': True,
            'updatedAt': now,
            'seo': {
                'title': {
                    'ru': clip(f'{title} — арт. {sku} | АЗБУТ', 70),
                    'en': clip(f'{title} — part {sku} | AZBUT', 70),
                },
                'description': {
                    'ru': clip(f'{summary} Артикул {sku}, бренд {brand}. Цена и наличие по запросу.', 160),
                    'en': clip(f'{summary} Part {sku}, brand {brand}. Price on request.', 160),
                },
            },
        })
    return products


def build_brands(products, existing):
    by_name = {b['name'].strip().lower(): b for b in existing}
    for p in products:
        name = (p.get('brand') or '').strip()
        if not name or name.lower() in by_name:
            continue
        by_name[name.lower()] = {
            'id': 'br-tilda-' + hashlib.sha1(name.encode('utf-8')).hexdigest()[:8],
            'slug': slugify(name, 'brand'),
            'name': name,
            'description': {
                'ru': f'Запчасти и комплектующие {name}: подбор по артикулу, поставка под заказ.',
                'en': f'{name} spare parts: sourcing by part number, supplied on request.',
            },
            'published': True,
            'updatedAt': datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
        }
    return sorted(by_name.values(), key=lambda b: b['name'].lower())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--offline', action='store_true', help='reuse cached /home/user/azbut_audit/tilda_products_raw.json')
    ap.add_argument('--skip-images', action='store_true', help='do not download/convert photos')
    ap.add_argument('--limit', type=int, default=0, help='import only the first N products (smoke test)')
    args = ap.parse_args()

    try:
        from PIL import Image  # noqa: F401
    except ImportError:
        print('[tilda] WARNING: Pillow not installed; images will use placeholder.svg', file=sys.stderr)

    raw = load_raw(offline=args.offline)
    if args.limit:
        raw = {'meta': raw['meta'], 'products': raw['products'][:args.limit]}
    print(f'[tilda] raw products: {len(raw["products"])}')

    image_map = {}
    urls = sorted({u for p in raw['products'] for u in image_urls(p)})
    print(f'[tilda] unique photos: {len(urls)}')
    if not args.skip_images and urls:
        IMG_DIR.mkdir(parents=True, exist_ok=True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
            futures = [pool.submit(download_one, u) for u in urls]
            done = 0
            for fut in concurrent.futures.as_completed(futures):
                url, local, err = fut.result()
                image_map[url] = local
                done += 1
                if err:
                    print(f'[tilda] image failed {url[:80]} → {err[:100]}', file=sys.stderr)
                if done % 100 == 0:
                    print(f'[tilda] images {done}/{len(urls)}')
    else:
        image_map = {u: PLACEHOLDER for u in urls}

    products = build_products(raw, image_map, limit=args.limit or None)
    existing_brands = json.loads((ROOT / 'seed' / 'brands.json').read_text(encoding='utf-8'))
    brands = build_brands(products, existing_brands)

    payload_products = json.dumps(products, ensure_ascii=False, indent=2) + '\n'
    payload_brands = json.dumps(brands, ensure_ascii=False, indent=2) + '\n'
    for folder in ('data', 'seed'):
        (ROOT / folder / 'products.json').write_text(payload_products, encoding='utf-8')
        (ROOT / folder / 'brands.json').write_text(payload_brands, encoding='utf-8')

    with_photo = sum(1 for p in products if p['image'] != PLACEHOLDER)
    cats = {}
    for p in products:
        cats[p['category']] = cats.get(p['category'], 0) + 1
    print(f'[tilda] imported {len(products)} products, {len(brands)} brands')
    print(f'[tilda] with local photo: {with_photo}; placeholder: {len(products) - with_photo}')
    print('[tilda] categories:', dict(sorted(cats.items(), key=lambda x: -x[1])))
    print('[tilda] prices: all null (source has no real prices)')


if __name__ == '__main__':
    main()
