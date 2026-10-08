/* IA BRAZIL — página de notícia (src/noticias/*.html): barra de leitura no topo e botão "copiar link". */
(() => {
  'use strict';

  // Barra de leitura: enche conforme a pessoa avança no texto da matéria
  const bar = document.querySelector('.news-progress i');
  const body = document.querySelector('.news-article-body');
  if (bar && body) {
    let ticking = false;
    const update = () => {
      ticking = false;
      const r = body.getBoundingClientRect();
      const total = r.height - window.innerHeight * 0.5;
      const k = Math.min(1, Math.max(0, (window.innerHeight * 0.3 - r.top) / Math.max(1, total)));
      bar.style.transform = `scaleX(${k})`;
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  }

  // Copiar link da notícia
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        btn.classList.add('is-done');
        btn.setAttribute('aria-label', 'Link copiado');
        setTimeout(() => { btn.classList.remove('is-done'); btn.setAttribute('aria-label', 'Copiar link'); }, 2000);
      } catch {
        window.prompt('Copie o link da notícia:', btn.dataset.copy);
      }
    });
  });
})();
