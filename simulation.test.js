import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, PRESETS, simulateClosedLoop } from './simulation.js';
import { createLoopModel } from './loop-model.js';

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

test('zero added delay and a bypassed filter exactly preserve baseline samples', () => {
  const baseline = simulateClosedLoop();
  const explicit = simulateClosedLoop({ delaySamples: 0, filterEnabled: false, cutoffHz: 1000 });
  assert.deepEqual(explicit.points, baseline.points);
  assert.deepEqual(explicit.metrics, baseline.metrics);
  assert.ok(explicit.points.every(point => point.feedback === point.y && point.appliedOut === point.out));
});

test('control delay holds command history and shifts first plant motion by the requested samples', () => {
  for (const delaySamples of [1, 3, 8]) {
    const result = simulateClosedLoop({ delaySamples, load: 0 });
    const step = result.events.stepIndex;
    for (let offset = 0; offset <= delaySamples; offset++) close(result.points[step + offset].y, 0);
    close(result.points[step + delaySamples].appliedOut, result.points[step].out);
    close(result.points[step + delaySamples + 1].y, (1 - Math.exp(-0.01 / 0.25)) * result.points[step].out);
    for (const point of result.points) {
      close(point.appliedOut, point.n >= delaySamples ? result.points[point.n - delaySamples].out : 0);
    }
  }
});

test('integral gate observes the controller previous limit even while the actuator is delayed', () => {
  const result = simulateClosedLoop({ kp: 4, ki: 0.4, delaySamples: 4 });
  const first = result.points[result.events.stepIndex];
  const next = result.points[first.n + 1];
  assert.equal(first.out, 1);
  assert.equal(first.appliedOut, 0);
  assert.equal(next.appliedOut, 0);
  assert.equal(next.frozen, true);
  close(next.ui, first.ui);
});

test('measurement filter matches independent convolution with its impulse response', () => {
  const options = { kp: 0, load: 0.4, filterEnabled: true, cutoffHz: 2, ts: 0.02 };
  const result = simulateClosedLoop(options);
  const { filter: { p, c } } = createLoopModel(options);
  for (const index of [151, 157, 175, 249, 250, 275]) {
    let expected = c * result.points[index].y;
    for (let lag = 1; lag <= index; lag++) expected += c * (1 + p) * p ** (lag - 1) * result.points[index - lag].y;
    close(result.points[index].feedback, expected);
  }
  assert.ok(result.points.some(point => Math.abs(point.feedback - point.y) > 0.01));
});

test('prewarped bilinear cutoff is half power with -45 degree phase and unity DC gain', () => {
  for (const cutoffHz of [2, 10, 40]) {
    const { ts, filter: { c, p } } = createLoopModel({ filterEnabled: true, cutoffHz });
    close(2 * c / (1 - p), 1);
    const theta = 2 * Math.PI * cutoffHz * ts;
    let output = 0, previousInput = 0, real = 0, imag = 0;
    const discard = 1000, samples = 5000;
    for (let n = 0; n < discard + samples; n++) {
      const input = Math.cos(theta * n);
      output = p * output + c * (input + previousInput);
      previousInput = input;
      if (n >= discard) {
        real += 2 * output * Math.cos(theta * n) / samples;
        imag -= 2 * output * Math.sin(theta * n) / samples;
      }
    }
    close(Math.hypot(real, imag), Math.SQRT1_2, 1e-10);
    close(Math.atan2(imag, real), -Math.PI / 4, 1e-10);
  }
});

test('filtered feedback drives error while settling metrics remain tied to raw plant output', () => {
  const result = simulateClosedLoop({ filterEnabled: true, cutoffHz: 2, delaySamples: 2 });
  assert.ok(result.points.some(point => Math.abs(point.feedback - point.y) > 0.001));
  for (const point of result.points) close(point.error, point.reference - point.feedback);
  const rawPeak = Math.max(...result.points.slice(result.events.stepIndex, result.events.loadOnIndex).map(point => point.y));
  close(result.metrics.peak, rawPeak);
  close(result.metrics.finalError, 0.6 - result.points.at(-1).y);
  const baseline = simulateClosedLoop({ kp: 0, load: 0.4 });
  const filtered = simulateClosedLoop({ kp: 0, load: 0.4, filterEnabled: true });
  assert.deepEqual(filtered.points.map(point => point.y), baseline.points.map(point => point.y));
  assert.deepEqual(filtered.metrics, baseline.metrics);
});

test('delay/filter validation rejects ambiguous or out-of-band model settings', () => {
  for (const options of [
    { delaySamples: -1 }, { delaySamples: 0.5 }, { delaySamples: 9 },
    { filterEnabled: 1 }, { cutoffHz: 0 }, { cutoffHz: NaN },
    { filterEnabled: true, cutoffHz: 50, ts: 0.01 },
    { filterEnabled: true, cutoffHz: 5, ts: 0.1 },
  ]) assert.throws(() => simulateClosedLoop(options), RangeError);
  assert.doesNotThrow(() => simulateClosedLoop({ filterEnabled: true, cutoffHz: 4.5, ts: 0.1 }));
  assert.doesNotThrow(() => simulateClosedLoop({ filterEnabled: false, cutoffHz: 1000 }));
});
