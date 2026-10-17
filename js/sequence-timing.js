import { bezierEaser } from './curve-controller.js';

export function landingDuration(landing) {
  return Math.max(
    landing.duration + (landing.effectStagger ?? 0),
    (landing.particleDuration ?? 0) +
      Math.max(0, ...(landing.particles ?? []).map((particle) => particle.delay)),
  );
}

export function fullSequenceTiming(animation) {
  const { flyIn, landing, reveal } = animation.stages;
  const firstLanding = visualLandingTime(flyIn);
  const lastDelay = Math.max(...animation.cards.map((card) => card.delay));
  const lastLanding = lastDelay + firstLanding;
  // Preserve the reveal handoff at the end of the last card's remaining settling motion.
  const revealStart = lastDelay + flyIn.duration * (flyIn.arrival ?? 0.8);
  const duration = Math.max(
    lastLanding + landingDuration(landing),
    revealStart + (animation.cards.length - 1) * reveal.delayStep + reveal.duration,
  );
  return { firstLanding, lastLanding, revealStart, duration };
}
/** Find the first visible arrival, rather than waiting through the easing's flat tail. */
export function visualLandingTime(flyIn) {
  const ease = bezierEaser(...flyIn.easing.split(',').map(Number));
  const threshold = Math.max(0, Math.min(1, flyIn.landingProgress ?? 0.98));
  if (!threshold) return 0;
  // Bracket the first crossing so overshooting curves don't select a later crossing.
  let low = 0;
  let high = 1;
  for (let step = 1; step <= 128; step += 1) {
    high = step / 128;
    if (ease(high) >= threshold) break;
    low = high;
  }
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const middle = (low + high) / 2;
    if (ease(middle) >= threshold) high = middle;
    else low = middle;
  }
  return high * flyIn.duration * (flyIn.arrival ?? 0.8);
}
