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
