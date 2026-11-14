/** Small real-polynomial utilities (descending coefficients), degrees <= 11. */
export function multiplyPolynomial(a, b) {
  const out = Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
  return out;
}
export function addPolynomial(a, b) {
  const n = Math.max(a.length, b.length), out = Array(n).fill(0);
  for (let i = 0; i < n; i++) out[i] = (a[i - (n - a.length)] || 0) + (b[i - (n - b.length)] || 0);
  return out;
}
export const evaluatePolynomial = (coefficients, x) => coefficients.reduce((v, c) => v * x + c, 0);
const abs = z => Math.hypot(z.re, z.im);
const mul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const div = (a, b) => { const d = b.re * b.re + b.im * b.im; return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }; };
const sub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
function polynomialAndDerivative(coefficients, z) {
  let value = { re: coefficients[0], im: 0 }, derivative = { re: 0, im: 0 };
  for (let i = 1; i < coefficients.length; i++) {
    derivative = mul(derivative, z); derivative.re += value.re; derivative.im += value.im;
    value = mul(value, z); value.re += coefficients[i];
  }
  return { value, derivative };
}
function diagnostics(coefficients, roots) {
  const residual = Math.max(0, ...roots.map(z => {
    const denominator = coefficients.reduce((sum, c) => sum * abs(z) + Math.abs(c), 0);
    return abs(polynomialAndDerivative(coefficients, z).value) / Math.max(denominator, Number.MIN_VALUE);
  }));
  let recovered = [{ re: 1, im: 0 }];
  for (const z of roots) {
    const next = Array.from({ length: recovered.length + 1 }, () => ({ re: 0, im: 0 }));
    for (let j = 0; j < recovered.length; j++) {
      next[j].re += recovered[j].re; next[j].im += recovered[j].im;
      const product = mul(recovered[j], z); next[j + 1].re -= product.re; next[j + 1].im -= product.im;
    }
    recovered = next;
  }
  const scale = Math.max(...coefficients.map(Math.abs), 1);
  const coefficientError = Math.max(...recovered.map((c, i) => Math.hypot(c.re - coefficients[i], c.im) / scale));
  return { residual, coefficientError };
}

/**
 * Ehrlich–Aberth correction, with several deterministic starting circles.
 * Iteration is not assumed to converge: validate every root AND reconstructed
 * coefficients (multiplicity), and report failure instead of asserting stability.
 * Method reference: https://doi.org/10.1090/S0025-5718-1973-0329236-7
 */
