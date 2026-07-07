import { describe, it, expect } from 'vitest';
import {
  matMul,
  transpose,
  invSPD,
  ols,
  hc0SE,
  hc3SE,
  clusterRobustSE,
  fitOLSCluster,
  normalTwoSidedP,
} from './ols';

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

describe('algèbre linéaire', () => {
  it('transpose', () => {
    expect(transpose([[1, 2, 3], [4, 5, 6]])).toEqual([[1, 4], [2, 5], [3, 6]]);
  });

  it('matMul', () => {
    expect(matMul([[1, 2], [3, 4]], [[5, 6], [7, 8]])).toEqual([[19, 22], [43, 50]]);
  });

  it('invSPD — diagonale', () => {
    const inv = invSPD([[4, 0], [0, 9]]);
    expect(close(inv[0][0], 0.25)).toBe(true);
    expect(close(inv[1][1], 1 / 9)).toBe(true);
    expect(close(inv[0][1], 0)).toBe(true);
  });

  it('invSPD — 2x2 SPD non diagonale', () => {
    const inv = invSPD([[2, 1], [1, 2]]); // inverse = [[2/3,-1/3],[-1/3,2/3]]
    expect(close(inv[0][0], 2 / 3)).toBe(true);
    expect(close(inv[0][1], -1 / 3)).toBe(true);
    expect(close(inv[1][1], 2 / 3)).toBe(true);
  });
});

describe('OLS — récupération exacte', () => {
  it('y = 1 + 2x récupéré exactement (intercept + pente)', () => {
    const X = [[1, 0], [1, 1], [1, 2], [1, 3]];
    const y = [1, 3, 5, 7];
    const { beta } = ols(X, y);
    expect(close(beta[0], 1, 1e-7)).toBe(true);
    expect(close(beta[1], 2, 1e-7)).toBe(true);
  });

  it('régression à 2 prédicteurs : y = 1 + 2a + 3b exact', () => {
    // a, b indépendants → solution exacte
    const rows = [
      [0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [1, 2],
    ];
    const X = rows.map(([a, b]) => [1, a, b]);
    const y = rows.map(([a, b]) => 1 + 2 * a + 3 * b);
    const { beta } = ols(X, y);
    expect(close(beta[0], 1, 1e-6)).toBe(true);
    expect(close(beta[1], 2, 1e-6)).toBe(true);
    expect(close(beta[2], 3, 1e-6)).toBe(true);
  });
});

describe('erreurs-standards', () => {
  it('cluster-robust avec clusters singletons == HC0 (cross-check sandwich)', () => {
    const X = [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]];
    const y = [1, 1, 4, 3, 6]; // bruité → résidus non nuls
    const fit = ols(X, y);
    const hc0 = hc0SE(X, fit.residuals, fit.XtXinv);
    // chaque obs = son propre cluster, sans correction finite-sample
    const clusters = [0, 1, 2, 3, 4];
    const cr = clusterRobustSE(X, fit.residuals, fit.XtXinv, clusters, false);
    for (let j = 0; j < hc0.length; j++) {
      expect(close(cr[j], hc0[j], 1e-9)).toBe(true);
    }
  });

  it('HC3 ≥ HC0 (pondération par levier) et reste fini/positif', () => {
    const X = [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5]];
    const y = [2, 1, 4, 3, 6, 5];
    const fit = ols(X, y);
    const hc0 = hc0SE(X, fit.residuals, fit.XtXinv);
    const hc3 = hc3SE(X, fit.residuals, fit.XtXinv);
    for (let j = 0; j < hc0.length; j++) {
      expect(hc3[j]).toBeGreaterThan(0);
      expect(Number.isFinite(hc3[j])).toBe(true);
      expect(hc3[j]).toBeGreaterThanOrEqual(hc0[j] - 1e-12);
    }
  });

  it('fitOLSCluster renvoie se>0, t et p cohérents', () => {
    const X = [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5]];
    const y = [2, 3, 5, 6, 8, 9];
    const clusters = [0, 0, 1, 1, 2, 2];
    const res = fitOLSCluster(X, y, clusters, 0.99);
    expect(res.length).toBe(2);
    for (const c of res) {
      expect(c.se).toBeGreaterThan(0);
      expect(Number.isFinite(c.t)).toBe(true);
      expect(c.p).toBeGreaterThanOrEqual(0);
      expect(c.p).toBeLessThanOrEqual(1);
      expect(c.ciLow).toBeLessThan(c.ciHigh);
    }
  });
});

describe('p-value normale bilatérale', () => {
  it('t=0 → p=1 ; t=1.96 → p≈0.05 ; t=2.576 → p≈0.01', () => {
    expect(close(normalTwoSidedP(0), 1, 1e-6)).toBe(true);
    expect(close(normalTwoSidedP(1.959964), 0.05, 1e-3)).toBe(true);
    expect(close(normalTwoSidedP(2.575829), 0.01, 1e-3)).toBe(true);
  });
});
