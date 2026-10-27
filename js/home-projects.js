/* Projetos: rolagem nativa, sem autoplay e sem dependências. */
(() => {
  'use strict';
  document.querySelectorAll('[data-project-carousel]').forEach((region) => {
    const track = region.querySelector('.project-track');
    const slides = Array.from(track.querySelectorAll('.project-slide'));
    const prev = region.querySelector('[data-project-prev]');
    const next = region.querySelector('[data-project-next]');
    const position = region.querySelector('[data-project-position]');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      const bounds = track.getBoundingClientRect();
      const visible = slides.map((slide, index) => ({ index, box: slide.getBoundingClientRect() }))
        .filter(({ box }) => box.right > bounds.left + 12 && box.left < bounds.right - 12);
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
      if (visible.length) position.textContent = `${visible[0].index + 1}–${visible[visible.length - 1].index + 1} / ${slides.length}`;
    };
    const move = (direction) => {
      const step = slides[0].getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap);
      track.scrollBy({ left: direction * step, behavior: reduced.matches ? 'auto' : 'smooth' });
    };
    prev.addEventListener('click', () => move(-1));
    next.addEventListener('click', () => move(1));
    track.addEventListener('keydown', (event) => {
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        track.scrollTo({ left: event.key === 'Home' ? 0 : track.scrollWidth, behavior: reduced.matches ? 'auto' : 'smooth' });
        return;
      }
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      move(event.key === 'ArrowRight' ? 1 : -1);
    });
    let timer;
    track.addEventListener('scroll', () => {
      clearTimeout(timer);
      timer = setTimeout(update, 120);
    }, { passive: true });
    new ResizeObserver(update).observe(track);
    update();
  });
})();
