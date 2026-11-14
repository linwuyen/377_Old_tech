import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFrequency, evaluateFrequency, linearStepResponse } from './frequency.js';

const close = (actual, expected, tolerance = 1e-9) => assert.ok(
  Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`,
);

test('frequency response agrees with an independent sinusoidal closed-loop experiment', () => {
  const options = { kp: 1.2, ki: 0.04, ts: 0.01 };
  const frequency = 2;
  const omega = 2 * Math.PI * frequency * options.ts;
  const a = Math.exp(-options.ts / 0.25);
  let y = 0, integral = 0, sine = 0, cosine = 0;
  for (let n = 0; n < 10000; n += 1) {
    const ref = Math.sin(omega * n);
    if (n >= 5000) { sine += y * ref; cosine += y * Math.cos(omega * n); }
    const p = options.kp * (ref - y);
    integral += options.ki * p;
    y = a * y + (1 - a) * (p + integral);
  }
  const response = evaluateFrequency(options, frequency);
  close(response.closedMagnitude, 2 * Math.hypot(sine, cosine) / 5000, 1e-11);
  close(response.closedPhase, Math.atan2(cosine, sine) * 180 / Math.PI, 1e-9);
});

test('open-loop Nyquist gain has the expected real negative value and -180 degree phase', () => {
  const options = { kp: 2.1, ki: 0.15, ts: 0.04 };
  const a = Math.exp(-options.ts / 0.25);
  const expected = options.kp * (1 - a) * (2 + options.ki) / (2 * (1 + a));
  const point = evaluateFrequency(options, 1 / (2 * options.ts));
  close(point.openMagnitude, expected);
  close(point.openDb, 20 * Math.log10(expected));
  close(point.openPhase, -180);
});

test('PI DC gain and P-only DC gain use the correct limits', () => {
  const pi = evaluateFrequency({ kp: 1.2, ki: 0.04, ts: 0.01 }, 0);
  assert.equal(pi.closedMagnitude, 1);
  assert.equal(pi.closedPhase, 0);
  assert.equal(pi.openDb, null); // Infinite open-loop DC gain is not finite plot data.
  const p = evaluateFrequency({ kp: 0.8, ki: 0, ts: 0.01 }, 0);
  close(p.closedMagnitude, 0.8 / 1.8);
  close(p.openMagnitude, 0.8);
});

test('P-only reduction removes the neutral integrator from the reference dynamics', () => {
  const options = { kp: 0.8, ki: 0, ts: 0.01 };
  const a = Math.exp(-options.ts / 0.25), b = 1 - a;
  const result = analyzeFrequency(options);
  assert.equal(result.poles.length, 1);
  close(result.poles[0].re, a - b * options.kp);
  assert.equal(result.hiddenPoles.length, 1);
  assert.equal(result.hiddenPoles[0].re, 1);
  assert.equal(result.stability.status, 'stable');
  assert.equal(result.stability.internalStatus, 'neutral-integrator');
  assert.equal(result.metrics.gainCrossover.status, 'below-unity');
  assert.equal(result.metrics.phaseMargin.value, null);
  const pole = a - b * options.kp;
  const bandwidth = Math.acos(1 - (1 - pole) ** 2 / (2 * pole)) / (2 * Math.PI * options.ts);
  close(result.metrics.bandwidth.value, bandwidth, 1e-10);
});

test('zero gain has no tracking transfer or defined phase margin/bandwidth', () => {
  const result = analyzeFrequency({ kp: 0 });
  assert.equal(result.metrics.dcGain, 0);
  assert.equal(result.metrics.phaseMargin.status, 'zero-loop');
  assert.equal(result.metrics.bandwidth.status, 'zero-loop');
  assert.equal(result.metrics.gainCrossover.value, null);
  assert.equal(result.stability.internalStatus, 'neutral-integrator');
  assert.equal(result.hiddenPoles[0].re, 1);
  assert.ok(result.points.every(p => p.openDb === null && p.closedDb === null && p.openPhase === null));
});

test('DC and Nyquist gain crossovers have explicit boundary statuses', () => {
  const dc = analyzeFrequency({ kp: 1, ki: 0 });
  assert.equal(dc.metrics.gainCrossover.status, 'dc-boundary');
  assert.equal(dc.metrics.gainCrossover.value, 0);
  assert.equal(dc.metrics.phaseMargin.value, 180);
  const ts = 0.1, ki = 0.4, a = Math.exp(-ts / 0.25);
  const kp = 2 * (1 + a) / ((1 - a) * (2 + ki));
  const nyquist = analyzeFrequency({ kp, ki, ts });
  assert.equal(nyquist.stability.status, 'marginal');
  assert.equal(nyquist.metrics.gainCrossover.status, 'nyquist-boundary');
  close(nyquist.metrics.gainCrossover.value, 5);
  close(nyquist.metrics.phaseMargin.value, 0);
  assert.equal(nyquist.metrics.bandwidth.status, 'marginal');
  assert.ok(nyquist.poles.some(p => Math.abs(p.re + 1) < 1e-9));
  assert.equal(nyquist.points.at(-1).closedDb, null);
});

test('unstable loop reports poles outside the unit circle and no ordinary bandwidth', () => {
  const result = analyzeFrequency({ kp: 6, ki: 0.4, ts: 0.1 });
  assert.equal(result.stability.status, 'unstable');
  assert.ok(result.stability.maxRadius > 1);
  assert.equal(result.metrics.gainCrossover.status, 'above-unity-to-nyquist');
  assert.equal(result.metrics.phaseMargin.value, null);
  assert.equal(result.metrics.bandwidth.status, 'unstable');
});

test('positive-parameter PI poles satisfy characteristic roots and state matrix invariants', () => {
  for (const options of [{ kp: 1.2, ki: 0.04, ts: 0.01 }, { kp: 0.8, ki: 0.2, ts: 0.01 }, { kp: 6, ki: 0.4, ts: 0.1 }]) {
    const result = analyzeFrequency(options);
    const a = Math.exp(-options.ts / 0.25), b = 1 - a;
    // State is [y[n], I[n-1]]; this matrix is derived directly from each update.
    const trace = a - b * options.kp * (1 + options.ki) + 1;
    const determinant = a - b * options.kp;
    close(result.fullPoles.reduce((sum, p) => sum + p.re, 0), trace);
    const [p, q] = result.fullPoles;
    close(p.re * q.re - p.im * q.im, determinant);
    for (const pole of result.fullPoles) {
      const realResidual = pole.re ** 2 - pole.im ** 2 + result.coefficients.b1 * pole.re + result.coefficients.b0;
      const imagResidual = 2 * pole.re * pole.im + result.coefficients.b1 * pole.im;
      close(realResidual, 0); close(imagResidual, 0);
    }
  }
});

test('gain crossover and bandwidth solve their defining magnitude equations', () => {
  for (const options of [{ kp: 1.2, ki: 0.04, ts: 0.01 }, { kp: 0.8, ki: 0.2, ts: 0.01 }, { kp: 0.05, ki: 0.005, ts: 0.1 }]) {
    const result = analyzeFrequency(options);
    assert.equal(result.metrics.gainCrossover.status, 'measured');
    const crossover = evaluateFrequency(options, result.metrics.gainCrossover.value);
    close(crossover.openMagnitude, 1, 2e-9);
    close(result.metrics.phaseMargin.value, 180 + crossover.openPhase);
    assert.equal(result.metrics.bandwidth.status, 'measured');
    const cutoff = evaluateFrequency(options, result.metrics.bandwidth.value);
    close(cutoff.closedMagnitude, result.metrics.dcGain / Math.SQRT2, 2e-8);
    assert.ok(result.fMin < result.metrics.gainCrossover.value);
    assert.ok(result.fMin < result.metrics.bandwidth.value);
  }
});

test('stable sampled systems can have no -3dB cutoff before Nyquist', () => {
  const ts = 0.1, a = Math.exp(-ts / 0.25);
  const result = analyzeFrequency({ kp: a / (1 - a), ki: 0, ts });
  assert.equal(result.stability.status, 'stable');
  close(result.poles[0].radius, 0);
  assert.equal(result.metrics.bandwidth.status, 'not-before-nyquist');
});

test('frequency and pole results ignore load, output limit, and nonlinear gate mode', () => {
  const base = analyzeFrequency();
  const changed = analyzeFrequency({ load: 1.2, limit: 0.5, mode: 'unconditional' });
  assert.deepEqual(changed, base);
  assert.equal(base.points.at(-1).f, base.nyquist);
  for (const point of base.points) {
    assert.ok(Object.values(point).every(value => value === null || typeof value !== 'number' || Number.isFinite(value)));
  }
});

test('closed-loop phase stays continuous at Nyquist for stable and unstable systems', () => {
  for (const options of [{ kp: 1.2, ki: 0.04, ts: 0.01 }, { kp: 6, ki: 0.4, ts: 0.1 }, { kp: 0.8, ki: 0, ts: 0.01 }]) {
    const result = analyzeFrequency(options);
    const near = evaluateFrequency(options, result.nyquist * (1 - 1e-8));
    const endpoint = evaluateFrequency(options, result.nyquist);
    assert.ok(Math.abs(endpoint.closedPhase - near.closedPhase) < 1e-4);
    let previous = null;
    for (const point of result.points) {
      if (point.closedPhase === null) continue;
      if (previous !== null) assert.ok(Math.abs(point.closedPhase - previous) <= 180);
      previous = point.closedPhase;
    }
  }
});

test('linear step matches the independent proportional closed-form solution', () => {
  const options = { kp: 1.3, ki: 0, ts: 0.01 };
  const response = linearStepResponse(options);
  const a = Math.exp(-options.ts / 0.25), pole = a - (1 - a) * options.kp;
  for (const point of response.points) {
    const n = Math.round(point.t / options.ts);
    close(point.y, options.kp / (1 + options.kp) * (1 - pole ** n));
  }
  assert.equal(response.truncated, false);
  assert.equal(response.stopTime, null);
});

test('linear PI step agrees with the scalar second-order closed-loop recurrence', () => {
  const options = { kp: 0.8, ki: 0.2, ts: 0.01 };
  const result = analyzeFrequency(options), response = linearStepResponse(options);
  const b = 1 - Math.exp(-options.ts / 0.25);
  let ym1 = 0, ym2 = 0;
  for (let n = 0; n < response.points.length; n += 1) {
    const r1 = n >= 1 ? 1 : 0, r2 = n >= 2 ? 1 : 0;
    const expected = -result.coefficients.b1 * ym1 - result.coefficients.b0 * ym2 + b * options.kp * ((1 + options.ki) * r1 - r2);
    close(response.points[n].y, expected, 1e-10);
    ym2 = ym1; ym1 = expected;
  }
});

test('linear instability truncates before an out-of-range or nonfinite point', () => {
  const response = linearStepResponse({ kp: 6, ki: 0.4, ts: 0.1 });
  assert.equal(response.truncated, true);
  assert.ok(response.points.every(p => Number.isFinite(p.y) && Math.abs(p.y) <= 4));
  close(response.stopTime, response.points.at(-1).t + 0.1);
});

test('invalid inputs and frequencies fail explicitly', () => {
  for (const options of [{ kp: -1 }, { ki: NaN }, { ts: 0 }, { ts: 0.2 }, { kp: Infinity }, { kp: 1e308, ki: 1e308 }]) {
    assert.throws(() => analyzeFrequency(options), RangeError);
  }
  assert.throws(() => evaluateFrequency({}, -1), RangeError);
  assert.throws(() => evaluateFrequency({}, 51), RangeError);
  assert.throws(() => linearStepResponse({}, { duration: -1 }), RangeError);
  assert.throws(() => linearStepResponse({}, { maxAmplitude: 0 }), RangeError);
});