export function solvePolynomialRoots(input) {
  if (!Array.isArray(input) || !input.length || !input.every(Number.isFinite) || input[0] === 0) throw new RangeError('Finite descending coefficients with nonzero leading term required.');
  const full = input.map(c => c / input[0]);
  const coefficients = [...full]; let zeros = 0;
  while (coefficients.length > 1 && coefficients.at(-1) === 0) { coefficients.pop(); zeros++; }
  const degree = coefficients.length - 1;
  let roots = [], iterations = 0;
  if (degree === 1) roots = [{ re: -coefficients[1], im: 0 }];
  else if (degree === 2) {
    const [_, b, c] = coefficients, discriminant = b * b - 4 * c;
    if (discriminant < 0) roots = [{ re: -b / 2, im: Math.sqrt(-discriminant) / 2 }, { re: -b / 2, im: -Math.sqrt(-discriminant) / 2 }];
    else { const q = -0.5 * (b + (b < 0 ? -1 : 1) * Math.sqrt(discriminant)); roots = q === 0 ? [{ re: 0, im: 0 }, { re: 0, im: 0 }] : [{ re: q, im: 0 }, { re: c / q, im: 0 }]; }
  } else if (degree > 2) {
    const radius = Math.max(1, 2 * Math.max(...coefficients.slice(1).map((c, i) => Math.abs(c) ** (1 / (i + 1)))));
    let best;
    for (const offset of [0.37, 0.13, 0.73]) {
      const candidates = Array.from({ length: degree }, (_, i) => ({ re: radius * Math.cos(2 * Math.PI * (i + offset) / degree), im: radius * Math.sin(2 * Math.PI * (i + offset) / degree) }));
      for (let iteration = 0; iteration < 700; iteration++) {
        let maximumCorrection = 0;
        for (let i = 0; i < degree; i++) {
          const z = candidates[i], { value, derivative } = polynomialAndDerivative(coefficients, z);
          if (abs(value) === 0) continue;
          const newton = div(value, derivative); let sum = { re: 0, im: 0 };
          for (let j = 0; j < degree; j++) if (j !== i) {
            const difference = sub(z, candidates[j]);
            if (abs(difference) < 1e-30) difference.im += 1e-15;
            const inverse = div({ re: 1, im: 0 }, difference); sum.re += inverse.re; sum.im += inverse.im;
          }
          const product = mul(newton, sum), correction = div(newton, { re: 1 - product.re, im: -product.im });
          if (![correction.re, correction.im].every(Number.isFinite)) continue;
          candidates[i] = sub(z, correction);
          maximumCorrection = Math.max(maximumCorrection, abs(correction) / (1 + abs(candidates[i])));
        }
        iterations++;
        if (maximumCorrection < 2e-14) break;
      }
      // Suppress roundoff-only imaginary components of real roots.
      for (const z of candidates) if (Math.abs(z.im) < 1e-12 * (1 + Math.abs(z.re))) z.im = 0;
      const check = diagnostics(coefficients, candidates);
      if (!best || check.coefficientError + check.residual < best.check.coefficientError + best.check.residual) best = { roots: candidates, check };
      if (check.residual < 2e-11 && check.coefficientError < 2e-9) break;
    }
    roots = best.roots;
  }
  roots.push(...Array.from({ length: zeros }, () => ({ re: 0, im: 0 })));
  const check = diagnostics(full, roots);
  const converged = roots.length === full.length - 1 && roots.every(z => Number.isFinite(z.re) && Number.isFinite(z.im)) && check.residual < 2e-11 && check.coefficientError < 2e-9;
  return { roots: roots.map(z => ({ ...z, radius: abs(z) })), converged, ...check, iterations };
}

/**
 * Isolate distinct real roots using derivative monotonic partitions. Repeated
 * roots are recognized to coefficient/Horner roundoff; root separations below
 * that numerical resolution cannot be distinguished from a repeated root.
 */
export function realRootsInInterval(input, left, right) {
  let coefficients = [...input];
  while (coefficients.length > 1 && coefficients[0] === 0) coefficients.shift();
  const scale = Math.max(...coefficients.map(Math.abs));
  if (!scale || coefficients.length === 1) return [];
  coefficients = coefficients.map(c => c / scale);
  const degree = coefficients.length - 1;
  if (degree === 1) { const root = -coefficients[1] / coefficients[0]; return root >= left && root <= right ? [root] : []; }
  const derivative = coefficients.slice(0, -1).map((c, i) => c * (degree - i));
  const critical = realRootsInInterval(derivative, left, right);
  const partitions = [left, ...critical.filter(x => x > left && x < right), right];
  const isRoundoffZero = (value, x) => {
    const magnitudeBound = coefficients.reduce((sum, c) => sum * Math.abs(x) + Math.abs(c), 0);
    return Math.abs(value) <= (2 * degree + 1) * Number.EPSILON * magnitudeBound;
  };
  const roots = [];
  for (let i = 0; i < partitions.length - 1; i++) {
    let lo = partitions[i], hi = partitions[i + 1];
    let flo = evaluatePolynomial(coefficients, lo), fhi = evaluatePolynomial(coefficients, hi);
    const leftRoot = isRoundoffZero(flo, lo), rightRoot = isRoundoffZero(fhi, hi);
    if (leftRoot) roots.push(lo);
    if (rightRoot) roots.push(hi);
    // A monotone partition with a root at its endpoint has no interior root.
    // Bisecting against a rounded zero would manufacture extra nearby roots.
    if (leftRoot || rightRoot) continue;
    if (Math.sign(flo) === Math.sign(fhi)) continue;
    for (let n = 0; n < 80; n++) {
      const mid = (lo + hi) / 2, fm = evaluatePolynomial(coefficients, mid);
      if (mid === lo || mid === hi) break;
      if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; } else { hi = mid; fhi = fm; }
    }
    roots.push((lo + hi) / 2);
  }
  // Shared partition endpoints are identical values; an absolute distance
  // threshold would incorrectly merge distinct small-magnitude roots.
  return roots.sort((a, b) => a - b).filter((x, i, all) => !i || x !== all[i - 1]);
}
