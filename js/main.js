/* IA BRAZIL — interações da página */
(() => {
  'use strict';

  // Marca que o JS está ativo: só assim os elementos com data-reveal começam escondidos
  document.documentElement.classList.add('js');

  // Idioma da página: en/ usa os textos em inglês; o resto do site, em português
  const EN = document.documentElement.lang.startsWith('en');
  const t = (pt, en) => (EN ? en : pt);

  // TROCAR: número do WhatsApp com DDI + DDD, só números (ex.: 5511999999999)
  const WHATSAPP_NUMBER = '5500000000000';
  const DEFAULT_MESSAGE = t('Olá! Vim pelo site da IA BRAZIL e quero conversar sobre um projeto.', 'Hi! I found IA BRAZIL on your website and would like to talk about a project.');

  /* Links de WhatsApp */
  const waHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(DEFAULT_MESSAGE)}`;
  document.querySelectorAll('[data-wa]').forEach((a) => {
    a.href = waHref;
    a.target = '_blank';
    a.rel = 'noopener';
  });

  /* Menu mobile */
  const header = document.querySelector('.site-header');
  const toggle = document.querySelector('.menu-toggle');
  const setMenu = (open) => {
    header.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? t('Fechar menu', 'Close menu') : t('Abrir menu', 'Open menu'));
  };
  const baseSetMenu = setMenu;
  const setMenuLocked = (open) => {
    baseSetMenu(open);
    // Com o menu aberto no celular, a página por trás não rola
    document.documentElement.classList.toggle('menu-locked', open);
  };
  toggle.addEventListener('click', () => setMenuLocked(!header.classList.contains('nav-open')));
  document.querySelectorAll('.nav a').forEach((a) => a.addEventListener('click', () => setMenuLocked(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenuLocked(false); });
  document.addEventListener('click', (e) => {
    if (header.classList.contains('nav-open') && !header.contains(e.target)) setMenuLocked(false);
  });

  /* Header ganha sombra depois que a página começa a rolar */
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* Menu destaca a seção da home que está na tela (links do tipo index.html#metodo) */
  const navById = new Map();
  document.querySelectorAll('.nav-link[href*="#"]').forEach((a) => {
    const id = a.getAttribute('href').split('#')[1];
    const el = id && document.getElementById(id);
    if (el && a.pathname === location.pathname) navById.set(el, a);
  });
  if ('IntersectionObserver' in window && navById.size) {
    const navIo = new IntersectionObserver((entries) => {
      entries.forEach((en) => { const a = navById.get(en.target); if (a) a.classList.toggle('is-current', en.isIntersecting); });
    }, { rootMargin: '-45% 0px -50% 0px' });
    navById.forEach((_, el) => navIo.observe(el));
  }

  /* Destaque que desliza atrás do link do menu sob o mouse (só com mouse, em telas largas) */
  const navEl = document.querySelector('.nav');
  const glow = navEl && navEl.querySelector('.nav-glow');
  if (glow && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const moveTo = (link) => {
      if (window.innerWidth <= 960) return;
      const n = navEl.getBoundingClientRect();
      const r = link.getBoundingClientRect();
      navEl.style.setProperty('--gx', `${r.left - n.left}px`);
      navEl.style.setProperty('--gw', `${r.width}px`);
      navEl.classList.add('is-hovering');
    };
    navEl.querySelectorAll('.nav-link').forEach((link) => {
      link.addEventListener('mouseenter', () => moveTo(link));
      link.addEventListener('focus', () => moveTo(link));
      const item = link.closest('.has-sub');
      if (item) item.addEventListener('mouseenter', () => moveTo(link));
    });
    navEl.addEventListener('mouseleave', () => navEl.classList.remove('is-hovering'));
    navEl.addEventListener('focusout', (e) => { if (!navEl.contains(e.relatedTarget)) navEl.classList.remove('is-hovering'); });
  }

  /* Índice lateral: destaca a seção que está na tela */
  const tocLinks = Array.from(document.querySelectorAll('.toc a, .subnav a'));
  if ('IntersectionObserver' in window && tocLinks.length) {
    const byId = new Map(tocLinks.map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        tocLinks.forEach((a) => a.classList.remove('is-active'));
        const link = byId.get(entry.target.id);
        if (link) link.classList.add('is-active');
      });
    }, { rootMargin: '-35% 0px -60% 0px' });
    byId.forEach((_, id) => {
      const section = document.getElementById(id);
      if (section) io.observe(section);
    });
  }

  /* Elementos que surgem ao rolar a página */
  const reveals = Array.from(document.querySelectorAll('[data-reveal]'));
  const show = (el) => el.classList.add('is-in');
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const ro = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        show(entry.target);
        ro.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px' });
    reveals.forEach((el) => ro.observe(el));
  } else {
    reveals.forEach(show);
  }

  /* Formulário de contato: salva o contato (js/leads.js) e oferece seguir a conversa pelo WhatsApp */
  const form = document.getElementById('form-contato');
  if (form) {
    // contato.html?interesse=mentoria já chega com a opção marcada
    const interesse = new URLSearchParams(location.search).get('interesse');
    const option = interesse && form.querySelector(`option[data-key="${CSS.escape(interesse)}"]`);
    if (option) option.selected = true;

    const openedAt = Date.now();
    const submit = form.querySelector('button[type="submit"]');
    const submitContent = Array.from(submit.childNodes, (n) => n.cloneNode(true));
    const arrow = submit.querySelector('.i-arrow');
    let sending = false;

    // Link do WhatsApp com os dados do formulário na mensagem
    const waLink = (d) => {
      const text = [
        t('Olá! Vim pelo site da IA BRAZIL.', 'Hi! I found IA BRAZIL on your website.'),
        '',
        `${t('Nome', 'Name')}: ${d.get('nome')} ${d.get('sobrenome')}`.trim(),
        `${t('Empresa', 'Company')}: ${d.get('empresa')}`,
        `E-mail: ${d.get('email')}`,
        `WhatsApp: ${d.get('whatsapp')}`,
        `${t('Interesse', 'Interest')}: ${d.get('interesse')}`,
        '',
        `${t('Mensagem', 'Message')}: ${d.get('mensagem') || t('(não informada)', '(none)')}`,
      ].join('\n');
      return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
    };

    // Elementos criados só com textContent: o texto vem de quem preencheu
    const make = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      return node;
    };
    const waButton = (d) => {
      const a = make('a', 'btn btn-primary', t('Continuar no WhatsApp', 'Continue on WhatsApp'));
      a.href = waLink(d);
      a.target = '_blank';
      a.rel = 'noopener';
      if (arrow) a.append(arrow.cloneNode(true));
      return a;
    };

    // Página do formulário e, se a pessoa veio de outra página do site, qual foi
    const origem = () => {
      let via = '';
      try {
        const ref = new URL(document.referrer);
        if (ref.origin === location.origin && ref.pathname !== location.pathname) via = ` (veio de ${ref.pathname})`;
      } catch {}
      return location.pathname + location.search + via;
    };

    // Troca o formulário pelo agradecimento e leva o foco até ele
    const thanks = (d) => {
      const panel = make('div', 'form-done');
      const name = String(d.get('nome')).trim();
      const title = make('h2', '', t(`Obrigado, ${name}. Recebemos o seu contato.`, `Thank you, ${name}. We have received your message.`));
      title.id = 'form-done-title';
      panel.tabIndex = -1;
      panel.setAttribute('role', 'region');
      panel.setAttribute('aria-labelledby', title.id);
      panel.append(
        make('p', 'badge', t('Mensagem enviada', 'Message sent')),
        title,
        make('p', '', t('Nosso time vai responder em breve pelo WhatsApp ou pelo e-mail que você informou. Se quiser adiantar a conversa, continue pelo WhatsApp com a sua mensagem pronta.',
          'Our team will get back to you shortly by WhatsApp or by the e-mail you provided. To move faster, continue on WhatsApp with your message ready.')),
        waButton(d),
      );
      form.replaceWith(panel);
      panel.focus();
    };

    // Falhou: avisa e deixa o WhatsApp como alternativa
    const failed = (d) => {
      const box = make('div', 'form-error full');
      box.setAttribute('role', 'alert');
      box.append(make('p', '', t('Não conseguimos enviar agora. Tente de novo em instantes ou fale com a gente direto pelo WhatsApp.', 'We could not send your message right now. Try again in a moment or reach us directly on WhatsApp.')), waButton(d));
      submit.after(box);
    };

    /* Validação com mensagem embaixo de cada campo (em vez do balão do navegador) */
    form.noValidate = true;
    // Grupos de opção (radio) entram uma vez só, pelo primeiro item do grupo
    const seenGroups = new Set();
    const controls = Array.from(form.querySelectorAll('input:not([type=hidden]):not([name=site]), select, textarea')).filter((el) => {
      if (el.type !== 'radio') return true;
      if (seenGroups.has(el.name)) return false;
      seenGroups.add(el.name);
      return true;
    });
    const picked = (el) => !!form.querySelector(`input[name="${CSS.escape(el.name)}"]:checked`);
    const messageFor = (el) => {
      const choose = t('Escolha uma opção.', 'Choose an option.');
      if (el.type === 'radio') return el.required && !picked(el) ? choose : '';
      const v = el.type === 'checkbox' ? el.checked : String(el.value || '').trim();
      if (el.required && !v) return el.type === 'checkbox' ? t('Marque para continuar.', 'Check this to continue.') : el.tagName === 'SELECT' ? choose : t('Preencha este campo.', 'Please fill in this field.');
      if (!v) return '';
      if (el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return t('Confira o e-mail (ex.: nome@empresa.com.br).', 'Check the e-mail (e.g. name@company.com).');
      if (el.name === 'whatsapp' && v.replace(/\D/g, '').length < 10) return t('Informe o número com DDD.', 'Include the country and area code.');
      return '';
    };
    const errorBox = (el) => {
      const host = el.closest('.choice, .field, .check') || el.parentElement;
      let box = host.querySelector('.field-err');
      if (!box) {
        box = make('span', 'field-err');
        box.id = `err-${el.name}`;
        host.append(box);
        el.setAttribute('aria-describedby', box.id);
      }
      return box;
    };
    const check = (el) => {
      const msg = messageFor(el);
      el.setAttribute('aria-invalid', String(!!msg));
      errorBox(el).textContent = msg;
      return !msg;
    };
    controls.forEach((el) => {
      if (el.type === 'radio') {
        form.querySelectorAll(`input[name="${CSS.escape(el.name)}"]`).forEach((r) => r.addEventListener('change', () => check(el)));
        return;
      }
      el.addEventListener('blur', () => { if (el.value || el.getAttribute('aria-invalid') === 'true') check(el); });
      el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
        if (el.getAttribute('aria-invalid') === 'true') check(el);
      });
    });
    // Valida só o que está dentro de "scope" (uma etapa) ou o formulário inteiro
    const valid = (scope = form) => {
      const bad = controls.filter((el) => scope.contains(el)).filter((el) => !check(el));
      if (bad.length) {
        const step = bad[0].closest('[data-step]');
        if (step && steps && !step.classList.contains('is-on')) goTo(steps.indexOf(step));
        bad[0].focus();
      }
      return !bad.length;
    };

    /* Formulário em etapas (data-steps): mostra uma etapa por vez, com barra de progresso.
       "Continuar" valida só a etapa atual. Sem JS, todas as etapas aparecem juntas. */
    let steps = null;
    let goTo = () => {};
    if (form.hasAttribute('data-steps')) {
      steps = Array.from(form.querySelectorAll('[data-step]'));
      const marks = Array.from(form.querySelectorAll('.st-progress li'));
      const bar = form.querySelector('.st-bar i');
      const status = form.querySelector('[data-step-status]');
      let at = 0;
      goTo = (i, focus) => {
        at = Math.max(0, Math.min(steps.length - 1, i));
        steps.forEach((st, k) => st.classList.toggle('is-on', k === at));
        marks.forEach((m, k) => { m.classList.toggle('is-on', k <= at); m.classList.toggle('is-done', k < at); });
        if (bar) bar.style.transform = `scaleX(${(at + 1) / steps.length})`;
        if (status) status.textContent = `Etapa ${at + 1} de ${steps.length}`;
        if (focus) {
          const first = steps[at].querySelector('input:not([type=hidden]):not([name=site]), textarea');
          if (first) first.focus({ preventScroll: true });
          const top = form.getBoundingClientRect().top;
          if (top < 0) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      };
      form.classList.add('is-stepped');
      form.querySelectorAll('[data-next]').forEach((b) => b.addEventListener('click', () => { if (valid(steps[at])) goTo(at + 1, true); }));
      form.querySelectorAll('[data-prev]').forEach((b) => b.addEventListener('click', () => goTo(at - 1, true)));
      // Enter numa etapa intermediária avança em vez de enviar
      form.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA' || at === steps.length - 1) return;
        e.preventDefault();
        if (valid(steps[at])) goTo(at + 1, true);
      });
      goTo(0);
    }

    // WhatsApp: formata enquanto digita, ex.: (11) 99999-0000
    const phone = form.querySelector('input[name=whatsapp]');
    if (phone) {
      phone.addEventListener('input', () => {
        const n = phone.value.replace(/\D/g, '').slice(0, 11);
        const f = n.length > 10 ? `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
          : n.length > 6 ? `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
          : n.length > 2 ? `(${n.slice(0, 2)}) ${n.slice(2)}` : n.length ? `(${n}` : '';
        phone.value = f;
      });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (sending || !valid()) return;
      const d = new FormData(form);
      // Formulário da home: as respostas extras (cargo, tamanho, faturamento...) vão juntas na mensagem
      if (form.hasAttribute('data-compose')) {
        const lines = Array.from(form.querySelectorAll('[data-extra]')).filter((el) => el.type !== 'radio' || el.checked)
          .map((el) => [el.dataset.extra, String(el.value || '').trim()])
          .filter(([, v]) => v)
          .map(([k, v]) => `${k}: ${v}`);
        d.set('mensagem', lines.join('\n'));
        if (!d.has('sobrenome')) d.set('sobrenome', '');
      }

      // Sem o leads.js, segue o fluxo antigo: abre o WhatsApp
      if (!window.Leads) {
        window.open(waLink(d), '_blank', 'noopener');
        return;
      }
      // Robô: campo escondido preenchido ou envio rápido demais. Não salva e mostra o agradecimento
      if (d.get('site') || Date.now() - openedAt < 3000) {
        thanks(d);
        return;
      }

      sending = true;
      form.querySelector('.form-error')?.remove();
      submit.disabled = true;
      submit.classList.add('is-loading');
      submit.textContent = t('Enviando...', 'Sending...');
      try {
        await window.Leads.save({
          nome: d.get('nome'),
          sobrenome: d.get('sobrenome'),
          empresa: d.get('empresa'),
          email: d.get('email'),
          whatsapp: d.get('whatsapp'),
          interesse: d.get('interesse'),
          mensagem: d.get('mensagem'),
          origem: origem(),
        });
        thanks(d);
      } catch (err) {
        console.error('IA BRAZIL: não foi possível salvar o contato.', err);
        submit.disabled = false;
        submit.replaceChildren(...submitContent.map((n) => n.cloneNode(true)));
        submit.classList.remove('is-loading');
        failed(d);
        submit.focus();
      } finally {
        sending = false;
      }
    });
  }


  /* Ano no rodapé */
  const year = document.getElementById('ano');
  if (year) year.textContent = String(new Date().getFullYear());
})();
