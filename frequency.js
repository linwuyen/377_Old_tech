import { createLoopModel } from './loop-model.js';
import { multiplyPolynomial, addPolynomial, solvePolynomialRoots, realRootsInInterval } from './polynomial.js';

const RADIUS_TOLERANCE = 1e-9;
const EDGE_TOLERANCE = 1e-10;
const absent = status => ({ value: null, status });
const measured = (value, extra = {}) => ({ value, status: 'measured', ...extra });
const frequencyFromX = (x, ts) => Math.asin(Math.sqrt(Math.max(0, Math.min(2, x)) / 2)) / (Math.PI * ts);
const multiply = multiplyPolynomial;

function model(input = {}) {
  const m = createLoopModel(input);
  const useIntegral = m.kp > 0 && m.ki > 0;
  const controllerNumerator = useIntegral ? [m.kp * (1 + m.ki), -m.kp] : [m.kp];
  const controllerDenominator = useIntegral ? [1, -1] : [1];
  const forwardNumerator = controllerNumerator.map(c => c * m.b);
  const forwardDenominator = [...multiply([1, -m.a], controllerDenominator), ...Array(m.delaySamples).fill(0)];
  const filterNumerator = m.filterEnabled ? [m.filter.c, m.filter.c] : [1];
  const filterDenominator = m.filterEnabled ? [1, -m.filter.p] : [1];
  const denominator = addPolynomial(multiply(forwardDenominator, filterDenominator), multiply(forwardNumerator, filterNumerator));
  const outputNumerator = multiply(forwardNumerator, filterDenominator);
  const measuredNumerator = multiply(forwardNumerator, filterNumerator);
  return { ...m, useIntegral, nyquist: 1 / (2 * m.ts), denominator, outputNumerator, measuredNumerator };
}

function polar(re, im) {
  const magnitude = Math.hypot(re, im), phase = Math.atan2(im, re) * 180 / Math.PI;
  return { magnitude, db: magnitude === 0 ? null : 20 * Math.log10(magnitude), phase: magnitude === 0 ? null : phase === 180 ? -180 : phase };
}

