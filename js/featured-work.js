const section = document.querySelector('#cases');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

if (section && !reduceMotion.matches && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    let delay = 0;

    for (const { target, isIntersecting } of entries) {
      if (!isIntersecting) continue;
      observer.unobserve(target);
      target.classList.remove('is-awaiting-reveal');
      target.style.setProperty('--work-delay', `${delay}ms`);
      target.classList.add('is-entering');
      delay += 58;
    }
  }, { threshold: 0.08 });

  for (const card of section.querySelectorAll('.work-card')) {
    if (card.getBoundingClientRect().top >= innerHeight) {
      card.classList.add('is-awaiting-reveal');
    }
    observer.observe(card);
    card.addEventListener('focus', () => {
      observer.unobserve(card);
      card.classList.remove('is-awaiting-reveal', 'is-entering');
    }, { once: true });
  }
}
