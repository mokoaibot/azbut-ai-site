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

  // --- GitHub Pages: client-side catalog (all cards live in one static HTML) ---
  if (STATIC) {
    var grid = document.querySelector('.product-grid');
    var filtersForm = document.querySelector('.filters');
    if (grid && filtersForm) {
      var cards = Array.prototype.slice.call(grid.querySelectorAll('.product-card'));
      var meta = document.querySelector('.catalog-meta strong');
      var lang = document.documentElement.lang || 'ru';
      var PAGE_SIZE = 8;
      var state = { page: 1, q: '', brand: '', category: '', sort: '' };

      if (!grid.id) grid.id = 'catalog';

      var note = document.createElement('p');
      note.className = 'form-status is-info catalog-static-note';
      note.textContent = lang === 'en'
        ? 'Static Pages version: search, filters and pagination run in your browser.'
        : 'Статическая версия Pages: поиск, фильтры и пагинация работают в браузере.';
      filtersForm.parentNode.insertBefore(note, filtersForm.nextSibling);

      var empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = '<p>' + (lang === 'en'
        ? 'Nothing found. Try changing the filters.'
        : 'Ничего не найдено. Измените фильтры.') + '</p>';
      grid.parentNode.insertBefore(empty, grid.nextSibling);

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
            cardText(card, '.product-card__summary')
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
      function renderCatalog() {
        var list = sortCards(cards.filter(matches));
        if (meta) meta.textContent = String(list.length);
        var pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
        if (state.page > pages) state.page = pages;
        var start = (state.page - 1) * PAGE_SIZE;
        cards.forEach(function (card) { card.hidden = true; });
        list.forEach(function (card) { grid.appendChild(card); });
        list.slice(start, start + PAGE_SIZE).forEach(function (card) { card.hidden = false; });
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
            a.href = '#catalog';
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
      var resetLink = filtersForm.querySelector('.btn--ghost');
      if (resetLink) resetLink.addEventListener('click', function (e) { e.preventDefault(); filtersForm.reset(); readFilters(); });
      nav.addEventListener('click', function (e) {
        var a = e.target.closest ? e.target.closest('a[data-page]') : null;
        if (!a) return;
        e.preventDefault();
        state.page = Number(a.getAttribute('data-page')) || 1;
        renderCatalog();
        grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
          grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
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
