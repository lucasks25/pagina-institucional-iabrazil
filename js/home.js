/* IA BRAZIL — interações só da página inicial: campo do topo, método em cartões, fotos do formulário,
   frase que acende com a rolagem e perguntas em abas. O formulário em si fica em js/main.js. */
(() => {
  'use strict';

  // Idioma da página (en/index.html usa os textos em inglês e a calculadora em dólar)
  const EN = document.documentElement.lang.startsWith('en');
  const t = (pt, en) => (EN ? en : pt);

  /* Topo: primeiro passo com um campo só. Valida o e-mail, leva ao formulário completo já preenchido */
  const capture = document.querySelector('[data-hero-capture]');
  if (capture) {
    const email = capture.querySelector('input[type=email]');
    const hint = document.getElementById('hero-hint');
    capture.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
        hint.textContent = t('Informe um e-mail válido, ex.: nome@empresa.com.br', 'Enter a valid e-mail, e.g. name@company.com');
        email.setAttribute('aria-invalid', 'true');
        email.focus();
        return;
      }
      hint.textContent = '';
      email.removeAttribute('aria-invalid');
      // Guarda o e-mail na hora (sem esperar resposta) e segue para o formulário completo
      if (window.Leads && window.Leads.saveEmail) window.Leads.saveEmail(v, location.pathname);
      const main = document.getElementById('form-contato');
      const target = document.getElementById('analise');
      if (main) {
        const field = main.elements.email;
        if (field) { field.value = v; field.dispatchEvent(new Event('input')); }
      }
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Leva o foco para a primeira pergunta do formulário (a primeira opção da etapa 1)
      const first = main && main.querySelector('[data-step] input:not([type=hidden]), input[name=nome]');
      if (first) setTimeout(() => first.focus({ preventScroll: true }), 700);
    });
  }

  /* Método: quatro cartões. O ativo aproxima a foto e abre o painel; a linha do topo enche até a fase ativa.
     Avança sozinho a cada 6 s; com o mouse em cima, o cartão sob o cursor vira o ativo e o avanço pausa.
     Clique ou Enter/Espaço fixam a fase; setas mudam de fase. No celular vira carrossel e não avança sozinho. */
  document.querySelectorAll('[data-steps4]').forEach((list) => {
    const cards = Array.from(list.querySelectorAll('.s4'));
    const trilha = list.previousElementSibling && list.previousElementSibling.classList.contains('trilha') ? list.previousElementSibling : null;
    const marks = trilha ? Array.from(trilha.querySelectorAll('i')) : [];
    let current = 0, timer = 0, chosen = false, inView = false;
    const small = window.matchMedia('(max-width: 600px)');
    const show = (i) => {
      current = (i + cards.length) % cards.length;
      cards.forEach((c, k) => c.classList.toggle('is-active', k === current));
      marks.forEach((m, k) => m.classList.toggle('is-on', k <= current));
      if (trilha) trilha.style.setProperty('--trilha', (current / (cards.length - 1)).toFixed(3));
      list.style.setProperty('--s4-run', 'none');
      void list.offsetWidth; // reinicia a barra de tempo
      list.style.removeProperty('--s4-run');
    };
    const auto = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stop = () => { clearInterval(timer); timer = 0; list.classList.remove('is-playing'); };
    const play = () => {
      if (!auto || chosen || timer || !inView || small.matches) return;
      list.classList.add('is-playing');
      timer = setInterval(() => show(current + 1), 6000);
    };
    const hover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    cards.forEach((c, i) => {
      c.addEventListener('click', () => { chosen = true; stop(); show(i); });
      c.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chosen = true; stop(); show(i); return; }
        const go = { ArrowRight: i + 1, ArrowLeft: i - 1 }[e.key];
        if (go === undefined) return;
        e.preventDefault(); chosen = true; stop(); show(go); cards[current].focus();
      });
      c.addEventListener('focus', () => { stop(); show(i); });
      if (hover) c.addEventListener('mouseenter', () => show(i));
    });
    list.addEventListener('mouseenter', stop);
    list.addEventListener('mouseleave', play);
    show(0);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { inView = e.isIntersecting; if (inView) play(); else stop(); }, { threshold: 0.35 }).observe(list);
    }
  });

  /* Fotos do formulário: trocam sozinhas a cada 5 s, com transição suave */
  document.querySelectorAll('[data-carousel]').forEach((box) => {
    const imgs = Array.from(box.querySelectorAll('img'));
    const dots = Array.from(box.querySelectorAll('.lead-dots span'));
    if (imgs.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let i = 0;
    setInterval(() => {
      if (document.hidden) return;
      imgs[i].classList.remove('is-on'); if (dots[i]) dots[i].classList.remove('is-on');
      i = (i + 1) % imgs.length;
      imgs[i].classList.add('is-on'); if (dots[i]) dots[i].classList.add('is-on');
    }, 5000);
  });

  /* Ofertas: as cenas animadas (lupa e plataforma) só rodam enquanto estão na tela */
  document.querySelectorAll('.scene').forEach((el) => {
    if (!('IntersectionObserver' in window)) { el.classList.add('is-live'); return; }
    new IntersectionObserver(([e]) => el.classList.toggle('is-live', e.isIntersecting), { threshold: 0.25 }).observe(el);
  });

  /* Frase grande: as palavras acendem uma a uma conforme a pessoa rola a página */
  document.querySelectorAll('[data-scroll-text]').forEach((el) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Quebra o texto em palavras (mantendo os <strong>), cada uma num <span>
    const wrapWords = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.append(part); return; }
            const w = document.createElement('span');
            w.className = 'sw';
            w.textContent = part;
            frag.append(w);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1) wrapWords(child);
      });
    };
    wrapWords(el);
    const words = Array.from(el.querySelectorAll('.sw'));
    el.classList.add('is-scrolly');
    let ticking = false;
    const update = () => {
      ticking = false;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // Começa quando o topo da frase passa de 85% da tela e termina quando o fim passa de 40%
      const k = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.45)));
      const lit = Math.round(k * words.length);
      words.forEach((w, i) => w.classList.toggle('is-lit', i < lit));
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
  });

  /* Calculadora do custo do trabalho manual: atualiza na hora, sem pedir contato.
     O botão leva a estimativa para o campo "maior gargalo" do formulário. */
  document.querySelectorAll('[data-calc]').forEach((box) => {
    const locale = t('pt-BR', 'en-US');
    const brl = new Intl.NumberFormat(locale, { style: 'currency', currency: t('BRL', 'USD'), maximumFractionDigits: 0 });
    const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    const to = t('a', 'to');
    const $ = (sel) => box.querySelector(sel);
    const inputs = { pessoas: $('[name=pessoas]'), horas: $('[name=horas]'), custo: $('[name=custo]') };
    const out = (k, v) => { const el = $(`[data-out="${k}"]`); if (el) el.textContent = v; };
    const render = (v) => {
      out('custo-mes', brl.format(v.custoMes));
      out('horas-mes', `${num.format(v.horasMes)} h`);
      out('custo-ano', brl.format(v.custoMes * 12));
      out('economia', `${brl.format(v.custoMes * 0.4)} ${to} ${brl.format(v.custoMes * 0.7)}`);
      out('horas-livres', `${num.format(v.horasMes * 0.4)} ${to} ${num.format(v.horasMes * 0.7)} h`);
    };
    // Os números deslizam até o valor novo (0,35 s) em vez de pular; sem animação para quem prefere menos movimento
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let shown = null, raf = 0;
    const animate = (target) => {
      cancelAnimationFrame(raf);
      if (still || !shown) { shown = target; render(target); return; }
      const from = shown, t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / 350), e = 1 - Math.pow(1 - k, 3);
        shown = { horasMes: from.horasMes + (target.horasMes - from.horasMes) * e, custoMes: from.custoMes + (target.custoMes - from.custoMes) * e };
        render(shown);
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    // Leitor de tela: só o resultado final, depois que a pessoa para de mexer
    const live = $('[data-calc-live]');
    let liveTimer = 0;
    let last = '';
    const update = () => {
      const p = +inputs.pessoas.value, h = +inputs.horas.value, c = +inputs.custo.value;
      $('[data-for=pessoas]').textContent = num.format(p);
      $('[data-for=horas]').textContent = `${h} h`;
      $('[data-for=custo]').textContent = brl.format(c);
      // Pinta a parte já percorrida de cada controle deslizante
      Object.values(inputs).forEach((r) => r.style.setProperty('--fill', `${((r.value - r.min) / (r.max - r.min)) * 100}%`));
      const horasMes = p * h * 4.33;
      const custoMes = horasMes * c;
      animate({ horasMes, custoMes });
      const economia = `${brl.format(custoMes * 0.4)} ${to} ${brl.format(custoMes * 0.7)}`;
      clearTimeout(liveTimer);
      if (live) liveTimer = setTimeout(() => { live.textContent = t(`Custo atual de ${brl.format(custoMes)} por mês. Economia potencial de ${economia} por mês.`, `Current cost of ${brl.format(custoMes)} per month. Potential savings of ${economia} per month.`); }, 600);
      last = t(`Estimativa da calculadora do site: ${p} pessoa(s), ${h} h por semana cada, ${brl.format(c)}/h. Custo atual de cerca de ${brl.format(custoMes)} por mês.`,
        `Website calculator estimate: ${p} people, ${h} h per week each, ${brl.format(c)}/h. Current cost of about ${brl.format(custoMes)} per month.`);
    };
    Object.values(inputs).forEach((r) => r.addEventListener('input', update));
    update();
    const cta = $('[data-calc-cta]');
    if (cta) cta.addEventListener('click', () => {
      const area = document.querySelector('#form-contato textarea[name=gargalo]');
      if (area && !area.value.trim()) area.value = last;
    });
  });

  /* Perguntas de quem decide: abas acessíveis (clique, setas, Home/End) */
  document.querySelectorAll('[data-qa]').forEach((box) => {
    const tabs = Array.from(box.querySelectorAll('[role=tab]'));
    const select = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
      });
      if (focus) tab.focus();
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab, false));
      tab.addEventListener('keydown', (e) => {
        const go = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (go === undefined) return;
        e.preventDefault();
        select(tabs[(go + tabs.length) % tabs.length], true);
      });
    });
  });
})();
