import test from 'node:test';
import assert from 'node:assert/strict';
import { multiplyPolynomial, solvePolynomialRoots, realRootsInInterval } from './polynomial.js';

test('complex polynomial roots preserve multiplicities and exact zero roots', () => {
  const coefficients = [1, 0, 0, 0, 0, 0, 0, 0, -1, 0, 0]; // (z^8-1) z²
  const result = solvePolynomialRoots(coefficients);
  assert.equal(result.converged, true);
  assert.equal(result.roots.length, 10);
  assert.equal(result.roots.filter(p => p.radius === 0).length, 2);
  assert.ok(result.roots.filter(p => p.radius !== 0).every(p => Math.abs(p.radius - 1) < 1e-10));
  assert.ok(result.residual < 1e-12);
  assert.ok(result.coefficientError < 1e-12);
});

test('root solver reproduces an independently constructed degree11 real polynomial', () => {
  let coefficients = [1];
  const realRoots = [-1.8, -0.55, 0.13, 0.7, 0.94];
  for (const root of realRoots) coefficients = multiplyPolynomial(coefficients, [1, -root]);
  for (const [re, im] of [[0.8, 0.1], [-0.5, 0.6], [0.15, 0.9]]) coefficients = multiplyPolynomial(coefficients, [1, -2 * re, re ** 2 + im ** 2]);
  const result = solvePolynomialRoots(coefficients);
  assert.equal(result.converged, true);
  assert.equal(result.roots.length, 11);
  for (const expected of realRoots) assert.ok(result.roots.some(root => Math.abs(root.re - expected) < 1e-9 && Math.abs(root.im) < 1e-9));
  assert.ok(result.coefficientError < 1e-11);
});

test('real root isolation resolves separate narrow crossing intervals', () => {
  let coefficients = [1];
  for (const root of [0.00000002, 0.2, 0.20001, 1.3]) coefficients = multiplyPolynomial(coefficients, [1, -root]);
  const roots = realRootsInInterval(coefficients, 0, 2);
  assert.equal(roots.length, 4);
  for (const [index, expected] of [0.00000002, 0.2, 0.20001, 1.3].entries()) assert.ok(Math.abs(roots[index] - expected) < 1e-8);
});

test('real root isolation reports a repeated root once despite Horner roundoff', () => {
  for (const [coefficients, expected] of [
    [[1, -1.8, 0.81], 0.9], // (x - 0.9)^2, decimal coefficients round in binary.
    [[1, -1, 0.25], 0.5], // Exactly representable repeated root.
  ]) {
    const roots = realRootsInInterval(coefficients, 0, 2);
    assert.equal(roots.length, 1);
    assert.ok(Math.abs(roots[0] - expected) < 1e-12);
  }
});

test('real root isolation preserves resolvable nearby roots at different scales', () => {
  for (const [coefficients, interval, expected, tolerance] of [
    [[1, -0.400001, 0.0400002], [0, 2], [0.2, 0.200001], 1e-9],
    [[1, -3e-15, 2e-30], [0, 1e-14], [1e-15, 2e-15], 1e-28],
  ]) {
    const roots = realRootsInInterval(coefficients, ...interval);
    assert.equal(roots.length, 2);
    roots.forEach((root, i) => assert.ok(Math.abs(root - expected[i]) < tolerance));
  }
});

test('invalid polynomial coefficients fail rather than produce fabricated poles', () => {
  for (const input of [[], [0, 1], [1, NaN], [1, Infinity]]) assert.throws(() => solvePolynomialRoots(input), RangeError);
});
