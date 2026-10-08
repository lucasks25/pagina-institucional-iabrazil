/* IA BRAZIL — fundo da página inteira: a fumaça azul do vídeo original, em quatro quadros
   (vídeo Mixkit 101438, licença livre) que se dissolvem um no outro em sequência e derivam devagar.
   Todo o movimento é CSS (css/base.css, .fundo): só opacidade e transform, ciclos longos, sem salto.
   Para quem prefere menos movimento, fica parado. */
(() => {
  'use strict';
  const fundo = document.createElement('div');
  fundo.className = 'fundo';
  fundo.setAttribute('aria-hidden', 'true');
  fundo.innerHTML = '<span></span><span></span><span></span><span></span>';
  document.body.prepend(fundo);
  document.body.classList.add('has-net');
})();
