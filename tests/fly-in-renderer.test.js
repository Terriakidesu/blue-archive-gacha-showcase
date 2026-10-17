import assert from 'node:assert/strict';
import test from 'node:test';
import { bezierEaser } from '../js/curve-controller.js';
import { sampleFlyIn } from '../js/fly-in-renderer.js';

const card = {
  duration: 700,
  arrival: 0.8,
  startX: 0,
  startY: 9.6,
  startZ: 640,
  perspective: 800,
  ease: bezierEaser(0.3, 1.09, 0.36, 0.99),
};

test('entrance starts at 5x projected size with a 48px projected Y offset', () => {
  const pose = sampleFlyIn(card, 0);
  const scale = card.perspective / (card.perspective - pose.depth);
  assert.equal(scale, 5);
  assert.equal(pose.offsetY * scale, 48);
  assert.equal(pose.opacity, 0);
});

test('cards stay hidden throughout their stagger delay', () => {
  assert.deepEqual(sampleFlyIn(card, -900), sampleFlyIn(card, 0));
});

test('arrival is at the CSS 80% keyframe, followed by a stationary hold', () => {
  const arrived = sampleFlyIn(card, 560);
  assert.equal(arrived.opacity, 1);
  assert.equal(Math.abs(arrived.depth), 0);
  assert.equal(Math.abs(arrived.offsetY), 0);
  assert.deepEqual(sampleFlyIn(card, 700), arrived);
  assert.deepEqual(sampleFlyIn(card, 2000), arrived);
});

test('the segment easing is applied within the 0–80% interval', () => {
  const elapsed = 140;
  const expected = card.ease(elapsed / (card.duration * card.arrival));
  const pose = sampleFlyIn(card, elapsed);
  assert.equal(pose.depth, card.startZ * (1 - expected));
  assert.equal(pose.offsetY, card.startY * (1 - expected));
});

test('overshooting easing never produces opacity outside the CSS range', () => {
  for (let time = 0; time <= 700; time += 5) {
    const pose = sampleFlyIn(card, time);
    assert.ok(pose.opacity >= 0 && pose.opacity <= 1);
    assert.ok(card.perspective - pose.depth > 0);
  }
});
