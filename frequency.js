import { DEFAULTS } from './simulation.js';

/**
 * Unsaturated, fixed-period linear analysis of the lab's exact-ZOH plant.
 * This deliberately ignores load, output limits and the previous-saturation gate.
 * Ki is the firmware per-call coefficient, not a continuous integral gain.
 */
const TAU = 0.25;
const RADIUS_TOLERANCE = 1e-9;
const EDGE_TOLERANCE = 1e-10;
const measured = (value, extra = {}) => ({ value, status: 'measured', ...extra });
const absent = status => ({ value: null, status });
const pole = (re, im = 0) => ({ re, im, radius: Math.hypot(re, im) });

function model(input = {}) {
  const { kp, ki, ts } = { ...DEFAULTS, ...input };
  if (![kp, ki, ts].every(Number.isFinite) || kp < 0 || ki < 0 || ts <= 0 || ts > 0.1) {
    throw new RangeError('Use finite nonnegative Kp/Ki and 0 < Ts <= 0.1 s.');
  }
  const a = Math.exp(-ts / TAU), b = -Math.expm1(-ts / TAU);
  const n = b * kp;
  const b1 = -1 - a + n * (1 + ki), b0 = a - n;
  if (b === 0 || ![a, b, n, b1, b0, n * ki, n * n * (1 + ki) ** 2].every(Number.isFinite)) {
    throw new RangeError('Parameters exceed the numerical model range.');
  }
  return { kp, ki, ts, tau: TAU, a, b, n, b1, b0, nyquist: 1 / (2 * ts) };
}

function polar(re, im) {
  const magnitude = Math.hypot(re, im);
  const phase = Math.atan2(im, re) * 180 / Math.PI;
  // The real negative endpoint is approached from below for this PI family.
  // Choose -180 rather than atan2(+0,negative)=+180, avoiding a plot seam.
  return { magnitude, db: magnitude === 0 ? null : 20 * Math.log10(magnitude), phase: magnitude === 0 ? null : phase === 180 ? -180 : phase };
}

function response(m, frequency) {
  const { kp, ki, ts, a, b, n, nyquist } = m;
  if (!Number.isFinite(frequency) || frequency < 0 || frequency > nyquist * (1 + Number.EPSILON * 8)) {
    throw new RangeError('Frequency must lie between DC and Nyquist.');
  }
  const f = Math.min(frequency, nyquist);
  if (kp === 0) return { f, openMagnitude: 0, openDb: null, openPhase: null, closedMagnitude: 0, closedDb: null, closedPhase: null };
  if (f === 0) {
    const dc = ki > 0 ? 1 : kp / (1 + kp);
    return { f, openMagnitude: ki > 0 ? null : kp, openDb: ki > 0 ? null : 20 * Math.log10(kp), openPhase: ki > 0 ? -90 : 0, closedMagnitude: dc, closedDb: 20 * Math.log10(dc), closedPhase: 0 };
  }
  const theta = 2 * Math.PI * f * ts;
  const x = 2 * Math.sin(theta / 2) ** 2; // 1-cos(theta), without low-frequency cancellation.
  const sine = f === nyquist ? 0 : Math.sin(theta);
  const zr = 1 - x;
  const plantRealDenominator = b - x;
  const plantDenominatorMagnitude = Math.hypot(plantRealDenominator, sine);
  // z/(z-1) = 1/2 - j*cot(theta/2)/2. Its phase remains in [-90,0].
  const controllerReal = kp * (1 + ki / 2);
  const controllerImag = f === nyquist ? 0 : -kp * ki / (2 * Math.tan(theta / 2));
  const openMagnitude = Math.hypot(controllerReal, controllerImag) * b / plantDenominatorMagnitude;
  const openPhase = (Math.atan2(controllerImag, controllerReal) - Math.atan2(sine, plantRealDenominator)) * 180 / Math.PI;
  let numeratorRe, numeratorIm, denominatorRe, denominatorIm;
  if (ki === 0) {
    // Cancel z=1 explicitly; it is a retained constant-I state, not a P transfer pole.
    numeratorRe = n; numeratorIm = 0;
    denominatorRe = zr - (a - n); denominatorIm = sine;
  } else {
    numeratorRe = n * (ki - (1 + ki) * x);
    numeratorIm = n * (1 + ki) * sine;
    // (z-a)(z-1) + n*((1+Ki)z-1), evaluated near z=1 without subtracting O(1) terms.
    denominatorRe = (-x) * (b - x) - sine * sine + numeratorRe;
    denominatorIm = sine * (b - 2 * x) + numeratorIm;
  }
  const denominatorSquared = denominatorRe ** 2 + denominatorIm ** 2;
  const denominatorScale = Math.max(1, Math.hypot(numeratorRe, numeratorIm));
  const singular = Math.sqrt(denominatorSquared) <= 2e-14 * denominatorScale && f === nyquist;
  const closed = singular ? { magnitude: null, db: null, phase: null } : polar(
    (numeratorRe * denominatorRe + numeratorIm * denominatorIm) / denominatorSquared,
    (numeratorIm * denominatorRe - numeratorRe * denominatorIm) / denominatorSquared,
  );
  return { f, openMagnitude, openDb: 20 * Math.log10(openMagnitude), openPhase, closedMagnitude: closed.magnitude, closedDb: closed.db, closedPhase: closed.phase };
}

