/** Shared teaching-model parameters; not an identified ASR5000 power stage. */
export const BASE_DEFAULTS = Object.freeze({
  kp: 1.2, ki: 0.04, ts: 0.01, load: 0.25, limit: 1, mode: 'firmware',
  delaySamples: 0, filterEnabled: false, cutoffHz: 2,
});

/**
 * The optional measurement filter is a first-order bilinear low-pass, prewarped
 * so cutoffHz is its digital half-power frequency, not the analog prototype's.
 * F(z)=c(z+1)/(z-p); current y[n] participates before the PI decision at n.
 */
export function createLoopModel(input = {}) {
  const { kp, ki, ts, load, limit, mode, delaySamples, filterEnabled, cutoffHz } = { ...BASE_DEFAULTS, ...input };
  if (![kp, ki, ts, load, limit, cutoffHz].every(Number.isFinite)
      || kp < 0 || ki < 0 || load < 0 || limit <= 0 || ts <= 0 || ts > 0.1 || cutoffHz <= 0) {
    throw new RangeError('Use finite nonnegative Kp, Ki and load, positive limit/cutoff, and 0 < Ts <= 0.1 s.');
  }
  if (!['firmware', 'unconditional'].includes(mode)) throw new RangeError('Unknown integral update mode.');
  if (!Number.isInteger(delaySamples) || delaySamples < 0 || delaySamples > 8) {
    throw new RangeError('Control delay must be an integer from 0 through 8 samples.');
  }
  if (typeof filterEnabled !== 'boolean') throw new RangeError('filterEnabled must be boolean.');
  if (filterEnabled && cutoffHz * ts > 0.45 + 1e-14) {
    throw new RangeError('Enabled measurement cutoff must not exceed 0.45 / Ts Hz.');
  }
  const tau = 0.25;
  const a = Math.exp(-ts / tau), b = 1 - a;
  if (b === 0 || ![kp * ki, b * kp, (b * kp) ** 2 * (1 + ki) ** 2].every(Number.isFinite)) {
    throw new RangeError('Parameters exceed the numerical model range.');
  }
  // Do not evaluate an inactive, potentially above-Nyquist cutoff.
  const k = filterEnabled ? Math.tan(Math.PI * cutoffHz * ts) : 0;
  const c = filterEnabled ? k / (1 + k) : 1;
  const p = filterEnabled ? (1 - k) / (1 + k) : 0;
  return {
    kp, ki, ts, load, limit, mode, delaySamples, filterEnabled, cutoffHz,
    tau, a, b, filter: { enabled: filterEnabled, k, c, p },
  };
}
