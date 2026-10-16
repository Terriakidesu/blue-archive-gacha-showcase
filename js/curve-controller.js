const SVG_NS = 'http://www.w3.org/2000/svg';

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);

  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });

  return element;
}

function bezierEaser(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t) => ((ay * t + by) * t + cy) * t;
  const sampleDerivative = (t) => (3 * ax * t + 2 * bx) * t + cx;

  function solveX(x) {
    let t = x;

    for (let index = 0; index < 8; index += 1) {
      const error = sampleX(t) - x;

      if (Math.abs(error) < 1e-6) return t;

      const derivative = sampleDerivative(t);
      if (Math.abs(derivative) < 1e-6) break;

      t -= error / derivative;
    }

    let low = 0;
    let high = 1;

    for (let index = 0; index < 12; index += 1) {
      t = (low + high) / 2;

      if (sampleX(t) < x) low = t;
      else high = t;
    }

    return t;
  }

  return (x) => sampleY(solveX(Math.min(Math.max(x, 0), 1)));
}

function parseAnimationTime(value) {
  if (value.endsWith('ms')) return Number.parseFloat(value);
  if (value.endsWith('s')) return Number.parseFloat(value) * 1000;
  return Number.parseFloat(value) || 0;
}

function getAnimationTarget(card, animation) {
  return animation.kind === 'flip' ? card.querySelector('.gacha-card-inner') : card;
}

export class CurveController {
  states = new Map();
  frameRequested = false;

  mount(animations) {
    animations.forEach((animation) => {
      const panel = document.querySelector(`[data-animation-panel="${animation.id}"]`);
      const figure = panel?.querySelector('.anim-curve');

      if (!panel || !figure) return;

      this.states.set(animation.id, {
        animation,
        panel,
        figure,
        time: figure.querySelector('[data-curve-time]'),
        curve: this.buildCurve(figure, animation),
        startedAt: performance.now(),
      });
    });

    requestAnimationFrame(() => {
      this.states.forEach((state) => this.refresh(state));
      this.start();
    });
  }

  play(animationId) {
    const state = this.states.get(animationId);
    if (!state) return;

    this.reset(state);

    requestAnimationFrame(() => {
      this.refresh(state);
      this.reset(state);
      this.start();
    });
  }

  refresh(state) {
    const card = state.panel.querySelector('[data-focused-card] .gacha-card');
    state.target = card ? getAnimationTarget(card, state.animation) : null;
    state.cssAnimation = state.target?.getAnimations?.()[0] ?? null;
    state.startedAt = performance.now();

    if (state.target) {
      const computed = getComputedStyle(state.target);
      state.duration = parseAnimationTime(computed.animationDuration);
      state.delay = parseAnimationTime(computed.animationDelay);
    }
  }

  reset(state) {
    if (!state.curve) return;

    const positionX = state.curve.x(0);
    const positionY = state.curve.y(state.curve.ease(0));

    state.curve.progress.setAttribute('x1', positionX);
    state.curve.progress.setAttribute('x2', positionX);
    state.curve.dot.setAttribute('cx', positionX);
    state.curve.dot.setAttribute('cy', positionY);

    if (state.time) {
      state.time.textContent = `0.0s / ${(state.duration / 1000).toFixed(1)}s`;
    }
  }

  start() {
    if (this.frameRequested) return;

    this.frameRequested = true;
    requestAnimationFrame((time) => this.tick(time));
  }

  tick(time) {
    let active = false;

    this.states.forEach((state) => {
      if (this.update(state, time)) active = true;
    });

    if (active) {
      requestAnimationFrame((nextTime) => this.tick(nextTime));
    } else {
      this.frameRequested = false;
    }
  }

  update(state, time) {
    if (!state.target || !state.curve) return false;

    const currentTime = Number(state.cssAnimation?.currentTime);
    const elapsed = Number.isFinite(currentTime)
      ? Math.min(Math.max(currentTime - state.delay, 0), state.duration)
      : Math.min(Math.max(time - state.startedAt, 0), state.duration);
    const progress = state.duration ? elapsed / state.duration : 1;
    const value = state.curve.ease(progress);
    const positionX = state.curve.x(progress);
    const positionY = state.curve.y(value);

    state.curve.progress.setAttribute('x1', positionX);
    state.curve.progress.setAttribute('x2', positionX);
    state.curve.dot.setAttribute('cx', positionX);
    state.curve.dot.setAttribute('cy', positionY);
    if (state.time) {
      state.time.textContent = `${(elapsed / 1000).toFixed(1)}s / ${(state.duration / 1000).toFixed(1)}s`;
    }

    return progress < 1;
  }

  buildCurve(figure, animation) {
    const [x1, y1, x2, y2] = animation.easing.split(',').map(Number);
    const track = figure.querySelector('.anim-curve-track');
    const width = 260;
    const height = 150;
    const left = 28;
    const right = 12;
    const top = 14;
    const bottom = 22;
    const low = Math.min(0, y1, y2) - 0.08;
    const high = Math.max(1, y1, y2) + 0.08;
    const x = (time) => left + (width - left - right) * time;
    const y = (value) => top + (height - top - bottom) * (1 - (value - low) / (high - low));
    const ease = bezierEaser(x1, y1, x2, y2);
    const svg = svgElement('svg', {
      viewBox: `0 0 ${width} ${height}`,
      preserveAspectRatio: 'none',
    });

    svg.append(
      svgElement('line', {
        x1: left,
        y1: y(0),
        x2: width - right,
        y2: y(0),
        class: 'curve-zero',
      }),
      svgElement('line', {
        x1: left,
        y1: y(1),
        x2: width - right,
        y2: y(1),
        class: 'curve-grid',
      }),
      svgElement('line', {
        x1: x(0),
        y1: y(0),
        x2: x(x1),
        y2: y(y1),
        stroke: '#9fc3d2',
        'stroke-width': 1,
        'stroke-dasharray': '3 3',
      }),
      svgElement('line', {
        x1: x(1),
        y1: y(1),
        x2: x(x2),
        y2: y(y2),
        stroke: '#9fc3d2',
        'stroke-width': 1,
        'stroke-dasharray': '3 3',
      }),
      svgElement('circle', { cx: x(x1), cy: y(y1), r: 3, fill: '#9fc3d2' }),
      svgElement('circle', { cx: x(x2), cy: y(y2), r: 3, fill: '#9fc3d2' }),
    );

    let path = '';
    for (let index = 0; index <= 80; index += 1) {
      const time = index / 80;
      path += `${index ? 'L' : 'M'}${x(time).toFixed(1)} ${y(ease(time)).toFixed(1)} `;
    }
    svg.append(svgElement('path', { d: path, class: 'curve-path' }));

    const progress = svgElement('line', {
      x1: x(0),
      y1: top - 4,
      x2: x(0),
      y2: height - bottom + 4,
      class: 'curve-progress',
    });
    const dot = svgElement('circle', {
      cx: x(0),
      cy: y(ease(0)),
      r: 4.5,
      class: 'curve-dot',
    });
    svg.append(progress, dot);

    const zero = svgElement('text', { x: x(0) - 12, y: y(0) + 3 });
    zero.textContent = '0';
    const one = svgElement('text', { x: x(1) + 5, y: y(1) + 3 });
    one.textContent = '1';
    const time = svgElement('text', { x: width - right - 28, y: height - 6 });
    time.textContent = 'time';
    svg.append(zero, one, time);

    track.replaceChildren(svg);
    return { ease, x, y, progress, dot };
  }
}
