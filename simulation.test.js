import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, PRESETS, simulateClosedLoop } from './simulation.js';

const close = (actual, expected, tolerance = 1e-10) => assert.ok(
  Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`,
);
const at = (result, time) => result.points.find(point => Math.abs(point.t - time) < 1e-10);

test('zero controller cannot track, and absent load has no recovery metric', () => {
  const result = simulateClosedLoop({ kp: 0, load: 0 });
  assert.ok(result.points.every(point => point.y === 0 && point.out === 0));
  assert.equal(result.metrics.peak, 0);
  assert.equal(result.metrics.overshootPercent, 0);
  assert.deepEqual(result.metrics.riseTime, { value: null, status: 'not-reached' });
  assert.deepEqual(result.metrics.settlingTime, { value: null, status: 'not-reached' });
  assert.equal(result.metrics.recoveryTime.status, 'not-applicable');
  assert.equal(result.metrics.saturationExit.status, 'not-applicable');
  assert.equal(result.metrics.finalError, 0.6);
});

test('load-only trajectory agrees with the continuous first-order analytical solution', () => {
  const result = simulateClosedLoop({ kp: 0, load: 0.4 });
  close(at(result, 3).y, 0); // y is sampled before this interval's disturbance acts.
  close(at(result, 3.25).y, -0.4 * (1 - Math.exp(-1)));
  close(at(result, 5).y, -0.4 * (1 - Math.exp(-8)));
  close(at(result, 5.25).y, -0.4 * (1 - Math.exp(-8)) * Math.exp(-1));
  assert.equal(at(result, 3).load, 0.4);
  assert.equal(at(result, 5).load, 0);
});

test('unsaturated proportional-only sampled feedback matches its closed-form recurrence', () => {
  const result = simulateClosedLoop({ kp: 1, ki: 0, load: 0, limit: 2 });
  const a = Math.exp(-DEFAULTS.ts / 0.25);
  const pole = 2 * a - 1;
  for (const offset of [1, 10, 50, 100]) {
    const point = result.points[result.events.stepIndex + offset];
    close(point.y, 0.3 * (1 - pole ** offset));
  }
});

test('first PI step integrates Ki times Up before the plant advances', () => {
  const result = simulateClosedLoop();
  const first = result.points[result.events.stepIndex];
  const next = result.points[result.events.stepIndex + 1];
  close(first.y, 0);
  close(first.error, 0.6);
  close(first.up, 0.72);
  close(first.ui, 0.0288);
  close(first.pre, 0.7488);
  close(first.out, 0.7488);
  assert.equal(first.frozen, false);
  close(next.y, (1 - Math.exp(-0.01 / 0.25)) * 0.7488);
});

test('previous clipping freezes the next integral, including an error reversal', () => {
  const result = simulateClosedLoop({ kp: 4, ki: 0.4 });
  const first = result.points[result.events.stepIndex];
  const next = result.points[result.events.stepIndex + 1];
  close(first.ui, 0.96);
  close(first.pre, 3.36);
  close(first.out, 1);
  assert.equal(first.saturated, true);
  assert.equal(first.frozen, false);
  assert.equal(next.frozen, true);
  close(next.ui, first.ui);
  const reversal = result.points.find((point, index) => index > 0
    && point.error * result.points[index - 1].error < 0 && result.points[index - 1].saturated);
  assert.ok(reversal, 'fixture must include a sign reversal after a clipped call');
  assert.equal(reversal.frozen, true);
  close(reversal.ui, result.points[reversal.n - 1].ui);
});

test('exactly touching a limit does not count as clipping or freeze the next call', () => {
  const result = simulateClosedLoop({ kp: 1, ki: 0, limit: 0.6, load: 0 });
  const first = result.points[result.events.stepIndex];
  assert.equal(first.pre, 0.6);
  assert.equal(first.out, first.pre);
  assert.equal(first.saturated, false);
  assert.equal(result.points[first.n + 1].frozen, false);
});

test('non-divisor periods apply events on the next grid sample and exclude a phantom final interval', () => {
  const result = simulateClosedLoop({ ts: 0.07, kp: 100, ki: 0, load: 0, limit: 0.5 });
  assert.equal(result.events.step, 0.56);
  assert.equal(result.events.loadOn, 3.01);
  assert.equal(result.events.loadOff, 5.04);
  assert.equal(result.events.end, 7.98);
  assert.equal(result.points.length, 115);
  assert.equal(result.points.at(-1).dt, 0);
  assert.equal(result.points.at(-1).saturated, true);
  close(result.points.reduce((sum, point) => sum + point.dt, 0), result.events.end);
  close(result.metrics.saturationDuration, result.events.end - result.events.step);
  assert.equal(result.points[result.events.stepIndex - 1].reference, 0);
  assert.equal(result.points[result.events.stepIndex].reference, 0.6);
});

test('step overshoot is measured before load; the later disturbance cannot change that metric', () => {
  const preset = PRESETS.find(item => item.id === 'overshoot').options;
  const withoutLoad = simulateClosedLoop({ ...preset, load: 0 });
  const withLoad = simulateClosedLoop({ ...preset, load: 1.2 });
  close(withLoad.metrics.peak, withoutLoad.metrics.peak);
  close(withLoad.metrics.overshootPercent, 16.54852326713972, 1e-8);
  close(withLoad.metrics.overshootPercent, (withLoad.metrics.peak - 0.6) / 0.6 * 100);
  close(withLoad.metrics.riseTime.value, 0.19);
  close(withLoad.metrics.settlingTime.value, 0.98);
});

test('windup comparison separates first unclipping from observed tracking recovery', () => {
  const preset = PRESETS.find(item => item.id === 'overload').options;
  const firmware = simulateClosedLoop(preset);
  const comparison = simulateClosedLoop({ ...preset, mode: 'unconditional' });
  close(firmware.metrics.saturationExit.value, 0.11);
  close(comparison.metrics.saturationExit.value, 2.64);
  assert.ok(comparison.metrics.saturationDuration > firmware.metrics.saturationDuration * 2);
  assert.ok(comparison.points.every(point => !point.frozen));
  assert.equal(firmware.metrics.recoveryTime.status, 'measured');
  close(firmware.metrics.recoveryTime.value, 0.65);
  // The final two hundredths of a second alone do not establish recovery.
  assert.equal(comparison.metrics.recoveryTime.status, 'insufficient-window');
  assert.equal(comparison.metrics.recoveryTime.value, null);
  close(comparison.metrics.recoveryTime.observedFor, 0.02);
});

test('limited horizon and nonreleasing saturation return explicit null metrics', () => {
  const slow = simulateClosedLoop(PRESETS.find(item => item.id === 'slow').options);
  assert.equal(slow.metrics.riseTime.status, 'not-reached');
  assert.equal(slow.metrics.settlingTime.status, 'not-reached');
  assert.equal(slow.metrics.recoveryTime.status, 'not-reached');
  const clipped = simulateClosedLoop({ kp: 100, ki: 0, load: 1.2, limit: 0.5 });
  assert.equal(clipped.metrics.saturationExit.status, 'not-reached');
  assert.equal(clipped.metrics.saturationExit.value, null);
  assert.equal(clipped.metrics.recoveryTime.status, 'not-reached');
});

test('all presets produce finite bounded trajectories without changing per-call Ki with Ts', () => {
  for (const preset of PRESETS) {
    const result = simulateClosedLoop(preset.options);
    assert.equal(result.options.ki, preset.options.ki);
    for (const point of result.points) {
      assert.ok(Object.values(point).every(value => typeof value !== 'number' || Number.isFinite(value)));
      assert.ok(point.out >= -result.options.limit && point.out <= result.options.limit);
    }
  }
  const fast = simulateClosedLoop({ ts: 0.01 });
  const slow = simulateClosedLoop({ ts: 0.1 });
  close(fast.points[fast.events.stepIndex].ui, slow.points[slow.events.stepIndex].ui);
  assert.ok(slow.metrics.finalError > fast.metrics.finalError);
});

test('invalid and unbounded inputs are rejected before a trajectory can contain NaN', () => {
  for (const options of [
    { kp: NaN }, { ki: Infinity }, { load: -1 }, { kp: -1 }, { ki: -1 },
    { limit: 0 }, { ts: 0 }, { ts: 0.2 }, { ts: 0.0001 }, { mode: 'invented' },
    { kp: 1e308, ki: 1e308 },
  ]) assert.throws(() => simulateClosedLoop(options), RangeError);
});
