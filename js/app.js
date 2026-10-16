import { createApp } from 'https://unpkg.com/petite-vue@0.4.1/dist/petite-vue.es.js?module';
import { animations, categoryGroups } from './animation-data.js';
import { CurveController } from './curve-controller.js';

const curveController = new CurveController();

function animationStyle(animation, card) {
  const property = animation.kind === 'flip' ? '--flip-delay' : '--fly-in-delay';
  return { [property]: `${card.delay}ms` };
}

function fullSequenceDuration(animation) {
  return animation.duration + Math.max(...animation.cards.map((card) => card.delay));
}

function replayCards(animation, selector) {
  const panel = document.querySelector(`[data-animation-panel="${animation.id}"]`);
  const cards = panel.querySelectorAll(`${selector} .gacha-card`);
  const targets = [...cards].map((card) =>
    animation.kind === 'flip' ? card.querySelector('.gacha-card-inner') : card,
  );
  const timelines = targets.flatMap((target) => target.getAnimations());

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
  const images = [...document.querySelectorAll('.gacha-card-front img')];

  await Promise.all(
    images.map(async (image) => {
      try {
        await image.decode?.();
      } catch {
        // The image may already be decoded or still be completing its load.
      }
    }),
  );

  document.querySelector('#app')?.classList.remove('is-preloading');
}

const app = {
  animations,
  categoryGroups,

  animationStyle,

  cardClasses(animation, card) {
    return [`gacha-card--${card.rarity}`, animation.className];
  },

  cardIndex(card) {
    return String(card.index).padStart(2, '0');
  },

  frontAlt(card) {
    return `${card.label} gacha card front`;
  },

  playSequence(animation) {
    replayCards(animation, '.showcase-grid');
    animation.sequenceStatus = 'Sequence playing';
    resetStatus(animation, 'sequenceTimer', fullSequenceDuration(animation) + 250);
  },

  playFocused(animation) {
    replayCards(animation, '[data-focused-card]');
    animation.focusedStatus = 'Focused card playing';
    curveController.play(animation.id);
    resetStatus(animation, 'focusedTimer', animation.duration + 250);
  },
};

createApp(app).mount('#app');
prepareCardImages().then(() => {
  requestAnimationFrame(() => {
    curveController.mount(animations);
    setupSidebarObserver();
  });
});
