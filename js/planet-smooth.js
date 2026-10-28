/* Interpolação do vídeo em GPU: preserva a velocidade lenta e acompanha a tela.
   O vídeo nativo continua disponível como fallback, sem bibliotecas adicionais. */
export function createPlanetRenderer(video, layer, reduced) {
  const canvas = document.createElement('canvas');
  canvas.className = 'fundo-planet-canvas';
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
  if (!gl) return null;
  const shader = (type, source) => {
    const item = gl.createShader(type); gl.shaderSource(item, source); gl.compileShader(item);
    if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) { gl.deleteShader(item); throw new Error('Shader unavailable'); }
    return item;
  };
  let program, vertex, fragment;
  try {
    vertex = shader(gl.VERTEX_SHADER, 'attribute vec2 position; varying vec2 uv; void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}');
    fragment = shader(gl.FRAGMENT_SHADER, 'precision highp float; varying vec2 uv; uniform sampler2D previousFrame; uniform sampler2D currentFrame; uniform float progress; void main(){gl_FragColor=mix(texture2D(previousFrame,uv),texture2D(currentFrame,uv),progress);}');
    program = gl.createProgram(); gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Renderer unavailable');
  } catch { gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment); return null; }
  gl.useProgram(program);
  const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const textures = [gl.createTexture(), gl.createTexture()];
  textures.forEach(texture => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  });
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.uniform1i(gl.getUniformLocation(program, 'previousFrame'), 0); gl.uniform1i(gl.getUniformLocation(program, 'currentFrame'), 1);
  const progress = gl.getUniformLocation(program, 'progress');
  let previous = textures[0], current = textures[1], ready = false, destroyed = false, raf = 0, callback = 0;
  let uploaded = 0, lastPresentation = 0, interval = 1000 / (30 * video.playbackRate), lastMediaTime = -1;
  const resize = () => {
    const width = Math.max(1, Math.min(video.videoWidth || 1920, Math.ceil(innerWidth * Math.min(devicePixelRatio || 1, 1)), 1280));
    const height = Math.round(width * (video.videoHeight && video.videoWidth ? video.videoHeight / video.videoWidth : 4096 / 2880));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; gl.viewport(0, 0, width, height); }
  };
  const upload = (now, metadata) => {
    if (destroyed || video.readyState < 2) return;
    try {
      gl.activeTexture(gl.TEXTURE0);
      if (!ready) {
        textures.forEach(texture => { gl.bindTexture(gl.TEXTURE_2D, texture); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video); });
        resize(); ready = true;
      } else {
        [previous, current] = [current, previous];
        gl.bindTexture(gl.TEXTURE_2D, current); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      }
      const presentation = metadata?.expectedDisplayTime || now;
      if (lastPresentation && presentation > lastPresentation) interval = Math.max(20, Math.min(160, presentation - lastPresentation));
      lastPresentation = presentation; uploaded = now; lastMediaTime = video.currentTime;
    } catch { destroy(); }
  };
  const frame = (now, metadata) => {
    callback = 0;
    if (destroyed || reduced.matches || video.paused || document.hidden) return;
    upload(now, metadata);
    callback = video.requestVideoFrameCallback(frame);
  };
  const render = now => {
    raf = 0;
    if (destroyed || reduced.matches || video.paused || document.hidden) return;
    // Compatibilidade com navegadores sem requestVideoFrameCallback e retomadas.
    if ((!video.requestVideoFrameCallback && Math.abs(video.currentTime - lastMediaTime) >= 1 / 30) || (!ready && video.readyState >= 2)) upload(now);
    if (ready && !destroyed) {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, previous);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, current);
      gl.uniform1f(progress, Math.max(0, Math.min(1, (now - uploaded) / interval)));
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (!layer.classList.contains('has-smooth-planet')) layer.classList.add('has-smooth-planet');
    }
    if (!destroyed) raf = requestAnimationFrame(render);
  };
  const stop = () => {
    cancelAnimationFrame(raf); raf = 0;
    if (callback && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(callback);
    callback = 0;
  };
  const start = () => {
    if (destroyed || reduced.matches || video.paused || document.hidden || raf) return;
    interval = 1000 / (30 * video.playbackRate); lastPresentation = 0;
    if (video.readyState >= 2) upload(performance.now());
    if (video.requestVideoFrameCallback && !callback) callback = video.requestVideoFrameCallback(frame);
    raf = requestAnimationFrame(render);
  };
  const motion = () => { if (reduced.matches) { stop(); layer.classList.remove('has-smooth-planet'); } else start(); };
  const visibility = () => { if (document.hidden) stop(); else start(); };
  const lost = event => { event.preventDefault(); destroy(); };
  function destroy() {
    if (destroyed) return;
    destroyed = true; stop(); layer.classList.remove('has-smooth-planet'); canvas.remove();
    video.removeEventListener('play', start); video.removeEventListener('pause', stop);
    window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', visibility); reduced.removeEventListener('change', motion);
    textures.forEach(texture => gl.deleteTexture(texture)); gl.deleteBuffer(buffer); gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment);
  }
  layer.insertBefore(canvas, video.nextSibling);
  video.addEventListener('play', start); video.addEventListener('pause', stop);
  window.addEventListener('resize', resize, { passive: true }); document.addEventListener('visibilitychange', visibility); reduced.addEventListener('change', motion);
  canvas.addEventListener('webglcontextlost', lost, { once: true });
  resize(); start();
  return { destroy, resize };
}
