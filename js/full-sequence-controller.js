import { fullSequenceTiming } from './sequence-timing.js';

/** Coordinates existing fly-in, landing and reveal animations on a single replay clock. */
export class FullSequenceController {
  states = new Map();
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  constructor(flyInRenderer) {
    this.flyInRenderer = flyInRenderer;
    this.reducedMotion.addEventListener('change', () => {
      if (this.reducedMotion.matches) {
        this.states.forEach((state) => {
          if (state.playing) this.finish(state);
        });
      }
    });
  }

  mount(animations) {
    animations
      .filter((animation) => animation.kind === 'full-sequence')
      .forEach((animation) => {
        const panel = document.querySelector(`[data-animation-panel="${animation.id}"]`);
        if (!panel) return;
        const state = { animation, panel, timers: [], playing: false };
        this.states.set(animation.id, state);
        // At rest, show the front cards. Play starts the complete sequence from scratch.
        panel.getAnimations({ subtree: true }).forEach((timeline) => {
          if (timeline.animationName === 'gacha-fly-in-anim') timeline.finish();
          else {
            timeline.pause();
            timeline.currentTime = 0;
          }
        });
        panel.addEventListener('flyinrendererfallback', () => {
          if (state.playing) this.play(state.animation, state.onStatus);
        });
      });
  }

  clearTimers(state) {
    state.timers.forEach((timer) => clearTimeout(timer));
    state.timers = [];
  }

  schedule(state, delay, callback) {
    state.timers.push(setTimeout(callback, delay));
  }

  play(animation, onStatus) {
    const state = this.states.get(animation.id);
    if (!state) return;
    this.clearTimers(state);
    state.animation = animation;
    state.onStatus = onStatus;
    state.playing = true;
    state.panel.classList.remove('is-revealing');
    const now = performance.now();
    const webgl = this.flyInRenderer.play(animation.id, 'sequence', now);
    const timelines = state.panel.getAnimations({ subtree: true });
    timelines.forEach((timeline) => {
      timeline.currentTime = 0;
      timeline.play();
      timeline.startTime = document.timeline.currentTime;
    });
    if (this.reducedMotion.matches) {
      this.finish(state);
      return;
    }
    const timing = fullSequenceTiming(animation);
    onStatus?.('Cards flying in');
    this.schedule(state, timing.firstLanding, () => onStatus?.('Cards landing'));
    this.schedule(state, timing.revealStart, () => {
      state.panel.classList.add('is-revealing');
      if (webgl) this.flyInRenderer.hide(animation.id, 'sequence');
      onStatus?.('Cards revealing');
    });
    this.schedule(state, timing.duration, () => {
      state.playing = false;
      onStatus?.('Sequence complete');
    });
  }

  finish(state) {
    this.clearTimers(state);
    state.playing = false;
    state.panel.classList.add('is-revealing');
    this.flyInRenderer.hide(state.animation.id, 'sequence');
    state.panel.getAnimations({ subtree: true }).forEach((timeline) => timeline.finish());
    state.onStatus?.('Sequence complete');
  }
}
