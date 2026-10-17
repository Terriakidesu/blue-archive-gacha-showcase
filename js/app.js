import { createApp } from 'https://unpkg.com/petite-vue@0.4.1/dist/petite-vue.es.js?module';
import { animations, categoryGroups } from './animation-data.js';
import { CurveController } from './curve-controller.js';
import { FlyInRenderer } from './fly-in-renderer.js';
import { FullSequenceController } from './full-sequence-controller.js';
import { fullSequenceTiming } from './sequence-timing.js';

const curveController = new CurveController();
const flyInRenderer = new FlyInRenderer();
const fullSequenceController = new FullSequenceController(flyInRenderer);

function animationStyle(animation, card) {
  if (animation.kind === 'full-sequence') {
    const timing = fullSequenceTiming(animation);
    return {
      '--fly-in-delay': `${card.delay}ms`,
      '--landing-delay': `${card.delay + timing.firstLanding}ms`,
      '--landing-stagger': `${animation.stages.landing.effectStagger ?? 0}ms`,
      '--flip-delay': `${timing.revealStart + (card.index - 1) * animation.stages.reveal.delayStep}ms`,
    };
  }
  const property =
    animation.kind === 'flip'
      ? '--flip-delay'
      : animation.kind === 'landing'
        ? '--landing-delay'
        : '--fly-in-delay';
  return {
    [property]: `${card.delay}ms`,
    ...(animation.kind === 'landing'
      ? { '--landing-stagger': `${animation.effectStagger ?? 0}ms` }
      : {}),
  };
}

function fullSequenceDuration(animation) {
  const finalCardDelay = Math.max(...animation.cards.map((card) => card.delay));
  const outlineDuration = animation.duration + (animation.effectStagger ?? 0);
  const particleDuration =
    (animation.particleDuration ?? 0) +
    Math.max(0, ...(animation.particles ?? []).map((particle) => particle.delay));
  return finalCardDelay + Math.max(outlineDuration, particleDuration);
}

function replayCards(animation, selector) {
  const panel = document.querySelector(`[data-animation-panel="${animation.id}"]`);
  const cards = panel.querySelectorAll(`${selector} .gacha-card`);
  const targets = [...cards].map((card) =>
    animation.kind === 'flip'
      ? card.querySelector('.gacha-card-inner')
      : animation.kind === 'landing'
        ? card.querySelector('.gacha-landing-effects')
        : card,
  );
  const timelines = targets
    .filter(Boolean)
    .flatMap((target) => target.getAnimations({ subtree: true }));

  // Reuse the existing elements, decoded images, and composited layers.
  timelines.forEach((timeline) => {
    timeline.currentTime = 0;
    timeline.play();
  });
}

function resetStatus(animation, property, duration) {
  window.clearTimeout(animation[property]);
  animation[property] = window.setTimeout(() => {
    animation[`${property.replace('Timer', '')}Status`] =
      property === 'sequenceTimer' ? 'Sequence ready' : 'Focused card ready';
  }, duration);
}

function setupSidebarObserver() {
  const links = [...document.querySelectorAll('[data-sidebar-link]')];
  const sections = [...document.querySelectorAll('[data-animation-panel]')];

  if (!('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((link) => {
          link.classList.toggle('is-active', link.hash === `#${entry.target.id}`);
        });
      });
    },
    { rootMargin: '-30% 0px -55% 0px' },
  );

  sections.forEach((section) => observer.observe(section));
}

async function prepareCardImages() {
  const images = [
    ...document.querySelectorAll(
      '.gacha-card-front img, .gacha-fly-card-image, .gacha-result-portrait img',
    ),
  ];

  await Promise.all(
    images.map(async (image) => {
      try {
        await image.decode?.();
      } catch {
        // The image may already be decoded or still be completing its load.
      }
    }),
  );
}

const app = {
  animations,
  categoryGroups,

  animationStyle,

  particleStyle(animation, particle) {
    return {
      left: `${particle.x}%`,
      top: `${particle.y}%`,
      '--particle-size': `${particle.size}px`,
      '--particle-delay': `${particle.delay}ms`,
      '--particle-duration': `${animation.particleDuration}ms`,
      '--particle-drift': `${particle.drift}px`,
    };
  },

  cardClasses(animation, card) {
    if (animation.kind === 'full-sequence') {
      return [`gacha-card--${card.rarity}`, 'gacha-full-card', 'gacha-fly-in', 'gacha-flip'];
    }
    return [
      `gacha-card--${card.rarity}`,
      ...(animation.kind === 'landing' ? [] : [animation.className]),
    ];
  },

  cardIndex(card) {
    return String(card.index).padStart(2, '0');
  },

  frontAlt(card) {
    return `${card.label} gacha card front`;
  },

  sequenceDescriptor(animation) {
    if (animation.kind === 'full-sequence') return '5 × 2 / fly-in → landing → reveal';
    return animation.kind === 'landing'
      ? '3 cards / coordinated playback'
      : '5 × 2 / staggered sequence';
  },

  playbackDescriptor(animation) {
    if (animation.kind === 'full-sequence') return 'AUTOMATIC THREE-STAGE PLAYBACK';
    return animation.supportsFocusedPlayback
      ? 'CURVE SYNCED TO FOCUSED CARD'
      : 'ALL THREE CARDS PLAY TOGETHER';
  },

  playSequence(animation) {
    if (animation.kind === 'full-sequence') {
      fullSequenceController.play(animation, (status) => (animation.sequenceStatus = status));
      return;
    }
    if (!flyInRenderer.play(animation.id, 'sequence')) replayCards(animation, '.showcase-grid');
    animation.sequenceStatus = 'Sequence playing';
    resetStatus(animation, 'sequenceTimer', fullSequenceDuration(animation) + 250);
  },

  playFocused(animation) {
    if (!animation.supportsFocusedPlayback) return;

    if (!flyInRenderer.play(animation.id, 'focused')) replayCards(animation, '[data-focused-card]');
    animation.focusedStatus = 'Focused card playing';
    curveController.play(animation.id);
    resetStatus(animation, 'focusedTimer', animation.duration + 250);
  },
};

createApp(app).mount('#app');
prepareCardImages().then(async () => {
  fullSequenceController.mount(animations);
  await flyInRenderer.mount(animations);
  document.querySelector('#app')?.classList.remove('is-preloading');
  requestAnimationFrame(() => {
    curveController.mount(animations, flyInRenderer.playbackSources);
    setupSidebarObserver();
  });
});
