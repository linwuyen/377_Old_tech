/**
 * Normalized closed-loop teaching model; NOT an identified ASR5000 power stage.
 * Controller operation order follows runPI at PID_Control_Module.h L140–184.
 * Ki is the firmware's dimensionless, per-call T/Ti coefficient. Changing ts
 * deliberately does not rescale Ki. JavaScript Number is not target float32.
 */
export const DEFAULTS = Object.freeze({
  kp: 1.2, ki: 0.04, ts: 0.01, load: 0.25, limit: 1, mode: 'firmware',
});

export const PRESETS = Object.freeze([
  { id: 'calm', label: '平順追蹤', description: '觀察基準階躍與可補償的負載擾動。', options: { ...DEFAULTS } },
  { id: 'overshoot', label: '積分偏強', description: '提高每拍積分，觀察超調與振盪。', options: { ...DEFAULTS, kp: 0.8, ki: 0.2 } },
  { id: 'overload', label: '負載超出能力', description: '負載期間所需輸出大於上限；比較卸載後的飽和恢復。', options: { ...DEFAULTS, kp: 1.2, ki: 0.12, load: 0.9 } },
  { id: 'slow', label: '放慢取樣', description: '保持 Kp、Ki，將週期拉長；同時改變等效積分強度與取樣延遲。', options: { ...DEFAULTS, ts: 0.1 } },
  { id: 'unstable', label: '線性失穩', description: '較慢取樣搭配較大增益，觀察極點越過單位圓；限幅波形有界不等於線性穩定。', options: { ...DEFAULTS, kp: 6, ki: 0.4, ts: 0.1 } },
]);

const TARGET = 0.6;
const TAU = 0.25;
const DURATION = 8;
const NOMINAL_EVENTS = Object.freeze({ step: 0.5, loadOn: 3, loadOff: 5 });
const emptyMetric = status => ({ value: null, status });
const measured = (value, extra = {}) => ({ value, status: 'measured', ...extra });

/** First sampled time after the last out-of-band sample, within this window. */
function settling(points, target, start) {
  if (!points.length) return emptyMetric('not-reached');
  const tolerance = 0.02 * TARGET;
  let lastOutside = -1;
  for (let index = 0; index < points.length; index += 1) {
    if (Math.abs(points[index].y - target) > tolerance) lastOutside = index;
  }
  if (lastOutside === points.length - 1) return emptyMetric('not-reached');
  const entry = points[lastOutside + 1];
  const observedFor = points.at(-1).t - entry.t;
  // A sampled endpoint alone is not evidence of recovery. This experiment asks
  // for one plant time constant of observed residence, not an infinite-time claim.
  if (observedFor + 1e-12 < TAU) {
    return { value: null, status: 'insufficient-window', candidateValue: entry.t - start, observedFor };
  }
  return measured(entry.t - start, { observedFor });
}

function summarize(points, events, options) {
  const stepWindow = points.filter(point => point.n >= events.stepIndex && point.n < events.loadOnIndex);
  const postRelease = points.filter(point => point.n >= events.loadOffIndex);
  const peak = Math.max(...stepWindow.map(point => point.y));
  const ten = stepWindow.find(point => point.y >= 0.1 * TARGET);
  const ninety = stepWindow.find(point => point.y >= 0.9 * TARGET);
  const beforeRelease = points[events.loadOffIndex - 1];
  const firstUnclipped = postRelease.find(point => !point.saturated);
  let saturationExit;
  if (options.load === 0 || !beforeRelease?.saturated) saturationExit = emptyMetric('not-applicable');
  else if (!firstUnclipped) saturationExit = emptyMetric('not-reached');
  else saturationExit = measured(firstUnclipped.t - events.loadOff, { time: firstUnclipped.t });
  return {
    peak,
    overshootPercent: Math.max(0, (peak - TARGET) / TARGET * 100),
    riseTime: ten && ninety ? measured(ninety.t - ten.t) : emptyMetric('not-reached'),
    settlingTime: settling(stepWindow, TARGET, events.step),
    recoveryTime: options.load === 0 ? emptyMetric('not-applicable') : settling(postRelease, TARGET, events.loadOff),
    saturationExit,
    saturationDuration: points.reduce((sum, point) => sum + (point.saturated ? point.dt : 0), 0),
    finalError: TARGET - points.at(-1).y,
    stepWindowEnd: stepWindow.at(-1).t,
    band: 0.02 * TARGET,
    minimumObservation: TAU,
  };
}

/**
 * At sample n: measure y[n] -> compute e/P/I and clamp u[n] -> hold u,d for
 * dt -> obtain y[n+1]. The final sample has dt=0: no phantom plant interval.
 * A non-divisor ts ends at the last complete sample <=8 s; events.end records it.
 */
export function simulateClosedLoop(input = {}) {
  const { kp, ki, ts, load, limit, mode } = { ...DEFAULTS, ...input };
  if (![kp, ki, ts, load, limit].every(Number.isFinite)
      || kp < 0 || ki < 0 || load < 0 || limit <= 0 || ts <= 0 || ts > 0.1) {
    throw new RangeError('Use finite nonnegative Kp, Ki and load, positive limit, and 0 < ts <= 0.1 s.');
  }
  if (!['firmware', 'unconditional'].includes(mode)) throw new RangeError('Unknown integral update mode.');
  const lastIndex = Math.floor(DURATION / ts + 1e-10);
  if (lastIndex + 1 > 10000) throw new RangeError('Simulation must contain at most 10000 samples.');
  const indexAt = time => Math.ceil(time / ts - 1e-10);
  const timeAt = index => Number((index * ts).toPrecision(14));
  const events = { nominal: NOMINAL_EVENTS };
  for (const [name, time] of Object.entries(NOMINAL_EVENTS)) {
    events[`${name}Index`] = indexAt(time);
    events[name] = timeAt(events[`${name}Index`]);
  }
  events.end = timeAt(lastIndex);
  const options = { kp, ki, ts, load, limit, mode, target: TARGET, tau: TAU, duration: DURATION };
  const a = Math.exp(-ts / TAU);
  let y = 0;
  let ui = 0;
  let previousOut = 0;
  let previousPre = 0;
  const points = [];
  for (let n = 0; n <= lastIndex; n += 1) {
    const reference = n < events.stepIndex ? 0 : TARGET;
    const disturbance = n >= events.loadOnIndex && n < events.loadOffIndex ? load : 0;
    const error = reference - y;
    const up = kp * error;
    // This comparison precedes the current pre-saturation calculation in runPI.
    const frozen = mode === 'firmware' && previousOut !== previousPre;
    if (!frozen) ui += ki * up;
    const pre = up + ui;
    const out = Math.max(-limit, Math.min(limit, pre));
    if (![y, error, up, ui, pre, out].every(Number.isFinite)) throw new RangeError('Parameters overflow the numerical model.');
    points.push({
      n, t: timeAt(n), reference, y, error, up, ui, pre, out, frozen,
      saturated: out !== pre, load: disturbance, previousOut, previousPre,
      dt: n < lastIndex ? ts : 0,
    });
    if (n < lastIndex) y = a * y + (1 - a) * (out - disturbance);
    previousOut = out;
    previousPre = pre;
  }
  return { options, points, events, metrics: summarize(points, events, options) };
}