/** Evaluate L(e^jθ) and H=L/(1+L); frequency is in Hz, not radians per sample. */
export function evaluateFrequency(input, frequency) {
  return response(model(input), frequency);
}

function characteristicPoles(m) {
  if (m.ki === 0 || m.kp === 0) {
    const active = pole(m.a - m.n);
    const frozen = { ...pole(1), reason: 'constant-integral-state' };
    return { poles: [active], hiddenPoles: [frozen], fullPoles: [active, pole(1)] };
  }
  const discriminant = m.b1 ** 2 - 4 * m.b0;
  let poles;
  if (discriminant < 0) {
    const re = -m.b1 / 2, im = Math.sqrt(-discriminant) / 2;
    poles = [pole(re, im), pole(re, -im)];
  } else {
    // Stable quadratic formula: avoid loss of the small root to subtraction.
    const q = -0.5 * (m.b1 + (m.b1 < 0 ? -1 : 1) * Math.sqrt(discriminant));
    poles = q === 0 ? [pole(0), pole(0)] : [pole(q), pole(m.b0 / q)];
  }
  return { poles, hiddenPoles: [], fullPoles: poles.map(p => ({ ...p })) };
}

const frequencyFromX = (x, ts) => Math.asin(Math.sqrt(Math.max(0, Math.min(2, x)) / 2)) / (Math.PI * ts);

function crossover(m) {
  if (m.kp === 0) return absent('zero-loop');
  if (m.ki === 0 && m.kp < 1) return absent('below-unity');
  if (m.ki === 0 && m.kp === 1) return { value: 0, status: 'dc-boundary' };
  // |L| decreases strictly with x=1-cos(theta) for this nonnegative PI family.
  // Solve |L|^2=1 analytically, including crossings below the display range.
  const c0 = (m.n * m.ki) ** 2;
  const c1 = 2 * (m.n ** 2 * (1 + m.ki) - m.b ** 2);
  const root = Math.sqrt(c1 ** 2 + 16 * m.a * c0);
  const x = m.ki === 0 ? m.b ** 2 * (m.kp ** 2 - 1) / (2 * m.a)
    : c1 >= 0 ? (c1 + root) / (8 * m.a) : 2 * c0 / (root - c1);
  if (x > 2 + EDGE_TOLERANCE) return absent('above-unity-to-nyquist');
  if (Math.abs(x - 2) <= EDGE_TOLERANCE) return { value: m.nyquist, status: 'nyquist-boundary' };
  return measured(frequencyFromX(x, m.ts));
}

function realQuadraticRoots(A, B, C) {
  if (Math.abs(A) <= Number.EPSILON * Math.max(1, Math.abs(B), Math.abs(C))) return B === 0 ? [] : [-C / B];
  const discriminant = B * B - 4 * A * C;
  if (discriminant < 0) return [];
  const q = -0.5 * (B + (B < 0 ? -1 : 1) * Math.sqrt(discriminant));
  return q === 0 ? [0] : [q / A, C / q];
}

function bandwidth(m, stability) {
  if (m.kp === 0) return absent('zero-loop');
  if (stability !== 'stable') return absent(stability);
  let candidates;
  if (m.ki === 0) {
    const p = m.a - m.n;
    candidates = p > 0 ? [(1 - p) ** 2 / (2 * p)] : [];
  } else {
    // |D|² - 2|N|² = A*x²+B*x+C, with H(0)=1. The first negative→positive
    // crossing is the first downward half-power crossing, even for a nonmonotone H.
    const s = m.n * m.ki;
    const A = 4 * m.b0;
    const B = 2 * (1 - m.b0) ** 2 - 2 * s * (1 + m.b0) - 4 * m.n ** 2 * (1 + m.ki);
    const C = -(s ** 2);
    candidates = realQuadraticRoots(A, B, C).filter(x => 2 * A * x + B > 0);
  }
  const x = candidates.filter(v => Number.isFinite(v) && v > 0 && v <= 2 + EDGE_TOLERANCE).sort((a, b) => a - b)[0];
  if (x === undefined) return absent('not-before-nyquist');
  if (Math.abs(x - 2) <= EDGE_TOLERANCE) return { value: m.nyquist, status: 'nyquist-boundary' };
  return measured(frequencyFromX(x, m.ts));
}

