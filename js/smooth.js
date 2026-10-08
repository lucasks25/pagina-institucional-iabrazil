/* IA BRAZIL — rolagem suave com Lenis (js/vendor/lenis.min.js).
   Fica desligada para quem prefere menos movimento; em telas de toque a rolagem continua nativa. */
(() => {
  'use strict';

  if (!window.Lenis || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const header = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-h'), 10) || 64;
  // Nas subpáginas a barra de navegação da página também gruda no topo
  const subnav = document.querySelector('.subnav');
  const offset = header + (subnav ? subnav.offsetHeight : 0) + 16;
  new window.Lenis({ autoRaf: true, lerp: 0.12, anchors: { offset: -offset }, stopInertiaOnNavigate: true });
})();
