/**
 * Moteur statistique pur (TS, sans dépendance) pour l'Observatoire.
 *
 * Port du calcul Python (statsmodels) utilisé pour la fiche n°001 :
 * OLS multivarié + effets fixes (via dummies passées dans X) + erreurs-standards
 * clusterisées (sandwich CR1). Validé par tests golden (closed-form + égalité
 * cluster-singletons == HC0).
 *
 * Conventions : X est la matrice de design (n×k), première colonne = intercept
 * si désiré (ajouté par l'appelant). y vecteur (n). clusters : index de cluster
 * par observation (n).
 */

export type Matrix = number[][];
export type Vector = number[];

export function transpose(A: Matrix): Matrix {
  const r = A.length;
  const c = A[0].length;
  const T: Matrix = Array.from({ length: c }, () => new Array<number>(r));
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) T[j][i] = A[i][j];
  return T;
}

export function matMul(A: Matrix, B: Matrix): Matrix {
  const n = A.length;
  const m = B[0].length;
  const p = B.length;
  const C: Matrix = Array.from({ length: n }, () => new Array<number>(m).fill(0));
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < p; k++) {
      const a = A[i][k];
      if (a === 0) continue;
      for (let j = 0; j < m; j++) C[i][j] += a * B[k][j];
    }
  }
  return C;
}

export function matVec(A: Matrix, x: Vector): Vector {
  return A.map((row) => row.reduce((s, v, j) => s + v * x[j], 0));
}

/** Cholesky : A (SPD) = L Lᵀ, L triangulaire inférieure. */
function cholesky(A: Matrix): Matrix {
  const n = A.length;
  const L: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        if (sum <= 0) throw new Error('Matrice non définie positive (colinéarité ?)');
        L[i][i] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }
  return L;
}

/** Résout A x = b avec A SPD (via Cholesky). */
export function solveSPD(A: Matrix, b: Vector): Vector {
  const L = cholesky(A);
  const n = A.length;
  const y = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
    y[i] = s / L[i][i];
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k];
    x[i] = s / L[i][i];
  }
  return x;
}

/** Inverse d'une matrice SPD (résout A·col = e_j pour chaque j). */
export function invSPD(A: Matrix): Matrix {
  const n = A.length;
  const L = cholesky(A);
  const inv: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let j = 0; j < n; j++) {
    const e = new Array<number>(n).fill(0);
    e[j] = 1;
    const y = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      let s = e[i];
      for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
      y[i] = s / L[i][i];
    }
    const x = new Array<number>(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let s = y[i];
      for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k];
      x[i] = s / L[i][i];
    }
    for (let i = 0; i < n; i++) inv[i][j] = x[i];
  }
  return inv;
}

export interface OlsFit {
  beta: Vector;
  residuals: Vector;
  XtXinv: Matrix;
  n: number;
  k: number;
}

/** OLS : β = (XᵀX)⁻¹ Xᵀy. */
export function ols(X: Matrix, y: Vector): OlsFit {
  const Xt = transpose(X);
  const XtX = matMul(Xt, X);
  const Xty = matVec(Xt, y);
  const XtXinv = invSPD(XtX);
  const beta = matVec(XtXinv, Xty);
  const fitted = matVec(X, beta);
  const residuals = y.map((yi, i) => yi - fitted[i]);
  return { beta, residuals, XtXinv, n: X.length, k: X[0].length };
}

/** Covariance HC0 COMPLÈTE : V = (XᵀX)⁻¹ (Σ eᵢ² xᵢxᵢᵀ) (XᵀX)⁻¹. */
export function hc0Cov(X: Matrix, residuals: Vector, XtXinv: Matrix): Matrix {
  const k = X[0].length;
  const meat: Matrix = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let i = 0; i < X.length; i++) {
    const e2 = residuals[i] * residuals[i];
    const xi = X[i];
    for (let a = 0; a < k; a++) {
      const xa = xi[a] * e2;
      if (xa === 0) continue;
      for (let b = 0; b < k; b++) meat[a][b] += xa * xi[b];
    }
  }
  return matMul(matMul(XtXinv, meat), XtXinv);
}

/** SE robustes hétéroscédasticité HC0 (racine de la diagonale de `hc0Cov`). */
export function hc0SE(X: Matrix, residuals: Vector, XtXinv: Matrix): Vector {
  const V = hc0Cov(X, residuals, XtXinv);
  return V.map((_, j) => Math.sqrt(V[j][j]));
}

/**
 * SE robustes HC3 : pondère chaque résidu par 1/(1−hᵢᵢ) où hᵢᵢ est le levier
 * (diagonale du hat). meat = Σ (eᵢ/(1−hᵢᵢ))² xᵢxᵢᵀ. Reproduit cov_type='HC3'
 * de statsmodels (modèle de la fiche n°001). Pour N≫k, hᵢᵢ→0 donc HC3≈HC0.
 */