/** Analyze poles and baseband frequencies of the same linear recurrence as the lab. */
export function analyzeFrequency(input = {}) {
  const m = model(input);
  const { poles, hiddenPoles, fullPoles } = characteristicPoles(m);
  const maxRadius = Math.max(...poles.map(p => p.radius));
  const status = maxRadius > 1 + RADIUS_TOLERANCE ? 'unstable' : maxRadius >= 1 - RADIUS_TOLERANCE ? 'marginal' : 'stable';
  const internalStatus = status === 'unstable' ? 'unstable' : hiddenPoles.length ? 'neutral-integrator' : status === 'stable' ? 'asymptotically-stable' : 'marginal';
  const stability = { status, maxRadius, internalStatus, tolerance: RADIUS_TOLERANCE };
  const gainCrossover = crossover(m);
  const phaseMargin = gainCrossover.value === null ? absent(gainCrossover.status) : {
    value: gainCrossover.status === 'dc-boundary' ? 180 : gainCrossover.status === 'nyquist-boundary' ? 0 : 180 + response(m, gainCrossover.value).openPhase,
    status: gainCrossover.status, frequency: gainCrossover.value,
  };
  const cutoff = bandwidth(m, status);
  const dcGain = m.kp === 0 ? 0 : m.ki === 0 ? m.kp / (1 + m.kp) : 1;
  // Include relevant low-frequency crossings, instead of silently cutting them off.
  const usefulFrequencies = [gainCrossover.value, cutoff.value].filter(f => f !== null && f > 0);
  const fMin = Math.max(m.nyquist * 1e-10, Math.min(m.nyquist * 1e-4, ...usefulFrequencies.map(f => f / 20)));
  const logSpan = Math.log(m.nyquist / fMin);
  const frequencies = Array.from({ length: 481 }, (_, i) => i === 480 ? m.nyquist : fMin * Math.exp(logSpan * i / 480));
  // Include exact crossover/cutoff points so graph markers and curves agree.
  frequencies.push(...usefulFrequencies.filter(f => f >= fMin && f <= m.nyquist));
  const points = [...new Set(frequencies)].sort((a, b) => a - b).map(f => response(m, f));
  let previousPhase = null;
  for (const point of points) {
    if (point.closedPhase === null) continue;
    if (previousPhase !== null) {
      while (point.closedPhase - previousPhase > 180) point.closedPhase -= 360;
      while (point.closedPhase - previousPhase < -180) point.closedPhase += 360;
    }
    previousPhase = point.closedPhase;
  }
  return {
    options: { kp: m.kp, ki: m.ki, ts: m.ts, tau: m.tau }, a: m.a, b: m.b,
    nyquist: m.nyquist, fMin, fMax: m.nyquist, points,
    poles, hiddenPoles, fullPoles, stability, coefficients: { b1: m.b1, b0: m.b0 },
    metrics: { dcGain, gainCrossover, phaseMargin, bandwidth: cutoff },
  };
}

/** Zero-state, unit-reference step; no saturation, disturbance or integral gate. */
export function linearStepResponse(input = {}, { duration = 2.5, maxAmplitude = 4 } = {}) {
  const m = model(input);
  if (!Number.isFinite(duration) || duration < 0 || !Number.isFinite(maxAmplitude) || maxAmplitude <= 0) {
    throw new RangeError('Use nonnegative duration and a positive finite amplitude bound.');
  }
  const lastIndex = Math.floor(duration / m.ts + 1e-10);
  if (lastIndex > 10000) throw new RangeError('Linear step preview is limited to 10000 intervals.');
  let y = 0, integral = 0;
  const points = [];
  for (let n = 0; n <= lastIndex; n += 1) {
    const t = Number((n * m.ts).toPrecision(14));
    if (!Number.isFinite(y) || Math.abs(y) > maxAmplitude) return { points, truncated: true, stopTime: t };
    points.push({ t, y });
    if (n < lastIndex) {
      const up = m.kp * (1 - y);
      integral += m.ki * up;
      y = m.a * y + m.b * (up + integral);
    }
  }
  return { points, truncated: false, stopTime: null };
}
