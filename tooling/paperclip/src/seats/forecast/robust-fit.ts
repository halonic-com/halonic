/**
 * A robust linear fit through the origin with coefficients of zero or more:
 * `y ≈ x · b`. Robust means a few odd steps (a reading that lagged, someone
 * using the seat by hand) can't pull the fit far: residuals beyond 1.345
 * spreads count less and less (Huber weights, refitted until they settle).
 * Small enough to read, so no maths library is needed.
 */

export interface Observation {
  readonly x: readonly number[];
  readonly y: number;
}

export interface FitResult {
  /** One coefficient per column of `x`, never below 0. */
  readonly coefficients: readonly number[];
  /** The middle absolute residual, in units of `y`. */
  readonly medianAbsResidual: number;
  /** Share of the spread of `y` the fit explains: 1 is perfect, 0 or less is no better than the mean. */
  readonly rSquared: number;
}

/** Huber's tuning constant: 95% as efficient as least squares when the noise is normal. */
const huberK = 1.345;
/** Turns a median absolute deviation into a standard deviation for normal noise. */
const madToSigma = 1.4826;
const maxRounds = 30;
const settled = 1e-9;

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) {
    return Number.NaN;
  }
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? Number.NaN;
  return sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] ?? upper) + upper) / 2;
}

function dot(a: readonly number[], b: readonly number[]): number {
  return a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
}

/** The row from `column` down with the largest value in that column. */
function pivotRowFor(rows: readonly number[][], column: number): number {
  let pivot = column;
  for (let row = column + 1; row < rows.length; row += 1) {
    if (Math.abs(rows[row]?.[column] ?? 0) > Math.abs(rows[pivot]?.[column] ?? 0)) {
      pivot = row;
    }
  }
  return pivot;
}

/** Subtracts a multiple of `pivotRow` from `target` so its value in `column` becomes 0. */
function eliminate(target: number[], pivotRow: readonly number[], column: number): void {
  const factor = (target[column] ?? 0) / (pivotRow[column] ?? 1);
  for (let k = column; k < target.length; k += 1) {
    target[k] = (target[k] ?? 0) - factor * (pivotRow[k] ?? 0);
  }
}

/**
 * Solves `a · b = rhs` by Gauss-Jordan elimination with partial pivoting.
 * Returns `undefined` when the system is singular (a column with no data).
 */
export function solve(
  a: readonly (readonly number[])[],
  rhs: readonly number[],
): number[] | undefined {
  const size = rhs.length;
  const rows = a.map((row, index) => [...row, rhs[index] ?? 0]);
  for (let column = 0; column < size; column += 1) {
    const pivot = pivotRowFor(rows, column);
    const pivotRow = rows[pivot];
    if (pivotRow === undefined || Math.abs(pivotRow[column] ?? 0) < 1e-12) {
      return undefined;
    }
    rows[pivot] = rows[column] ?? pivotRow;
    rows[column] = pivotRow;
    rows.forEach((target, row) => {
      if (row !== column) {
        eliminate(target, pivotRow, column);
      }
    });
  }
  return rows.map((row, index) => (row[size] ?? 0) / (row[index] ?? 1));
}

/** Weighted least squares on the `free` columns only; the others stay 0. */
function weightedFit(
  data: readonly Observation[],
  weights: readonly number[],
  free: readonly number[],
  columns: number,
): number[] | undefined {
  const normal = free.map((i) =>
    free.map((j) =>
      data.reduce((sum, o, n) => sum + (weights[n] ?? 0) * (o.x[i] ?? 0) * (o.x[j] ?? 0), 0),
    ),
  );
  const rhs = free.map((i) =>
    data.reduce((sum, o, n) => sum + (weights[n] ?? 0) * (o.x[i] ?? 0) * o.y, 0),
  );
  const solved = solve(normal, rhs);
  if (solved === undefined) {
    return undefined;
  }
  const coefficients = new Array<number>(columns).fill(0);
  free.forEach((column, index) => {
    coefficients[column] = solved[index] ?? 0;
  });
  return coefficients;
}

/**
 * Least squares with every coefficient at 0 or more: a column whose
 * coefficient comes out below 0 (or that has no data) is held at 0 and the
 * rest refitted, most negative first.
 */
function nonNegativeFit(
  data: readonly Observation[],
  weights: readonly number[],
  columns: number,
): number[] {
  let free = Array.from({ length: columns }, (_, index) => index);
  while (free.length > 0) {
    const fitted = weightedFit(data, weights, free, columns);
    if (fitted === undefined) {
      // Singular: hold columns with no data at 0, or else the last one (it moves with another).
      const withData = free.filter((column) => data.some((o) => (o.x[column] ?? 0) !== 0));
      free = withData.length < free.length ? withData : free.slice(0, -1);
      continue;
    }
    const mostNegative = free.reduce((worst, column) =>
      (fitted[column] ?? 0) < (fitted[worst] ?? 0) ? column : worst,
    );
    if ((fitted[mostNegative] ?? 0) >= 0) {
      return fitted;
    }
    free = free.filter((column) => column !== mostNegative);
  }
  return new Array<number>(columns).fill(0);
}

function residuals(data: readonly Observation[], coefficients: readonly number[]): number[] {
  return data.map((o) => o.y - dot(o.x, coefficients));
}

export function robustFit(data: readonly Observation[], columns: number): FitResult {
  let weights = data.map(() => 1);
  let coefficients = nonNegativeFit(data, weights, columns);
  for (let round = 0; round < maxRounds; round += 1) {
    const spread = madToSigma * median(residuals(data, coefficients).map(Math.abs));
    if (!(spread > 0)) {
      break;
    }
    weights = residuals(data, coefficients).map((r) => {
      const scaled = Math.abs(r) / (huberK * spread);
      return scaled <= 1 ? 1 : 1 / scaled;
    });
    const next = nonNegativeFit(data, weights, columns);
    const change = next.reduce(
      (sum, value, index) => sum + Math.abs(value - (coefficients[index] ?? 0)),
      0,
    );
    coefficients = next;
    if (change < settled) {
      break;
    }
  }
  const final = residuals(data, coefficients);
  const meanY = data.reduce((sum, o) => sum + o.y, 0) / Math.max(data.length, 1);
  const total = data.reduce((sum, o) => sum + (o.y - meanY) ** 2, 0);
  const left = final.reduce((sum, r) => sum + r * r, 0);
  return {
    coefficients,
    medianAbsResidual: data.length === 0 ? Number.NaN : median(final.map(Math.abs)),
    rSquared: total > 0 ? 1 - left / total : Number.NaN,
  };
}
