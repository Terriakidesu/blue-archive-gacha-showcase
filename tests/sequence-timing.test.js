import assert from 'node:assert/strict';
import test from 'node:test';
import { animations, categoryGroups } from '../js/animation-data.js';
import { fullSequenceTiming, landingDuration, visualLandingTime } from '../js/sequence-timing.js';
import { bezierEaser } from '../js/curve-controller.js';

const combined = animations.find((animation) => animation.kind === 'full-sequence');

test('the landing study staggers each card like the fly-in', () => {
  const { landing, flyIn } = combined.stages;
  assert.equal(landing.delayStep, flyIn.delayStep);
  assert.ok(landing.delayStep > 0);
  assert.deepEqual(
    landing.cards.map((card) => card.delay),
    landing.cards.map((_, index) => index * flyIn.delayStep),
  );
});

test('the complete sequence reuses the three individual studies', () => {
  assert.equal(
    combined.stages.flyIn,
    animations.find((animation) => animation.kind === 'fly-in'),
  );
  assert.equal(
    combined.stages.landing,
    animations.find((animation) => animation.kind === 'landing'),
  );
  assert.equal(
    combined.stages.reveal,
    animations.find((animation) => animation.kind === 'flip'),
  );
  assert.equal(combined.cards.length, 10);
  assert.equal(combined.supportsFocusedPlayback, false);
  assert.equal(animations.at(-1), combined);
  assert.equal(categoryGroups.at(-1).animations[0], combined);
});

test('landing effects start when each card visually lands, before the flat easing tail ends', () => {
  const timing = fullSequenceTiming(combined);
  const flyIn = combined.stages.flyIn;
  assert.equal(timing.firstLanding, visualLandingTime(flyIn));
  assert.ok(timing.firstLanding < flyIn.duration * 0.8 - 200);
  const ease = bezierEaser(...flyIn.easing.split(',').map(Number));
  const progress = ease(timing.firstLanding / (flyIn.duration * 0.8));
  assert.ok(Math.abs(progress - flyIn.landingProgress) < 0.00001);
  assert.equal(
    timing.lastLanding,
    timing.firstLanding + Math.max(...combined.cards.map((card) => card.delay)),
  );
});

test('reveal starts when the last card lands, without waiting for its effects to fade', () => {
  const timing = fullSequenceTiming(combined);
  assert.ok(timing.revealStart >= timing.lastLanding);
  assert.equal(
    timing.revealStart,
    Math.max(...combined.cards.map((card) => card.delay)) + combined.stages.flyIn.duration * 0.8,
  );
});

test('visual landing timing follows easing rather than a hardcoded millisecond offset', () => {
  const time = visualLandingTime({
    duration: 1000,
    arrival: 0.8,
    easing: '0, 0, 1, 1',
    landingProgress: 0.5,
  });
  assert.ok(Math.abs(time - 400) < 0.001);
});

test('the final status waits for the last staggered reveal and landing effects', () => {
  const timing = fullSequenceTiming(combined);
  assert.equal(
    timing.duration,
    Math.max(
      timing.lastLanding + landingDuration(combined.stages.landing),
      timing.revealStart + 9 * combined.stages.reveal.delayStep + combined.stages.reveal.duration,
    ),
  );
  assert.equal(combined.duration, timing.duration);
});

test('longer outline stagger is included even when it outlasts the particles', () => {
  assert.equal(
    landingDuration({ duration: 800, effectStagger: 1600, particleDuration: 1100, particles: [] }),
    2400,
  );
});
