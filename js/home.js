/* IA BRAZIL — interações só da página inicial: campo do topo, método em cartões, prévia do WhatsApp no formulário,
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

  /* Método: quatro cartões. O ativo anima o desenho e abre o painel; a linha do topo enche até a fase ativa.
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

  /* Ofertas: as duas telas ganham vida quando entram na tela.
     Mapa de oportunidades: os números sobem de zero. Agente em produção: tarefas de várias áreas chegam por baixo,
     "processam" (anel girando) e viram OK; de vez em quando uma cai em revisão humana. Pausa fora da tela. */
  const offers = document.querySelector('.offers');
  if (offers) {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window);
    const counters = Array.from(offers.querySelectorAll('[data-count]'));
    const feedWin = offers.querySelector('[data-feed]');
    const ol = feedWin && feedWin.querySelector('.feed');
    const ICON = {
      mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
      db: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
      chat: '<path d="M4 5h16v11H10l-6 4z"/>',
      alert: '<path d="M12 3.5l9 16H3z"/><path d="M12 10v4.5M12 17.2v.01"/>',
      doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
      check: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
      cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
      chart: '<path d="M5 19V9M11 19V5M17 19v-7"/>',
    };
    const OK = t('ok', 'ok'), REVIEW = t('revisão humana', 'human review');
    const POOL = [
      ['cal', t('Reunião agendada e confirmada', 'Meeting booked and confirmed')],
      ['check', t('Pagamento conciliado', 'Payment reconciled')],
      ['mail', t('Solicitação classificada e encaminhada', 'Request classified and routed')],
      ['alert', t('Valor fora do padrão', 'Amount out of pattern'), true],
      ['doc', t('Currículo triado e ranqueado', 'Resume screened and ranked')],
      ['chat', t('Cliente respondido no WhatsApp', 'Customer answered on WhatsApp')],
      ['db', t('Cadastro atualizado no CRM', 'Record updated in the CRM')],
      ['chart', t('Relatório semanal gerado', 'Weekly report generated')],
      ['doc', t('Contrato lido e resumido', 'Contract read and summarized')],
      ['db', t('Nota fiscal lançada no ERP', 'Invoice posted to the ERP')],
    ];

    const countUp = (el, delay) => {
      const to = Number(el.dataset.count);
      el.textContent = '0';
      const t0 = performance.now() + delay;
      const step = (now) => {
        const k = Math.min(1, Math.max(0, (now - t0) / 1300));
        el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    let timer = 0, started = false, visible = false, idx = 0;
    const nEl = offers.querySelector('[data-feed-n]'), rEl = offers.querySelector('[data-feed-r]');
    let clock = 0;
    if (ol) {
      const last = ol.lastElementChild && ol.lastElementChild.querySelector('time');
      const m = last && last.textContent.match(/(\d+):(\d+):(\d+)/);
      clock = m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : 9 * 3600 + 41 * 60;
    }
    const stamp = () => {
      clock += 2 + Math.floor(Math.random() * 4);
      const h = Math.floor(clock / 3600) % 24, mi = Math.floor(clock / 60) % 60, se = clock % 60;
      return [h, mi, se].map((v) => String(v).padStart(2, '0')).join(':');
    };
    const bump = (el) => { if (el) el.textContent = String(Number(el.textContent) + 1); };
    const add = () => {
      const [ic, txt, warn] = POOL[idx++ % POOL.length];
      const li = document.createElement('li');
      li.className = 'is-busy' + (warn ? ' is-warn' : '');
      li.innerHTML = `<span class="fi"><svg viewBox="0 0 24 24">${ICON[ic]}</svg></span><span class="ft"><span>${txt}</span><time>${stamp()}</time></span><b>${warn ? REVIEW : OK}</b>`;
      const h = ol.firstElementChild ? ol.firstElementChild.offsetHeight : 52;
      ol.append(li);
      // A lista cresceu por baixo: desloca na hora e anima de volta, para a subida ficar suave
      ol.style.transition = 'none';
      ol.style.transform = `translateY(${h}px)`;
      void ol.offsetHeight;
      ol.style.transition = '';
      ol.style.transform = '';
      while (ol.children.length > 6) ol.firstElementChild.remove();
      setTimeout(() => { li.classList.remove('is-busy'); bump(nEl); if (warn) bump(rEl); }, 900);
    };
    const play = () => { if (!timer && ol && visible && !still) timer = setInterval(() => { if (!document.hidden) add(); }, 2400); };
    const stop = () => { clearInterval(timer); timer = 0; };

    if (!still) {
      offers.classList.add('has-motion');
      counters.forEach((el) => { el.textContent = '0'; });
      // Cada tela começa a animar quando ela mesma aparece (no celular as duas ficam uma abaixo da outra)
      const io = new IntersectionObserver((entries) => entries.forEach((en) => {
        const tela = en.target, vis = en.isIntersecting;
        if (vis && !tela.classList.contains('is-live')) {
          tela.classList.add('is-live');
          tela.querySelectorAll('[data-count]').forEach((el, i) => countUp(el, 450 + (i < 3 ? i * 90 : 500 + (i - 3) * 40)));
        }
        if (ol && tela.contains(ol)) { visible = vis; if (vis) play(); else stop(); }
      }), { threshold: 0.35 });
      offers.querySelectorAll('.tela').forEach((tela) => io.observe(tela));
    }
  }

  /* Formulário: a prévia da mensagem no WhatsApp usa o primeiro nome que a pessoa digita */
  const waNome = document.querySelector('[data-wa-nome]');
  const nomeField = document.querySelector('#form-contato [name=nome]');
  if (waNome && nomeField) {
    const sync = () => {
      const first = nomeField.value.trim().split(/\s+/)[0].slice(0, 24);
      waNome.textContent = first ? `, ${first}` : '';
    };
    nomeField.addEventListener('input', sync);
    sync();
  }

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
