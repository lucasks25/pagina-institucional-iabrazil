/* Fundo: vídeo e quadros visuais da referência Fueled, hospedados localmente.
   Origem e parâmetros registrados em scripts/dados/background-fueled.json.
   O layout e as interações do site permanecem independentes do background. */
(() => {
  'use strict';
  if (document.querySelector('.fundo')) return;
  // As páginas editoriais mantêm sua superfície branca e a leitura original.
  if (document.body.classList.contains('theme-light')) return;
  const scriptURL = new URL(document.currentScript.src);
  const assets = new URL('../assets/backgrounds/fueled/', scriptURL);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const PLANET_PLAYBACK_RATE = .5;
  const TRANSITION_SECONDS = 12;
  const main = document.querySelector('main');
  const hero = document.querySelector('.a-hero, .page-hero') || main;
  const layer = document.createElement('div');
  layer.className = 'fundo';
  layer.setAttribute('aria-hidden', 'true');
  const video = document.createElement('video');
  video.className = 'fundo-planet';
  video.autoplay = true; video.loop = true; video.muted = true; video.defaultMuted = true;
  video.playsInline = true; video.preload = 'metadata';
  video.defaultPlaybackRate = PLANET_PLAYBACK_RATE; video.playbackRate = PLANET_PLAYBACK_RATE;
  video.disablePictureInPicture = true;
  video.setAttribute('muted', ''); video.setAttribute('playsinline', '');
  video.setAttribute('fetchpriority', 'high'); video.tabIndex = -1;
  video.poster = new URL('planet-poster.jpg', assets).href;
  layer.append(video);
  document.body.prepend(layer);
  document.body.classList.add('has-net');
  document.documentElement.classList.add('has-fueled-background');
  if (!reduced.matches) {
    import(new URL('planet-smooth.js?v=20261027-fluido', scriptURL).href)
      .then(module => module.createPlanetRenderer(video, layer, reduced)).catch(() => {});
  }

  const bands = [];
  // Os três capítulos centrais recebem a passagem clara da referência.
  const lightSections = document.querySelector('.a-hero')
    ? [...document.querySelectorAll('main > #servicos, main > #metodo, main > #por-que')]
    : [];
  let fill;
  if (lightSections.length) {
    lightSections.forEach(section => section.classList.add('bg-is-light'));
    fill = document.createElement('div'); fill.className = 'fundo-light-fill'; layer.append(fill);
    [false, true].forEach(flipped => {
      const element = document.createElement('div');
      element.className = 'fundo-transition' + (flipped ? ' is-flipped' : '');
      const poster = document.createElement('img');
      poster.src = new URL('transition/frame_0001.webp', assets).href;
      poster.alt = ''; poster.width = 192; poster.height = 216; poster.loading = 'lazy';
      const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 216;
      element.append(poster, canvas); layer.append(element);
      bands.push({ element, canvas, context: canvas.getContext('2d', { alpha: false }), visible: false, started: 0, frame: -1, scale: flipped ? .7 : .8 });
    });
  }
  let heroTop = 0, heroHeight = 1, scrollQueued = false, animation = 0;
  let images, preparing, heroVisible = true;
  const positionPlanet = () => {
    scrollQueued = false;
    const progress = Math.max(0, Math.min(1, (scrollY - heroTop) / heroHeight));
    layer.style.setProperty('--planet-y', `${reduced.matches ? 0 : -300 * progress}px`);
  };
  const layout = () => {
    if (hero) {
      const rect = hero.getBoundingClientRect(); heroTop = rect.top + scrollY; heroHeight = rect.height || 1;
    }
    if (fill) {
      const start = lightSections[0].getBoundingClientRect().top + scrollY;
      const last = lightSections[lightSections.length - 1].getBoundingClientRect();
      const end = last.bottom + scrollY;
      const height = Math.min(1440, innerWidth * 1.125);
      fill.style.top = `${start}px`; fill.style.height = `${end - start}px`;
      bands.forEach((band, index) => {
        band.element.style.height = `${height}px`;
        band.element.style.top = `${(index ? end : start) - height * (index ? .44 : .56)}px`;
        band.element.style.setProperty('--transition-scale-y', band.scale);
      });
    }
    positionPlanet();
  };
  const loadVideo = () => {
    if (video.querySelector('source')) return;
    const sources = [['720', 506], ['1080', 760], ['1440', 1012], ['2160', 1518], ['3160', 2222], ['no-resize', 0]];
    sources.forEach(([size, max]) => {
      const source = document.createElement('source');
      source.src = new URL(`planet-${size}.mp4`, assets).href; source.type = 'video/mp4';
      if (max) source.media = `(max-width: ${max}px)`;
      video.append(source);
    });
    video.load();
  };
  const syncVideo = () => {
    if (reduced.matches || document.hidden || !heroVisible) { video.pause(); return; }
    loadVideo(); video.playbackRate = PLANET_PLAYBACK_RATE; video.play().catch(() => {});
  };
  const draw = (band, position) => {
    if (!images || !band.context || band.frame === position) return;
    const index = Math.floor(position), next = Math.min(index + 1, images.length - 1), blend = position - index;
    band.context.globalAlpha = 1;
    band.context.drawImage(images[index], 0, 0, 192, 216);
    if (blend > 0) { band.context.globalAlpha = blend; band.context.drawImage(images[next], 0, 0, 192, 216); }
    band.context.globalAlpha = 1;
    band.frame = position; band.element.classList.add('is-loaded');
  };
  const tick = (now) => {
    animation = 0;
    if (reduced.matches || document.hidden || !images) return;
    const visible = bands.filter(band => band.visible);
    visible.forEach(band => {
      if (!band.started) band.started = now;
      // A sequência original de 118 quadros avança lentamente em um ciclo de 12 segundos.
      const frame = (((now - band.started) / 1000) % TRANSITION_SECONDS) / TRANSITION_SECONDS * 117;
      draw(band, frame);
    });
    if (visible.length) animation = requestAnimationFrame(tick);
  };
  const start = () => { if (!animation && images && !reduced.matches && !document.hidden && bands.some(b => b.visible)) animation = requestAnimationFrame(tick); };
  const prepare = async () => {
    if (preparing || images || reduced.matches) return;
    preparing = true;
    try {
      const module = await import(new URL('vendor/stackblur-es.min.js', scriptURL).href);
      const loaded = new Array(118); let cursor = 0;
      const worker = async () => {
        while (cursor < 118) {
          const index = cursor++;
          const image = new Image(); image.decoding = 'async';
          image.src = new URL(`transition/frame_${String(index + 1).padStart(4, '0')}.webp`, assets).href;
          await image.decode();
          // O desfoque original é calculado uma única vez por quadro.
          // Na reprodução, cada frame só precisa de uma operação drawImage.
          const prepared = document.createElement('canvas'); prepared.width = 192; prepared.height = 216;
          const context = prepared.getContext('2d', { willReadFrequently: true });
          if (!context) throw new Error('Canvas unavailable');
          context.drawImage(image, 0, 0, 192, 216);
          module.canvasRGBA(prepared, 0, 0, 192, 216, 10);
          if (typeof createImageBitmap === 'function') {
            loaded[index] = await createImageBitmap(prepared); prepared.width = 0; prepared.height = 0;
          } else loaded[index] = prepared;
          image.removeAttribute('src');
        }
      };
      await Promise.all(Array.from({ length: 6 }, worker));
      images = loaded;
      bands.forEach(band => draw(band, 0)); start();
    } catch { /* O primeiro quadro permanece visível quando a rede está indisponível. */ }
    preparing = false;
  };
  if ('IntersectionObserver' in window) {
    const videoObserver = new IntersectionObserver(entries => { heroVisible = entries[0].isIntersecting; syncVideo(); });
    videoObserver.observe(video);
    const preloader = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) prepare(); }, { rootMargin: '800px 0px' });
    const visibility = new IntersectionObserver(entries => {
      entries.forEach(entry => { const band = bands.find(item => item.element === entry.target); band.visible = entry.isIntersecting; band.started = 0; });
      start();
    });
    bands.forEach(band => { preloader.observe(band.element); visibility.observe(band.element); });
  } else { bands.forEach(band => { band.visible = true; }); prepare(); }
  window.addEventListener('scroll', () => { if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(positionPlanet); } }, { passive: true });
  window.addEventListener('resize', layout, { passive: true });
  if (main && 'ResizeObserver' in window) new ResizeObserver(layout).observe(main);
  document.fonts?.ready.then(layout);
  document.addEventListener('visibilitychange', () => { syncVideo(); start(); });
  reduced.addEventListener('change', () => {
    positionPlanet(); syncVideo();
    if (reduced.matches) { cancelAnimationFrame(animation); animation = 0; bands.forEach(band => draw(band, 0)); }
    else { prepare(); start(); }
  });
  window.addEventListener('pagehide', () => { video.pause(); cancelAnimationFrame(animation); animation = 0; });
  window.addEventListener('pageshow', () => { layout(); syncVideo(); start(); });
  layout(); syncVideo();
})();
