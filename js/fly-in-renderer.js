import { bezierEaser } from './curve-controller.js';

const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_uv;
  uniform vec2 u_resolution;
  uniform vec2 u_center;
  uniform vec2 u_size;
  uniform vec2 u_offset;
  uniform float u_angle;
  uniform float u_depth;
  uniform float u_perspective;
  uniform vec4 u_uvRect;
  varying vec2 v_uv;
  void main() {
    float c = cos(u_angle), s = sin(u_angle);
    vec2 local = a_position * u_size;
    local = mat2(c, s, -s, c) * local + u_offset;
    float w = 1.0 - u_depth / u_perspective;
    vec2 projected = (u_center * w + local) / u_resolution * 2.0 - w;
    gl_Position = vec4(projected.x, -projected.y, 0.0, w);
    v_uv = u_uvRect.xy + a_uv * u_uvRect.zw;
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;
  uniform sampler2D u_texture;
  uniform float u_opacity;
  varying vec2 v_uv;
  void main() {
    gl_FragColor = texture2D(u_texture, v_uv) * u_opacity;
  }
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

export function sampleFlyIn(card, elapsed) {
  const progress = Math.max(0, Math.min(1, elapsed / card.duration));
  const eased = card.ease(Math.min(1, progress / card.arrival));
  return {
    opacity: Math.max(0, Math.min(1, eased)),
    depth: card.startZ * (1 - eased),
    offsetX: card.startX * (1 - eased),
    offsetY: card.startY * (1 - eased),
  };
}

/** One viewport-sized surface; DOM cards remain as accessible layout/fallback elements. */
export class FlyInRenderer {
  groups = new Map();
  textures = new Map();
  playbackSources = new Map();
  frame = 0;
  active = false;
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  async mount(animations) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'fly-in-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.gl = this.canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      depth: false,
      stencil: false,
    });
    if (!this.gl) return false;

    try {
      this.setupGL();
      for (const animation of animations.filter(
        (item) => item.kind === 'fly-in' || item.kind === 'full-sequence',
      )) {
        const panel = document.querySelector(`[data-animation-panel="${animation.id}"]`);
        if (!panel) continue;
        for (const [name, selector] of [
          ['sequence', '.showcase-grid'],
          ['focused', '[data-focused-card]'],
        ]) {
          const elements = [...panel.querySelectorAll(`${selector} .gacha-card`)];
          if (!elements.length) continue;
          const cards = elements.map((element) =>
            this.prepareCard(element, animation.stages?.flyIn ?? animation),
          );
          const renderer = this;
          const group = {
            panel,
            cards,
            startedAt: animation.kind === 'full-sequence' ? -Infinity : performance.now(),
            visible: true,
            combined: animation.kind === 'full-sequence',
            get duration() {
              return renderer.reducedMotion.matches ? 1 : cards[0].duration;
            },
            get currentTime() {
              if (!renderer.active) {
                return cards[0].element.getAnimations()[0]?.currentTime ?? this.duration;
              }
              return Math.max(0, performance.now() - this.startedAt);
            },
          };
          this.groups.set(`${animation.id}:${name}`, group);
          if (name === 'focused') this.playbackSources.set(animation.id, group);
        }
      }
      if (!this.groups.size) {
        this.dispose();
        return false;
      }
      document.body.append(this.canvas);
      this.active = true;
      this.groups.forEach((group) => group.panel.classList.add('uses-webgl-fly-in'));
      this.resizeObserver = new ResizeObserver(() => this.invalidate());
      this.groups.forEach((group) => {
        group.cards.forEach((card) => this.resizeObserver.observe(card.element));
      });
      this.onViewportChange = () => this.invalidate();
      window.addEventListener('resize', this.onViewportChange);
      window.addEventListener('scroll', this.onViewportChange, { passive: true });
      this.reducedMotion.addEventListener('change', this.onViewportChange);
      this.canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        this.dispose();
      });
      // Establish geometry and GPU textures before the initial playback begins.
      this.measure();
      const now = performance.now();
      this.groups.forEach((group) => {
        if (!group.combined) group.startedAt = now;
      });
      this.requestDraw();
      return true;
    } catch (error) {
      console.warn('WebGL fly-in unavailable; using CSS cards.', error);
      this.dispose();
      return false;
    }
  }

  setupGL() {
    const gl = this.gl;
    const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    this.program = gl.createProgram();
    gl.attachShader(this.program, vertex);
    gl.attachShader(this.program, fragment);
    gl.linkProgram(this.program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(this.program));
    }
    gl.useProgram(this.program);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-0.5, -0.5, 0, 0, 0.5, -0.5, 1, 0, -0.5, 0.5, 0, 1, 0.5, 0.5, 1, 1]),
      gl.STATIC_DRAW,
    );
    for (const [name, offset] of [
      ['a_position', 0],
      ['a_uv', 8],
    ]) {
      const location = gl.getAttribLocation(this.program, name);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 16, offset);
    }
    this.uniforms = Object.fromEntries(
      [
        'resolution',
        'center',
        'size',
        'offset',
        'angle',
        'depth',
        'perspective',
        'uvRect',
        'opacity',
      ].map((name) => [name, gl.getUniformLocation(this.program, `u_${name}`)]),
    );
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_texture'), 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.clearColor(0, 0, 0, 0);
  }

  texture(source, key) {
    if (this.textures.has(key)) return this.textures.get(key);
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const width = source.naturalWidth || source.width;
    const height = source.naturalHeight || source.height;
    let upload = source;
    // WebGL 1 needs power-of-two textures for mipmaps. Resample once, not per frame.
    if (width & (width - 1) || height & (height - 1)) {
      upload = document.createElement('canvas');
      upload.width = 2 ** Math.ceil(Math.log2(width));
      upload.height = 2 ** Math.ceil(Math.log2(height));
      const context = upload.getContext('2d');
      context.imageSmoothingQuality = 'high';
      context.drawImage(source, 0, 0, upload.width, upload.height);
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, upload);
    gl.generateMipmap(gl.TEXTURE_2D);
    if (gl.getError() !== gl.NO_ERROR) {
      gl.deleteTexture(texture);
      throw new Error('Could not upload card texture.');
    }
    this.textures.set(key, texture);
    return texture;
  }

  prepareCard(element, animation) {
    const image = element.querySelector('.gacha-fly-card-image');
    if (!image?.naturalWidth) throw new Error('Card image is unavailable.');
    const effect = element.getAnimations()[0]?.effect;
    if (!effect) throw new Error('CSS fly-in keyframes are unavailable.');
    const frames = effect.getKeyframes();
    const start = new DOMMatrixReadOnly(frames[0].transform);
    const easing = frames[0].easing.match(/cubic-bezier\(([^)]+)\)/);
    if (!easing || !start.m34) throw new Error('Unsupported fly-in transform/easing.');
    const pseudo = getComputedStyle(element, '::before');
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 128;
    labelCanvas.height = 64;
    const context = labelCanvas.getContext('2d');
    context.scale(2, 2);
    context.font = `${pseudo.fontWeight} ${pseudo.fontSize} ${pseudo.fontFamily}`;
    context.fillStyle = pseudo.color;
    context.textBaseline = 'top';
    const label = element.dataset.index;
    if (label) context.fillText(label, 0, 0);
    const tilt = new DOMMatrixReadOnly(getComputedStyle(image).transform);
    return {
      element,
      texture: this.texture(image, image.currentSrc),
      labelTexture: label ? this.texture(labelCanvas, `label:${label}`) : null,
      labelLeft: Number.parseFloat(pseudo.left) || 0,
      labelTop: Number.parseFloat(pseudo.top) || 0,
      angle: Math.atan2(tilt.b, tilt.a),
      perspective: -1 / start.m34,
      startX: start.m41,
      startY: start.m42,
      startZ: start.m43,
      duration: animation.duration,
      delay: Number.parseFloat(element.style.getPropertyValue('--fly-in-delay')) || 0,
      arrival: frames[1].offset,
      ease: bezierEaser(...easing[1].split(',').map(Number)),
    };
  }

  play(animationId, name, startedAt = performance.now()) {
    const group = this.groups.get(`${animationId}:${name}`);
    if (!this.active || !group) return false;
    group.startedAt = startedAt;
    group.visible = true;
    this.invalidate();
    return true;
  }

  hide(animationId, name) {
    const group = this.groups.get(`${animationId}:${name}`);
    if (!group) return;
    group.visible = false;
    this.requestDraw();
  }

  invalidate() {
    this.needsMeasure = true;
    this.requestDraw();
  }

  requestDraw() {
    if (!this.active || this.frame) return;
    this.frame = requestAnimationFrame((time) => {
      this.frame = 0;
      this.draw(time);
    });
  }

  measure() {
    const bounds = this.canvas.getBoundingClientRect();
    this.width = bounds.width;
    this.height = bounds.height;
    // Cap supersampling, not CSS geometry, to avoid huge buffers on high-DPI phones.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(this.width * dpr);
    const height = Math.round(this.height * dpr);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.gl.viewport(0, 0, width, height);
    this.groups.forEach((group) => {
      if (!group.visible) return;
      group.cards.forEach((card) => {
        const rect = card.element.getBoundingClientRect();
        card.rect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      });
    });
    this.needsMeasure = false;
  }

  draw(time) {
    if (!this.active) return;
    if (this.needsMeasure) this.measure();
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(this.uniforms.resolution, this.width, this.height);
    let playing = false;
    this.groups.forEach((group) => {
      if (!group.visible) return;
      group.cards.forEach((card) => {
        const elapsed = this.reducedMotion.matches
          ? card.duration
          : time - group.startedAt - card.delay;
        if (elapsed < card.duration) playing = true;
        const { opacity, depth, offsetX, offsetY } = sampleFlyIn(card, elapsed);
        if (!opacity) return;
        const { x, y, width, height } = card.rect;
        gl.uniform2f(this.uniforms.center, x + width / 2, y + height / 2);
        gl.uniform1f(this.uniforms.depth, depth);
        gl.uniform1f(this.uniforms.perspective, card.perspective);
        gl.uniform1f(this.uniforms.opacity, opacity);
        gl.uniform4f(this.uniforms.uvRect, 0, 0, 1, 1);
        gl.uniform2f(this.uniforms.size, width, height);
        gl.uniform2f(this.uniforms.offset, offsetX, offsetY);
        gl.uniform1f(this.uniforms.angle, card.angle);
        gl.bindTexture(gl.TEXTURE_2D, card.texture);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (card.labelTexture) {
          gl.uniform2f(this.uniforms.size, 64, 32);
          gl.uniform2f(
            this.uniforms.offset,
            offsetX - width / 2 + card.labelLeft + 32,
            offsetY - height / 2 + card.labelTop + 16,
          );
          gl.uniform1f(this.uniforms.angle, 0);
          gl.bindTexture(gl.TEXTURE_2D, card.labelTexture);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
      });
    });
    if (playing) this.requestDraw();
  }

  dispose() {
    this.active = false;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.resizeObserver?.disconnect();
    if (this.onViewportChange) {
      window.removeEventListener('resize', this.onViewportChange);
      window.removeEventListener('scroll', this.onViewportChange);
      this.reducedMotion.removeEventListener('change', this.onViewportChange);
    }
    this.groups.forEach((group) => group.panel.classList.remove('uses-webgl-fly-in'));
    new Set([...this.groups.values()].map((group) => group.panel)).forEach((panel) => {
      panel.dispatchEvent(new Event('flyinrendererfallback'));
    });
    // CurveController keeps this clock reference, including after a context loss.
    if (this.gl && !this.gl.isContextLost()) {
      this.textures.forEach((texture) => this.gl.deleteTexture(texture));
      if (this.buffer) this.gl.deleteBuffer(this.buffer);
      if (this.program) this.gl.deleteProgram(this.program);
    }
    this.textures.clear();
    this.canvas?.remove();
  }
}
