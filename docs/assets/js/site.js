window.__AZBUT_STATIC__=true;
(function () {
  'use strict';
  var STATIC = !!window.__AZBUT_STATIC__;
  var burger = document.querySelector('.burger');
  var menu = document.getElementById('mobile-menu');
  function closeMenu() {
    if (!burger || !menu) return;
    burger.setAttribute('aria-expanded', 'false');
    menu.hidden = true;
  }
  if (burger && menu) {
    burger.addEventListener('click', function () {
      var open = burger.getAttribute('aria-expanded') === 'true';
      burger.setAttribute('aria-expanded', String(!open));
      menu.hidden = open;
    });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) closeMenu(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
    window.addEventListener('resize', function () { if (window.innerWidth > 960) closeMenu(); });
  }

  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (!id || id === '#') return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (history.pushState) history.pushState(null, '', id);
    });
  });

  document.querySelectorAll('[data-lead-form]').forEach(function (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var status = form.querySelector('.form-status');
      if (STATIC) {
        if (status) { status.textContent = 'Статическая версия на GitHub Pages: заявки принимает только основной сайт с Node.js-сервером.'; status.className = 'form-status is-info'; }
        return;
      }
      if (typeof form.checkValidity === 'function' && !form.checkValidity()) {
        form.reportValidity();
        return;
      }
      var button = form.querySelector('button[type="submit"]');
      var original = button ? button.textContent : '';
      if (status) { status.textContent = status.dataset.sending || 'Отправляем…'; status.className = 'form-status'; }
      if (button) { button.disabled = true; button.textContent = status ? status.dataset.sending : original; }
      try {
        var res = await fetch('/api/lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json', 'X-CSRF-Token': form.querySelector('[name="_csrf"]').value },
          body: new URLSearchParams(new FormData(form)).toString()
        });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.ok) throw new Error(data.error || 'Request failed');
        if (status) { status.textContent = status.dataset.success || 'Спасибо!'; status.className = 'form-status is-ok'; }
        form.reset();
      } catch (err) {
        if (status) { status.textContent = status.dataset.error || 'Ошибка отправки'; status.className = 'form-status is-error'; }
      } finally {
        if (button) { button.disabled = false; button.textContent = original; }
      }
    });
  });

  // --- GitHub Pages: client-side catalog (BIKAI-like sidebar + dense grid) ---
  if (STATIC) {
    var grid = document.querySelector('.catalog-grid');
    var filtersForm = document.querySelector('.catalog-filters');
    if (grid && filtersForm) {
      var cards = Array.prototype.slice.call(grid.querySelectorAll('.catalog-card'));
      var meta = document.querySelector('#catalog-count');
      var rangeEl = document.querySelector('#catalog-range');
      var titleEl = document.querySelector('#catalog-title');
      var lang = document.documentElement.lang || 'ru';
      // Плотность: 5 рядов по 5 на широком экране, меньше на узком.
      function pageSize() {
        var w = window.innerWidth || 1440;
        return w < 640 ? 10 : w < 960 ? 15 : 25;
      }
      var state = { page: 1, q: '', brand: '', category: '', sort: '' };

      if (!grid.id) grid.id = 'catalog';

      var note = document.createElement('p');
      note.className = 'form-status is-info catalog-static-note';
      note.textContent = lang === 'en'
        ? 'Static Pages version: search, filters and pagination run in your browser.'
        : 'Статическая версия Pages: поиск, фильтры и пагинация работают в браузере.';
      filtersForm.parentNode.insertBefore(note, filtersForm.nextSibling);

      var empty = document.getElementById('catalog-empty');
      if (!empty) {
        empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.id = 'catalog-empty';
        empty.innerHTML = '<p>' + (lang === 'en'
          ? 'Nothing found. Try changing the filters.'
          : 'Ничего не найдено. Измените фильтры.') + '</p>';
        grid.parentNode.insertBefore(empty, grid.nextSibling);
      }

      var nav = document.createElement('nav');
      nav.className = 'pagination';
      nav.setAttribute('aria-label', lang === 'en' ? 'Pagination' : 'Пагинация');
      var ol = document.createElement('ol');
      nav.appendChild(ol);
      grid.parentNode.insertBefore(nav, empty.nextSibling);

      function cardText(card, selector) {
        var el = card.querySelector(selector);
        return el ? el.textContent.trim() : '';
      }
      function cardPrice(card) {
        var raw = card.getAttribute('data-price');
        return raw === null || raw === '' ? null : Number(raw);
      }
      function matches(card) {
        if (state.brand && card.getAttribute('data-brand') !== state.brand) return false;
        if (state.category && card.getAttribute('data-category') !== state.category) return false;
        if (state.q) {
          var hay = [
            card.getAttribute('data-title') || '',
            card.getAttribute('data-sku') || '',
            card.getAttribute('data-brand') || '',
            cardText(card, '.catalog-card__tagline')
          ].join(' ').toLowerCase();
          if (hay.indexOf(state.q.toLowerCase()) === -1) return false;
        }
        return true;
      }
      function sortCards(list) {
        var out = list.slice();
        if (state.sort === 'name') {
          out.sort(function (a, b) {
            return (a.getAttribute('data-title') || '').localeCompare(b.getAttribute('data-title') || '', lang);
          });
        } else if (state.sort === 'price_asc' || state.sort === 'price_desc') {
          out.sort(function (a, b) {
            var av = cardPrice(a), bv = cardPrice(b);
            av = av === null ? Infinity : av;
            bv = bv === null ? Infinity : bv;
            return state.sort === 'price_asc' ? av - bv : bv - av;
          });
        }
        return out;
      }
      function setSelect(sel, val) {
        if (!sel) return;
        try { sel.value = val; } catch (e) { /* read-only DOM shim */ }
        Array.prototype.forEach.call(sel.options || [], function (o) {
          if ((o.getAttribute('value') || '') === val) o.setAttribute('selected', 'selected');
          else o.removeAttribute('selected');
        });
      }
      // Раздел живёт в адресе, но переход не перезагружает страницу.
      function readUrl() {
        try {
          if (!window.location || !window.location.search) return;
          var p = new URLSearchParams(window.location.search);
          state.q = p.get('q') || '';
          state.brand = p.get('brand') || '';
          state.category = p.get('category') || '';
          state.sort = p.get('sort') || '';
          state.page = Math.max(1, Number(p.get('page')) || 1);
          var q = filtersForm.querySelector('[name="q"]');
          if (q) q.value = state.q;
          setSelect(filtersForm.querySelector('[name="brand"]'), state.brand);
          setSelect(filtersForm.querySelector('[name="category"]'), state.category);
          setSelect(filtersForm.querySelector('[name="sort"]'), state.sort);
        } catch (e) { /* no query / unsupported */ }
      }
      function syncUrl() {
        try {
          if (!window.history || typeof window.history.replaceState !== 'function' || !window.location) return;
          var p = new URLSearchParams();
          if (state.q) p.set('q', state.q);
          if (state.brand) p.set('brand', state.brand);
          if (state.category) p.set('category', state.category);
          if (state.sort) p.set('sort', state.sort);
          if (state.page > 1) p.set('page', String(state.page));
          var qs = p.toString();
          window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : '') + (window.location.hash || ''));
        } catch (e) { /* ignore */ }
      }
      // Мгновенный возврат к началу списка без анимации; только если ушли ниже него.
      function revealGridTop() {
        try {
          if (typeof window.scrollTo !== 'function' || !grid.getBoundingClientRect) return;
          var y = window.pageYOffset || document.documentElement.scrollTop || 0;
          var top = grid.getBoundingClientRect().top + y;
          if (y <= top + 80) return;
          var root = document.documentElement;
          var prev = root.style ? root.style.scrollBehavior : '';
          if (root.style) root.style.scrollBehavior = 'auto';
          window.scrollTo(0, Math.max(0, top - 90));
          if (root.style) root.style.scrollBehavior = prev;
        } catch (e) { /* no scrolling API */ }
      }
      function syncCategoryNav() {
        document.querySelectorAll('.catalog-cat[data-cat]').forEach(function (a) {
          var active = (a.getAttribute('data-cat') || '') === state.category;
          a.setAttribute('class', active ? 'catalog-cat is-active' : 'catalog-cat');
          if (active) a.setAttribute('aria-current', 'page');
          else a.removeAttribute('aria-current');
        });
        if (titleEl) titleEl.textContent = state.category || (lang === 'en' ? 'All products' : 'Все товары');
      }
      function renderCatalog() {
        var size = pageSize();
        var list = sortCards(cards.filter(matches));
        if (meta) meta.textContent = String(list.length);
        syncCategoryNav();
        var pages = Math.max(1, Math.ceil(list.length / size));
        if (state.page > pages) state.page = pages;
        var start = (state.page - 1) * size;
        var end = Math.min(start + size, list.length);
        if (rangeEl) rangeEl.textContent = list.length
          ? (lang === 'en' ? 'showing ' : 'показано ') + (start + 1) + '–' + end + (lang === 'en' ? ' of ' : ' из ') + list.length
          : '';
        cards.forEach(function (card) { card.hidden = true; });
        list.forEach(function (card) { grid.appendChild(card); });
        list.slice(start, end).forEach(function (card) { card.hidden = false; });
        grid.hidden = list.length === 0;
        empty.hidden = list.length > 0;
        ol.innerHTML = '';
        if (pages > 1 && list.length > 0) {
          var shown = new Set([1, pages, state.page]);
          for (var i = state.page - 2; i <= state.page + 2; i++) if (i >= 1 && i <= pages) shown.add(i);
          var nums = Array.from(shown).sort(function (a, b) { return a - b; });
          function addPage(n, label) {
            var li = document.createElement('li');
            var a = document.createElement('a');
            a.href = '?page=' + n;
            a.textContent = label || String(n);
            a.setAttribute('data-page', String(n));
            if (!label && n === state.page) { a.className = 'is-active'; a.setAttribute('aria-current', 'page'); }
            if (label) a.setAttribute('aria-label', label === '←'
              ? (lang === 'en' ? 'Previous page' : 'Предыдущая страница')
              : (lang === 'en' ? 'Next page' : 'Следующая страница'));
            li.appendChild(a);
            ol.appendChild(li);
          }
          if (state.page > 1) addPage(state.page - 1, '←');
          var last = 0;
          nums.forEach(function (n) {
            if (n - last > 1) {
              var gap = document.createElement('li');
              gap.innerHTML = '<span aria-hidden="true">…</span>';
              ol.appendChild(gap);
            }
            addPage(n);
            last = n;
          });
          if (state.page < pages) addPage(state.page + 1, '→');
          nav.hidden = false;
        } else {
          nav.hidden = true;
        }
      }
      function readFilters() {
        var q = filtersForm.querySelector('[name="q"]');
        var brand = filtersForm.querySelector('[name="brand"]');
        var category = filtersForm.querySelector('[name="category"]');
        var sort = filtersForm.querySelector('[name="sort"]');
        state.q = q ? q.value.trim() : '';
        state.brand = brand ? brand.value : '';
        state.category = category ? category.value : '';
        state.sort = sort ? sort.value : '';
        state.page = 1;
        syncUrl();
        renderCatalog();
      }
      filtersForm.addEventListener('submit', function (e) { e.preventDefault(); readFilters(); });
      filtersForm.addEventListener('change', function (e) { if (e.target && e.target.name) readFilters(); });
      var qInput = filtersForm.querySelector('[name="q"]');
      if (qInput) {
        var debounce;
        qInput.addEventListener('input', function () {
          clearTimeout(debounce);
          debounce = setTimeout(readFilters, 180);
        });
      }
      var resetLink = filtersForm.querySelector('.catalog-reset');
      if (resetLink) resetLink.addEventListener('click', function (e) { e.preventDefault(); filtersForm.reset(); readFilters(); });
      document.querySelectorAll('.catalog-cat[data-cat]').forEach(function (a) {
        a.addEventListener('click', function (e) {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (typeof e.button === 'number' && e.button !== 0)) return;
          e.preventDefault();
          setSelect(filtersForm.querySelector('[name="category"]'), a.getAttribute('data-cat') || '');
          readFilters();
          revealGridTop();
        });
      });
      nav.addEventListener('click', function (e) {
        var a = e.target.closest ? e.target.closest('a[data-page]') : null;
        if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        state.page = Number(a.getAttribute('data-page')) || 1;
        syncUrl();
        renderCatalog();
        revealGridTop();
      });
      document.querySelectorAll('form[method="get"]').forEach(function (form) {
        if (form === filtersForm) return;
        var action = form.getAttribute('action') || '';
        if (action.indexOf('/catalog') === -1) return;
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var input = form.querySelector('[name="q"]');
          var target = filtersForm.querySelector('[name="q"]');
          if (input && target) target.value = input.value;
          readFilters();
          revealGridTop();
        });
      });
      var resizeTimer;
      window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(renderCatalog, 120);
      });
      readUrl();
      syncUrl();
      renderCatalog();
    }
  }

  var mainImage = document.getElementById('product-main-image');
  if (mainImage) {
    document.querySelectorAll('[data-gallery-src]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        mainImage.src = btn.dataset.gallerySrc;
        document.querySelectorAll('[data-gallery-src]').forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
      });
    });
  }
})();
