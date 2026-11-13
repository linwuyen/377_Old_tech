import test from 'node:test';
import assert from 'node:assert/strict';
import { simulatePI } from './lab.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} ≠ ${expected}`);

test('first sample integrates Ki times Up from an initially unsaturated state', () => {
  const [point] = simulatePI({ kp: 2, ki: 0.1, limit: 10, amplitude: 0.5, samples: 2 });
  assert.equal(point.n, 1);
  assert.equal(point.error, 0.5);
  assert.equal(point.up, 1);
  close(point.ui, 0.1);
  close(point.pre, 1.1);
  close(point.out, 1.1);
  assert.equal(point.frozen, false);
});

test('firmware freezes using the PREVIOUS saturation state, including on error reversal', () => {
  const points = simulatePI({ kp: 1.2, ki: 0.08, limit: 1, amplitude: 1, samples: 4 });
  assert.equal(points[0].out, 1);
  close(points[0].pre, 1.296);
  assert.equal(points[1].frozen, true);
  close(points[1].ui, 0.096);
  assert.equal(points[2].error, -0.35);
  assert.equal(points[2].frozen, true);
  close(points[2].out, -0.324);
  assert.equal(points[3].frozen, false);
  close(points[3].ui, 0.0624);
});

test('touching the limit without clamping does not freeze the next sample', () => {
  const points = simulatePI({ kp: 1, ki: 0, limit: 1, amplitude: 1, samples: 4 });
  assert.equal(points[0].out, points[0].pre);
  assert.equal(points[1].frozen, false);
});

test('comparison mode continues accumulating while the output is saturated', () => {
  const points = simulatePI({ mode: 'unconditional' });
  close(points[49].ui, 4.8);
  close(points[50].ui, 4.7664);
  assert.equal(points[50].out, 1);
  assert.ok(points.every(point => !point.frozen));
});

test('negative output is clamped to the symmetric lower limit', () => {
  const points = simulatePI({ kp: 4, ki: 0, limit: 1, amplitude: 1, samples: 4 });
  assert.equal(points[2].pre, -1.4);
  assert.equal(points[2].out, -1);
  assert.equal(points[3].frozen, true);
});

test('default sequence has 100 finite bounded outputs and reverses at sample 51', () => {
  const points = simulatePI();
  assert.equal(points.length, 100);
  assert.equal(points[49].error, 1);
  assert.equal(points[50].error, -0.35);
  for (const point of points) {
    for (const key of ['n', 'error', 'up', 'ui', 'pre', 'out']) assert.ok(Number.isFinite(point[key]));
    assert.ok(point.out >= -1 && point.out <= 1);
  }
});

test('zero error remains at zero and invalid parameters are rejected', () => {
  assert.ok(simulatePI({ amplitude: 0 }).every(point => point.out === 0 && point.ui === 0));
  assert.throws(() => simulatePI({ kp: NaN }), RangeError);
  assert.throws(() => simulatePI({ limit: 0 }), RangeError);
  assert.throws(() => simulatePI({ samples: 2.5 }), RangeError);
  assert.throws(() => simulatePI({ mode: 'invented' }), RangeError);
});