/** L=A F is the return ratio; Hy=A/(1+A F) is RAW plant output, not Hm. */
function response(m, frequency) {
  const { kp, ki, ts, a, b, nyquist, delaySamples, filterEnabled, filter } = m;
  if (!Number.isFinite(frequency) || frequency < 0 || frequency > nyquist * (1 + 8 * Number.EPSILON)) throw new RangeError('Frequency must lie between DC and Nyquist.');
  const f = Math.min(frequency, nyquist), theta = 2 * Math.PI * f * ts;
  const filterRatio = filterEnabled ? f === nyquist ? Infinity : Math.tan(theta / 2) / filter.k : 0;
  const filterMagnitude = filterEnabled ? 1 / Math.hypot(1, filterRatio) : 1;
  const filterPhase = filterMagnitude === 0 ? null : -Math.atan(filterRatio) * 180 / Math.PI;
  const filterDb = filterMagnitude === 0 ? null : 20 * Math.log10(filterMagnitude);
  const filterValues = { filterMagnitude, filterDb, filterPhase };
  if (kp === 0) return { f, openMagnitude: 0, openDb: null, openPhase: null, closedMagnitude: 0, closedDb: null, closedPhase: null, measuredMagnitude: 0, measuredDb: null, measuredPhase: null, ...filterValues };
  if (f === 0) {
    const dc = ki > 0 ? 1 : kp / (1 + kp);
    return { f, openMagnitude: ki > 0 ? null : kp, openDb: ki > 0 ? null : 20 * Math.log10(kp), openPhase: ki > 0 ? -90 : 0, closedMagnitude: dc, closedDb: 20 * Math.log10(dc), closedPhase: 0, measuredMagnitude: dc, measuredDb: 20 * Math.log10(dc), measuredPhase: 0, ...filterValues };
  }
  const x = 2 * Math.sin(theta / 2) ** 2, sine = f === nyquist ? 0 : Math.sin(theta);
  const controllerReal = kp * (1 + ki / 2), controllerImag = f === nyquist ? 0 : -kp * ki / (2 * Math.tan(theta / 2));
  const forwardMagnitude = Math.hypot(controllerReal, controllerImag) * b / Math.hypot(b - x, sine);
  const forwardPhase = Math.atan2(controllerImag, controllerReal) - Math.atan2(sine, b - x) - delaySamples * theta;
  const openMagnitude = forwardMagnitude * filterMagnitude;
  // Retain accumulated delay phase; do not wrap it into ±180 for the PM readout.
  const openPhaseRadians = forwardPhase - Math.atan(filterRatio);
  const openPhase = openMagnitude === 0 ? null : openPhaseRadians * 180 / Math.PI;
  const forwardRe = forwardMagnitude * Math.cos(forwardPhase), forwardIm = forwardMagnitude * Math.sin(forwardPhase);
  const loopRe = openMagnitude * Math.cos(openPhaseRadians), loopIm = openMagnitude * Math.sin(openPhaseRadians);
  const denominatorRe = 1 + loopRe, denominatorIm = loopIm;
  const denominatorSquared = denominatorRe ** 2 + denominatorIm ** 2;
  const singular = Math.sqrt(denominatorSquared) <= 2e-14 * Math.max(1, openMagnitude);
  let closed = singular ? { magnitude: null, db: null, phase: null } : polar(
    (forwardRe * denominatorRe + forwardIm * denominatorIm) / denominatorSquared,
    (forwardIm * denominatorRe - forwardRe * denominatorIm) / denominatorSquared,
  );
  // At a real-axis Nyquist endpoint choose its one-sided principal phase limit.
  if (!singular && f === nyquist && !filterEnabled && delaySamples === 0 && closed.phase > 179.999999) closed.phase = -180;
  const measuredMagnitude = closed.magnitude === null ? null : closed.magnitude * filterMagnitude;
  const measuredPhase = measuredMagnitude === null || measuredMagnitude === 0 ? null : closed.phase + filterPhase;
  return {
    f, openMagnitude, openDb: openMagnitude === 0 ? null : 20 * Math.log10(openMagnitude), openPhase,
    closedMagnitude: closed.magnitude, closedDb: closed.db, closedPhase: closed.phase,
    measuredMagnitude, measuredDb: measuredMagnitude === null || measuredMagnitude === 0 ? null : 20 * Math.log10(measuredMagnitude), measuredPhase,
    ...filterValues,
  };
}

export function evaluateFrequency(input, frequency) { return response(model(input), frequency); }

function crossover(m) {
  if (m.kp === 0) return absent('zero-loop');
  if (m.ki === 0 && m.kp < 1) return absent('below-unity');
  if (m.ki === 0 && m.kp === 1) return { value: 0, status: 'dc-boundary' };
  const end = response(m, m.nyquist).openMagnitude;
  if (end > 1 + EDGE_TOLERANCE) return absent('above-unity-to-nyquist');
  if (Math.abs(end - 1) <= EDGE_TOLERANCE) return { value: m.nyquist, status: 'nyquist-boundary' };
  // The positive-parameter PI × first-order plant × low-pass magnitude decreases
  // strictly. Delay is all-pass, so this bracket contains the unique crossing.
  let lo = 0, hi = m.nyquist;
  for (let i = 0; i < 90; i++) {
    const mid = (lo + hi) / 2;
    if (response(m, mid).openMagnitude > 1) lo = mid; else hi = mid;
  }
  return measured((lo + hi) / 2);
}

