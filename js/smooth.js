/* Navegação nativa: sem um segundo motor disputando a rolagem do navegador.
   Menu transparente, recolhido ao descer e visível ao subir, como na referência. */
(() => {
  'use strict';
  const header = document.querySelector('.nav--fueled');
  if (!header) return;
  let last = scrollY, direction = 0, queued = false;
  const update = () => {
    queued = false;
    const current = Math.max(0, scrollY), delta = current - last;
    if ((delta > 0 && direction < 0) || (delta < 0 && direction > 0)) direction = 0;
    direction += delta;
    const locked = header.classList.contains('nav-open') || header.contains(document.activeElement);
    if (current < 120 || locked || direction < -6) header.classList.remove('is-hidden');
    else if (direction > 6) header.classList.add('is-hidden');
    const center = header.getBoundingClientRect().height / 2;
    const light = document.body.classList.contains('theme-light') || [...document.querySelectorAll('.bg-is-light')].some(section => {
      const rect = section.getBoundingClientRect();
      return rect.top + 100 < center && rect.bottom - 100 > center;
    });
    header.classList.toggle('is-over-light', light && !header.classList.contains('nav-open'));
    last = current;
  };
  window.addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  header.addEventListener('focusin', () => header.classList.remove('is-hidden'));
  header.querySelectorAll('.nav-link').forEach(link => link.addEventListener('click', event => { if (event.detail > 0) link.blur(); }));
  const toggle = header.querySelector('.menu-toggle');
  toggle?.addEventListener('click', () => {
    header.classList.remove('is-hidden'); update();
    if (header.classList.contains('nav-open')) header.querySelector('.nav-link')?.focus();
  });
  header.addEventListener('keydown', event => {
    if (!header.classList.contains('nav-open')) return;
    if (event.key === 'Escape') { toggle?.focus(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...header.querySelectorAll('a,button')];
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  header.querySelectorAll('.nav-link').forEach(link => {
    const url = new URL(link.href);
    if (url.pathname === location.pathname && !url.hash) link.setAttribute('aria-current', 'page');
  });
  update();
})();
