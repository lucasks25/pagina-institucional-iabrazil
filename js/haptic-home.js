import {mountBrandCarousel} from './brand-carousel.js?v=20261105-h4';
import Lenis from './vendor/lenis/lenis.mjs';
document.querySelectorAll('[data-brand-carousel]').forEach(mountBrandCarousel);
const reduced=matchMedia('(prefers-reduced-motion:reduce)');
const dialog=document.querySelector('#contact-dialog');
let smooth=null;
const syncSmooth=()=>{
  if(reduced.matches){smooth?.destroy();smooth=null;return;}
  if(!smooth)smooth=new Lenis({autoRaf:true,lerp:.1,smoothWheel:true,syncTouch:false,anchors:{offset:-32},prevent:node=>!!node.closest('#contact-dialog')});
  if(document.hidden||dialog?.open)smooth.stop();else smooth.start();
};
syncSmooth();reduced.addEventListener('change',syncSmooth);document.addEventListener('visibilitychange',syncSmooth);
const openContact=()=>{if(dialog?.showModal&&!dialog.open){dialog.showModal();syncSmooth();}};
const syncContactHash=()=>{if(location.hash==='#analise')openContact();};
window.addEventListener('hashchange',syncContactHash);syncContactHash();
document.querySelectorAll('[data-contact]').forEach(link=>link.addEventListener('click',event=>{
  if(!dialog||!dialog.showModal)return;
  event.preventDefault();
  const select=dialog.querySelector('select[name=interesse]');
  if(select&&link.dataset.interest)select.value=link.dataset.interest;
  openContact();
  document.querySelector('.site-header')?.classList.remove('nav-open');
  document.documentElement.classList.remove('menu-locked');
  const toggle=document.querySelector('.menu-toggle');toggle?.setAttribute('aria-expanded','false');toggle?.setAttribute('aria-label','Abrir menu');
}));
const footerForm = document.querySelector('.circular-footer-form');
const contactEmail = dialog?.querySelector('input[name=email]');
if (footerForm && contactEmail && dialog.showModal) {
  footerForm.addEventListener('submit', event => {
    event.preventDefault();
    contactEmail.value = footerForm.querySelector('input').value;
    openContact();
  });
}
document.querySelector('[data-close-contact]')?.addEventListener('click',()=>dialog.close());
dialog?.addEventListener('close',()=>{if(location.hash==='#analise')history.replaceState(history.state,'',location.pathname+location.search);syncSmooth();});
dialog?.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
const hero=document.querySelector('.haptic-hero'),rail=document.querySelector('.contact-rail');
if(rail){
  rail.querySelectorAll('.floating-card').forEach(card=>{
    const brandMark=card.querySelector('.floating-mark:not(.work-mark)');
    if(brandMark && !brandMark.querySelector('img')){const symbol=document.createElement('img');symbol.src=new URL('../assets/brand-symbol.svg',import.meta.url).href;symbol.alt='';symbol.width=30;symbol.height=30;brandMark.replaceChildren(symbol);}
    const item=document.createElement('div');item.className='floating-item';
    card.before(item);item.append(card);
    const dismiss=document.createElement('button');
    dismiss.type='button';dismiss.className='rail-dismiss';dismiss.setAttribute('aria-label',`Fechar ${card.querySelector('strong')?.textContent.toLowerCase()||'atalho'}`);
    dismiss.innerHTML='<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="m2 2 8 8M10 2 2 10"/></svg>';
    dismiss.addEventListener('click',()=>{item.hidden=true;});item.append(dismiss);
    const arrow=document.createElement('span');arrow.className='floating-arrow';arrow.setAttribute('aria-hidden','true');
    arrow.innerHTML='<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><path d="M2.5 6h7M6 2.5 9.5 6 6 9.5"/></svg>';
    card.append(arrow);
  });
}
let heroVisible=true;const syncHero=()=>{document.documentElement.classList.toggle('hero-running',heroVisible&&!document.hidden&&!reduced.matches);document.querySelector('.site-header')?.classList.toggle('is-on-light',!hero||!heroVisible);};
if(hero&&'IntersectionObserver'in window)new IntersectionObserver(([entry])=>{heroVisible=entry.isIntersecting;syncHero();}).observe(hero);
syncHero();reduced.addEventListener('change',syncHero);document.addEventListener('visibilitychange',syncHero);
const videos=[...document.querySelectorAll('video[data-src]')];
const syncVideos=()=>videos.forEach(video=>{if(!reduced.matches&&!document.hidden&&video.dataset.visible==='true'){if(!video.src){video.src=video.dataset.src;video.load();}video.play().catch(()=>{});}else video.pause();});
// Observe each decorative loop separately; content remains visible without playback.
if('IntersectionObserver'in window){const observer=new IntersectionObserver(entries=>{entries.forEach(({target,isIntersecting})=>target.dataset.visible=String(isIntersecting));syncVideos();},{rootMargin:'100px'});videos.forEach(v=>observer.observe(v));}
reduced.addEventListener('change',syncVideos);document.addEventListener('visibilitychange',syncVideos);

