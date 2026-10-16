export const categoryOrder = ['Entrance', 'Reveal', 'Motion', 'Effects'];

const rarityConfig = {
  blue: {
    asset: 'Gacha-Blue.svg',
    label: 'Blue',
    stars: 1,
  },
  purple: {
    asset: 'Gacha-Purple.svg',
    label: 'Purple',
    stars: 3,
  },
  gold: {
    asset: 'Gacha-Gold.svg',
    label: 'Gold',
    stars: 2,
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
  return {
    ...config,
    cards: createCards(config.rarities, config.delayStep),
    focusedKey: 0,
    focusedVisible: true,
    focusedStatus: 'Focused card ready',
    sequenceVisible: true,
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
    easing: '0.3, 1.09, 0.36, 0.99',
    delayStep: 100,
    rarities: ['blue', 'blue', 'blue', 'blue', 'blue', 'blue', 'blue', 'blue', 'purple', 'gold'],
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

export const categoryGroups = categoryOrder
  .map((category) => ({
    category,
    animations: animations.filter((animation) => animation.category === category),
  }))
  .filter((group) => group.animations.length > 0);