export function hc3SE(X: Matrix, residuals: Vector, XtXinv: Matrix): Vector {
  const k = X[0].length;
  const meat: Matrix = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let i = 0; i < X.length; i++) {
    const xi = X[i];
    const u = matVec(XtXinv, xi); // (XᵀX)⁻¹ xᵢ
    let h = 0;
    for (let a = 0; a < k; a++) h += xi[a] * u[a];
    const w = residuals[i] / (1 - h);
    const w2 = w * w;
    for (let a = 0; a < k; a++) {
      const xa = xi[a] * w2;
      if (xa === 0) continue;
      for (let b = 0; b < k; b++) meat[a][b] += xa * xi[b];
    }
  }
  const V = matMul(matMul(XtXinv, meat), XtXinv);
  return V.map((_, j) => Math.sqrt(V[j][j]));
}

/**
 * SE clusterisées (sandwich). meat = Σ_g s_g s_gᵀ avec s_g = Σ_{i∈g} xᵢ eᵢ.
 * finiteSample=true applique la correction CR1 : (G/(G-1))·((N-1)/(N-k)).
 * Avec clusters singletons et finiteSample=false → identique à HC0.
 */
export function clusterRobustSE(
  X: Matrix,
  residuals: Vector,
  XtXinv: Matrix,
  clusters: Array<number | string>,
  finiteSample = true,
): Vector {
  const k = X[0].length;
  const N = X.length;
  const groups = new Map<number | string, Vector>();
  for (let i = 0; i < N; i++) {
    const g = clusters[i];
    let s = groups.get(g);
    if (!s) {
      s = new Array<number>(k).fill(0);
      groups.set(g, s);
    }
    const e = residuals[i];
    const xi = X[i];
    for (let a = 0; a < k; a++) s[a] += xi[a] * e;
  }
  const meat: Matrix = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (const s of groups.values()) {
    for (let a = 0; a < k; a++) {
      if (s[a] === 0) continue;
      for (let b = 0; b < k; b++) meat[a][b] += s[a] * s[b];
    }
  }
  const G = groups.size;
  const factor = finiteSample ? (G / (G - 1)) * ((N - 1) / (N - k)) : 1;
  const V = matMul(matMul(XtXinv, meat), XtXinv);
  return V.map((_, j) => Math.sqrt(factor * V[j][j]));
}

// --- Distributions normales ---

function erf(x: number): number {
  // Abramowitz & Stegun 7.1.26 (|erreur| < 1.5e-7)
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

export function normalCDF(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** p-value bilatérale sous approximation normale. */
export function normalTwoSidedP(t: number): number {
  return 2 * (1 - normalCDF(Math.abs(t)));
}

// --- Distribution de Student (p-value exacte, via beta incomplète) ---

function gammaln(x: number): number {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
    0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += cof[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** Fraction continue de Lentz pour la beta incomplète (Numerical Recipes). */
function betacf(a: number, b: number, x: number): number {
  const FPMIN = 1e-300;
  const EPS = 3e-12;
  const MAXIT = 200;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Beta incomplète régularisée I_x(a, b). */
export function regIncBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/**
 * p-value bilatérale exacte d'un t de Student à `df` degrés de liberté :
 * P(|T| > |t|) = I_{df/(df+t²)}(df/2, 1/2). Utilisée par le test de Welch
 * (méthode M3 de l'observatoire par cabinet).
 */
export function studentTTwoSidedP(t: number, df: number): number {
  if (!(df > 0)) return NaN;
  const x = df / (df + t * t);
  return regIncBeta(x, df / 2, 0.5);
}

/**
 * Quantile bilatéral de Student : renvoie t* tel que P(|T| <= t*) = conf, à `df`
 * degrés de liberté (inverse de studentTTwoSidedP), par bissection monotone.
 * Quand df → ∞, tend vers invNorm((1+conf)/2). Sert à bâtir un IC dans la MÊME
 * loi que la p de Welch — sinon l'IC (normal, plus étroit) exclut 0 quand p ≥ α.
 */
export function studentTQuantile(conf: number, df: number): number {
  if (!(df > 0) || !(conf > 0) || !(conf < 1)) return NaN;
  const targetTail = 1 - conf; // P(|T| > t*) visé
  let lo = 0;
  let hi = 1e4;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    // studentTTwoSidedP décroît quand t croît :
    if (studentTTwoSidedP(mid, df) > targetTail) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Quantile normal inverse (Acklam). Pour les bornes d'IC. */
export function invNorm(p: number): number {
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const plow = 0.02425;
  const phigh = 1 - plow;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > phigh) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export interface CoefResult {
  beta: number;
  se: number;
  t: number;
  p: number;
  ciLow: number;
  ciHigh: number;
}

/** Fit OLS + SE clusterisées CR1 + t/p/IC par coefficient. */
export function fitOLSCluster(
  X: Matrix,
  y: Vector,
  clusters: Array<number | string>,
  ciLevel = 0.99,
): CoefResult[] {
  const fit = ols(X, y);
  const se = clusterRobustSE(X, fit.residuals, fit.XtXinv, clusters, true);
  const z = invNorm((1 + ciLevel) / 2);
  return fit.beta.map((b, j) => {
    const t = b / se[j];
    return {
      beta: b,
      se: se[j],
      t,
      p: normalTwoSidedP(t),
      ciLow: b - z * se[j],
      ciHigh: b + z * se[j],
    };
  });
}