// Mesmas molas declaradas nos dados de entrada da referência, amostradas em WAAPI.
function springFrames(distance,stiffness,damping,mass){
  const w=Math.sqrt(stiffness/mass),z=damping/(2*Math.sqrt(stiffness*mass));
  return Array.from({length:91},(_,i)=>{
    const t=i/60;let progress;
    if(z<1){const d=w*Math.sqrt(1-z*z);progress=1-Math.exp(-z*w*t)*(Math.cos(d*t)+z*w/d*Math.sin(d*t));}
    else{const root=Math.sqrt(damping*damping-4*mass*stiffness),a=(-damping+root)/(2*mass),b=(-damping-root)/(2*mass);progress=1-(b*Math.exp(a*t)-a*Math.exp(b*t))/(b-a);}
    if(i===90)progress=1;
    return{offset:i/90,opacity:Math.min(1,.001+.999*progress),transform:`translateY(${distance*(1-progress)}px)`};
  });
}
if(!reduced.matches){
  const entrances=[];
  [[document.querySelector('.hero-content h1'),50,60,200],[document.querySelector('.hero-content .button'),50,60,300],...Array.from(document.querySelectorAll('.floating-card'),el=>[el,40,30,1000])].forEach(([el,distance,damping,delay])=>{if(!el)return;const animation=el.animate(springFrames(distance,400,damping,1),{duration:1500,delay,fill:'both',easing:'linear'});entrances.push(animation);animation.finished.then(()=>animation.cancel()).catch(()=>{});});
  reduced.addEventListener('change',()=>{if(reduced.matches)entrances.forEach(animation=>animation.cancel());});
}
const introTitle = document.querySelector('#intro-title');
if (introTitle) {
  const title = introTitle.textContent.trim();
  const words = title.split(/\s+/).map(word => {
    const span = document.createElement('span');
    span.className = 'intro-word';
    span.textContent = word;
    span.setAttribute('aria-hidden', 'true');
    return span;
  });
  introTitle.setAttribute('aria-label', title);
  introTitle.replaceChildren(...words.flatMap((word, index) => index ? [' ', word] : [word]));

  let queued = false;
  function revealIntro() {
    queued = false;
    const top = introTitle.getBoundingClientRect().top;
    const progress = Math.min(1, Math.max(0, (1 - top / innerHeight) * 1.6));
    const count = reduced.matches ? words.length : Math.ceil(progress * words.length);
    words.forEach((word, index) => word.classList.toggle('is-read', index < count));
  }
  function queueIntroReveal() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(revealIntro);
  }
  addEventListener('scroll', queueIntroReveal, { passive: true });
  addEventListener('resize', queueIntroReveal, { passive: true });
  reduced.addEventListener('change', queueIntroReveal);
  document.fonts?.ready.then(queueIntroReveal);
  revealIntro();
}