// Ascending coefficients of |P(e^jθ)|² as a polynomial in x=1-cosθ.
function magnitudePolynomial(coefficients) {
  const degree = coefficients.length - 1;
  const chebyshev = [[1], [1, -1]];
  for (let n = 2; n <= degree; n++) {
    const next = Array(n + 1).fill(0);
    for (let i = 0; i < chebyshev[n - 1].length; i++) { next[i] += 2 * chebyshev[n - 1][i]; next[i + 1] -= 2 * chebyshev[n - 1][i]; }
    for (let i = 0; i < chebyshev[n - 2].length; i++) next[i] -= chebyshev[n - 2][i];
    chebyshev.push(next);
  }
  const result = Array(degree + 1).fill(0);
  for (let lag = 0; lag <= degree; lag++) {
    let correlation = 0;
    for (let i = 0; i + lag <= degree; i++) correlation += coefficients[i] * coefficients[i + lag];
    for (let j = 0; j < chebyshev[lag].length; j++) result[j] += (lag ? 2 : 1) * correlation * chebyshev[lag][j];
  }
  return result;
}

function bandwidth(m, status, dcGain) {
  if (m.kp === 0) return absent('zero-loop');
  if (status !== 'stable') return absent(status);
  const den = magnitudePolynomial(m.denominator), num = magnitudePolynomial(m.outputNumerator);
  const polynomial = den.map((v, i) => dcGain ** 2 * v - 2 * (num[i] || 0));
  // D(1), N(1) can be tiny differences of order-one polynomial coefficients.
  // Set the known DC coefficient directly instead of subtracting those terms.
  const numeratorDC = m.b * m.kp * (m.useIntegral ? m.ki : 1) * (m.filterEnabled ? 2 * m.filter.c : 1);
  polynomial[0] = -(numeratorDC ** 2);
  const derivative = polynomial.slice(1).map((v, i) => v * (i + 1)).reverse();
  const critical = realRootsInInterval(derivative, 0, 2).filter(x => x > 0 && x < 2);
  const partitions = [0, ...critical, 2];
  const residual = x => {
    if (x === 0) return -(dcGain ** 2);
    const magnitude = response(m, frequencyFromX(x, m.ts)).closedMagnitude;
    return magnitude === null ? -Infinity : dcGain ** 2 - 2 * magnitude ** 2;
  };
  // Derivative roots partition the exact trigonometric magnitude equation into
  // monotone segments. Refine its FIRST negative→positive crossing using the
  // complex response, avoiding a grid's missed narrow peaks and cancellation.
  for (let i = 0; i < partitions.length - 1; i++) {
    let lo = partitions[i], hi = partitions[i + 1];
    const flo = residual(lo), fhi = residual(hi);
    if (!(flo < 0 && fhi >= 0)) continue;
    for (let n = 0; n < 85; n++) {
      const mid = (lo + hi) / 2;
      if (mid === lo || mid === hi) break;
      if (residual(mid) < 0) lo = mid; else hi = mid;
    }
    const x = (lo + hi) / 2;
    if (Math.abs(residual(x)) > 2e-8 * Math.max(1e-12, dcGain ** 2)) return absent('indeterminate');
    return Math.abs(x - 2) < EDGE_TOLERANCE ? { value: m.nyquist, status: 'nyquist-boundary' } : measured(frequencyFromX(x, m.ts));
  }
  return absent('not-before-nyquist');
}

