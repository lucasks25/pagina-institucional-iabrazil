/* Contato e navegação: sem autoplay ou dependências adicionais. */
(() => {
  'use strict';
  const dialog = document.querySelector('.ref-dialog');
  const opener = document.querySelector('[data-open-contact]');
  if (dialog && opener) {
    opener.addEventListener('click', () => dialog.showModal());
    dialog.querySelector('.ref-dialog-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
  }
  const region = document.querySelector('.ref-commitment-carousel');
  if (!region) return;
  const track = region.querySelector('.ref-commitment-track');
  const cards = [...track.children];
  const prev = region.querySelector('[data-commit-prev]');
  const next = region.querySelector('[data-commit-next]');
  const count = region.querySelector('[data-commit-position]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const active = () => Math.max(0, Math.min(cards.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
  const update = () => { const index = active(); prev.disabled = index === 0; next.disabled = index === cards.length - 1; count.textContent = `${index + 1} / ${cards.length}`; };
  const move = (index) => track.scrollTo({ left: Math.max(0, Math.min(cards.length - 1, index)) * track.clientWidth, behavior: reduced.matches ? 'auto' : 'smooth' });
  prev.addEventListener('click', () => move(active() - 1));
  next.addEventListener('click', () => move(active() + 1));
  track.addEventListener('keydown', (event) => {
    const keys = { ArrowLeft: active() - 1, ArrowRight: active() + 1, Home: 0, End: cards.length - 1 };
    if (!(event.key in keys)) return;
    event.preventDefault(); move(keys[event.key]);
  });
  let raf;
  track.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); }, { passive: true });
  new ResizeObserver(update).observe(track);
  update();
})();
