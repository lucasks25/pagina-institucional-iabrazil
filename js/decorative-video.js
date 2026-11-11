const videos = document.querySelectorAll('video[data-src]');

if (videos.length) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const supportsObserver = 'IntersectionObserver' in window;
  const buttons = new Map([...document.querySelectorAll('[data-video-toggle]')]
    .map(button => [button.getAttribute('aria-controls'), button]));
  const playback = new Map();

  for (const video of videos) {
    const button = buttons.get(video.id);
    let inView = !supportsObserver;
    let playRequested = true;

    function syncPlayback() {
      if (button) {
        button.hidden = reducedMotion.matches;
        button.textContent = playRequested ? 'Pausar animação' : 'Reproduzir animação';
      }

      if (!inView || document.hidden || reducedMotion.matches || !playRequested) {
        if (!video.paused) video.pause();
        return;
      }

      if (!video.getAttribute('src')) {
        video.src = video.dataset.src;
        video.load();
      }

      if (video.paused) {
        video.play().catch(error => {
          if (!button || error.name === 'AbortError') return;
          playRequested = false;
          syncPlayback();
        });
      }
    }

    button?.addEventListener('click', () => {
      playRequested = !playRequested;
      syncPlayback();
    });

    playback.set(video, {
      syncPlayback,
      setInView(visible) {
        inView = visible;
        syncPlayback();
      },
    });
    syncPlayback();
  }

  if (supportsObserver) {
    const observer = new IntersectionObserver(entries => {
      for (const {target, isIntersecting} of entries) {
        playback.get(target).setInView(isIntersecting);
      }
    }, {rootMargin: '100px'});
    videos.forEach(video => observer.observe(video));
  }

  const syncAll = () => playback.forEach(({syncPlayback}) => syncPlayback());
  reducedMotion.addEventListener('change', syncAll);
  document.addEventListener('visibilitychange', syncAll);
}
