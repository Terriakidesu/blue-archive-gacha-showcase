import { fullSequenceTiming } from './sequence-timing.js';

export const categoryOrder = ['Entrance', 'Landing', 'Reveal', 'Motion', 'Effects', 'Complete'];

const rarityConfig = {
  blue: {
    asset: 'Gacha-Blue.webp',
    label: 'Blue',
    stars: 1,
    landingEffect: false,
  },
  purple: {
    asset: 'Gacha-Purple.webp',
    label: 'Purple',
    stars: 3,
    landingEffect: true,
  },
  gold: {
    asset: 'Gacha-Gold.webp',
    label: 'Gold',
    stars: 2,
    landingEffect: true,
  },
};

function createCards(rarities, delayStep) {
  return rarities.map((rarity, index) => ({
    index: index + 1,
    delay: index * delayStep,
    rarity,
    ...rarityConfig[rarity],
  }));
}

function createAnimation(config) {
  const supportsFocusedPlayback = config.kind === 'fly-in' || config.kind === 'flip';

  return {
    ...config,
    cards: createCards(config.rarities, config.delayStep),
    supportsFocusedPlayback,
    focusedStatus: supportsFocusedPlayback ? 'Focused card ready' : '',
    sequenceStatus: 'Sequence ready',
  };
}

export const animations = [
  createAnimation({
    id: 'fly-in',
    name: 'Ten-pull Fly-in',
    category: 'Entrance',
    className: 'gacha-fly-in',
    kind: 'fly-in',
    duration: 700,
    landingProgress: 0.98,
    easing: '0.3, 1.09, 0.36, 0.99',
    delayStep: 100,
    rarities: ['blue', 'blue', 'blue', 'blue', 'blue', 'blue', 'blue', 'blue', 'purple', 'gold'],
  }),
  createAnimation({
    id: 'landing',
    name: 'Rarity Landing',
    category: 'Landing',
    className: 'gacha-landing-effects',
    kind: 'landing',
    duration: 800,
    easing: '0.24, 1.54, 0.35, 0.96',
    delayStep: 100,
    effectStagger: 120,
    particleDuration: 1100,
    particles: [
      { x: -10, y: 20, size: 9, delay: 0, drift: -8 },
      { x: 18, y: 4, size: 6, delay: 120, drift: -4 },
      { x: 82, y: 12, size: 10, delay: 60, drift: 6 },
      { x: 110, y: 48, size: 7, delay: 180, drift: 10 },
      { x: 8, y: 90, size: 11, delay: 80, drift: -6 },
      { x: 76, y: 106, size: 7, delay: 150, drift: 4 },
    ],
    rarities: ['blue', 'gold', 'purple'],
  }),
  createAnimation({
    id: 'flip',
    name: 'Ten-pull Reveal',
    category: 'Reveal',
    className: 'gacha-flip',
    kind: 'flip',
    duration: 2500,
    easing: '0.51, -0.33, 0.38, 1.05',
    delayStep: 120,
    rarities: ['blue', 'blue', 'blue', 'blue', 'blue', 'blue', 'blue', 'blue', 'purple', 'gold'],
  }),
];

const stages = {
  flyIn: animations.find((animation) => animation.kind === 'fly-in'),
  landing: animations.find((animation) => animation.kind === 'landing'),
  reveal: animations.find((animation) => animation.kind === 'flip'),
};

const fullSequence = createAnimation({
  id: 'full-sequence',
  name: 'Full ten-pull sequence',
  category: 'Complete',
  className: 'gacha-full-sequence',
  kind: 'full-sequence',
  easing: stages.flyIn.easing,
  delayStep: stages.flyIn.delayStep,
  rarities: stages.flyIn.rarities,
  stages,
  particles: stages.landing.particles,
  particleDuration: stages.landing.particleDuration,
});
fullSequence.duration = fullSequenceTiming(fullSequence).duration;
animations.push(fullSequence);

export const categoryGroups = categoryOrder
  .map((category) => ({
    category,
    animations: animations.filter((animation) => animation.category === category),
  }))
  .filter((group) => group.animations.length > 0);
