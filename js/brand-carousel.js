/* Adaptação nativa do LogoCarousel enviado pelo usuário: posições fixas,
   troca vertical, saída 300ms e entrada 500ms, defasadas em 200ms. */
export function mountBrandCarousel(root) {
  const originals=[...root.querySelectorAll('.brand-list li')];
  if(originals.length<2)return;
  const reduced=matchMedia('(prefers-reduced-motion:reduce)');
  const mobile=matchMedia('(max-width:640px)');
  const stage=document.createElement('div');
  stage.className='brand-stage';stage.setAttribute('aria-hidden','true');root.append(stage);
  let round=0,visible=!('IntersectionObserver' in window),paused=false,timer=0,slots=[];
  const pending=new Set();
  const later=(fn,delay)=>{const id=setTimeout(()=>{pending.delete(id);fn();},delay);pending.add(id);};
  const show=(slot,index)=>{const item=document.createElement('div');item.className=originals[index].className;const img=originals[index].querySelector('img').cloneNode(true);img.alt='';item.append(img);slot.replaceChildren(item);};
  const render=()=>slots.forEach((slot,i)=>{slot.classList.remove('is-leaving','is-entering');show(slot,(round*slots.length+i)%originals.length);});
  const stop=()=>{clearInterval(timer);timer=0;pending.forEach(clearTimeout);pending.clear();render();};
  const cycle=()=>{
    round++;
    slots.forEach((slot,i)=>later(()=>{
      slot.classList.add('is-leaving');
      later(()=>{
        show(slot,(round*slots.length+i)%originals.length);
        slot.classList.remove('is-leaving');slot.classList.add('is-entering');
        later(()=>slot.classList.remove('is-entering'),500);
      },300);
    },i*200));
  };
  const sync=()=>{
    stop();root.classList.toggle('is-enhanced',!reduced.matches);
    if(!reduced.matches&&visible&&!document.hidden&&!paused)timer=setInterval(cycle,2000);
  };
  const layout=()=>{
    stop();const count=Math.min(originals.length,mobile.matches?2:3);
    slots=Array.from({length:count},()=>{const el=document.createElement('div');el.className='brand-slot';return el;});
    stage.replaceChildren(...slots);stage.style.setProperty('--brand-columns',String(count));round=0;sync();
  };
  // A passagem do mouse e o clique não interrompem a troca automática.
  root.addEventListener('keydown',event=>{if(event.key===' '){event.preventDefault();paused=!paused;sync();root.setAttribute('aria-label',paused?'Marcas de projetos. Pressione espaço para continuar.':'Marcas de projetos. Pressione espaço para pausar.');}});
  if('IntersectionObserver' in window)new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;sync();}).observe(root);
  document.addEventListener('visibilitychange',sync);
  reduced.addEventListener('change',sync);mobile.addEventListener('change',layout);
  window.addEventListener('pagehide',stop);window.addEventListener('pageshow',sync);
  layout();
}