export function analyzeFrequency(input = {}) {
  const m = model(input), solved = solvePolynomialRoots(m.denominator);
  const poles = solved.roots;
  const hiddenPoles = m.useIntegral ? [] : [{ re: 1, im: 0, radius: 1, reason: 'constant-integral-state' }];
  const fullPoles = [...poles, ...hiddenPoles];
  const maxRadius = Math.max(...poles.map(p => p.radius));
  const status = !solved.converged ? 'indeterminate' : maxRadius > 1 + RADIUS_TOLERANCE ? 'unstable' : maxRadius >= 1 - RADIUS_TOLERANCE ? 'marginal' : 'stable';
  const internalStatus = status === 'indeterminate' ? 'indeterminate' : status === 'unstable' ? 'unstable' : hiddenPoles.length ? 'neutral-integrator' : status === 'stable' ? 'asymptotically-stable' : 'marginal';
  const stability = { status, maxRadius, internalStatus, tolerance: RADIUS_TOLERANCE };
  const gainCrossover = crossover(m);
  const phaseMargin = gainCrossover.value === null ? absent(gainCrossover.status) : {
    value: gainCrossover.status === 'dc-boundary' ? 180 : 180 + response(m, gainCrossover.value).openPhase,
    status: gainCrossover.status, frequency: gainCrossover.value,
  };
  const dcGain = m.kp === 0 ? 0 : m.ki === 0 ? m.kp / (1 + m.kp) : 1;
  const cutoff = bandwidth(m, status, dcGain);
  const useful = [gainCrossover.value, cutoff.value, m.filterEnabled ? m.cutoffHz : null].filter(f => f !== null && f > 0);
  const fMin = Math.max(m.nyquist * 1e-10, Math.min(m.nyquist * 1e-4, ...useful.map(f => f / 20)));
  const logSpan = Math.log(m.nyquist / fMin);
  const frequencies = Array.from({ length: 721 }, (_, i) => i === 720 ? m.nyquist : fMin * Math.exp(logSpan * i / 720));
  frequencies.push(...useful.filter(f => f >= fMin && f <= m.nyquist));
  const points = [...new Set(frequencies)].sort((a, b) => a - b).map(f => response(m, f));
  for (const key of ['closedPhase', 'measuredPhase']) {
    let previous = null;
    for (const point of points) {
      if (point[key] === null) continue;
      if (previous !== null) {
        while (point[key] - previous > 180) point[key] -= 360;
        while (point[key] - previous < -180) point[key] += 360;
      }
      previous = point[key];
    }
  }
  return {
    options: { kp: m.kp, ki: m.ki, ts: m.ts, tau: m.tau, delaySamples: m.delaySamples, filterEnabled: m.filterEnabled, cutoffHz: m.cutoffHz },
    a: m.a, b: m.b, filter: m.filter, nyquist: m.nyquist, fMin, fMax: m.nyquist, points,
    poles, hiddenPoles, fullPoles, stability,
    solver: { converged: solved.converged, residual: solved.residual, coefficientError: solved.coefficientError, iterations: solved.iterations, degree: m.denominator.length - 1 },
    coefficients: { b1: m.denominator[1], b0: m.denominator.at(-1), denominator: m.denominator, outputNumerator: m.outputNumerator, measuredNumerator: m.measuredNumerator, degree: m.denominator.length - 1 },
    phaseConvention: '180 degrees plus accumulated, continuously unwrapped loop phase; stability is determined from poles',
    metrics: { dcGain, gainCrossover, phaseMargin, bandwidth: cutoff },
  };
}

/** Unit-reference linear step; the same optional sensing and actuator pipeline. */
export function linearStepResponse(input = {}, { duration = 2.5, maxAmplitude = 4 } = {}) {
  const m = model(input);
  if (!Number.isFinite(duration) || duration < 0 || !Number.isFinite(maxAmplitude) || maxAmplitude <= 0) throw new RangeError('Use nonnegative duration and a positive finite amplitude bound.');
  const lastIndex = Math.floor(duration / m.ts + 1e-10);
  if (lastIndex > 10000) throw new RangeError('Linear step preview is limited to 10000 intervals.');
  let y = 0, integral = 0, previousY = 0, previousFeedback = 0;
  const points = [], commands = [];
  for (let n = 0; n <= lastIndex; n++) {
    const t = Number((n * m.ts).toPrecision(14));
    if (!Number.isFinite(y) || Math.abs(y) > maxAmplitude) return { points, truncated: true, stopTime: t };
    const feedback = m.filterEnabled ? m.filter.p * previousFeedback + m.filter.c * (y + previousY) : y;
    points.push({ t, y, feedback });
    if (n < lastIndex) {
      const up = m.kp * (1 - feedback);
      integral += m.ki * up;
      commands.push(up + integral);
      const applied = n < m.delaySamples ? 0 : commands[n - m.delaySamples];
      previousY = y; previousFeedback = feedback;
      y = m.a * y + m.b * applied;
    }
  }
  return { points, truncated: false, stopTime: null };
}
