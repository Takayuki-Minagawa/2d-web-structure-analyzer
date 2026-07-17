export type LDLtFailureReason = 'near-singular' | 'negative-pivot' | 'non-finite';

export class SingularMatrixError extends Error {
  readonly pivotIndex: number;
  readonly pivotValue: number;
  readonly pivotTolerance: number;
  readonly reason: LDLtFailureReason;

  constructor(
    message: string,
    pivotIndex: number,
    pivotValue: number,
    reason: LDLtFailureReason = 'near-singular',
    pivotTolerance = 0
  ) {
    super(message);
    this.name = 'SingularMatrixError';
    this.pivotIndex = pivotIndex;
    this.pivotValue = pivotValue;
    this.reason = reason;
    this.pivotTolerance = pivotTolerance;
  }
}

export const DEFAULT_RELATIVE_PIVOT_TOLERANCE = 1e-12;

export interface LDLtFactorization {
  readonly factors: Float64Array;
  readonly n: number;
  readonly pivotTolerance: number;
}

/**
 * Factor a symmetric positive-definite matrix in-place as L D Lᵀ. The lower
 * triangle stores unit-lower L (without its implicit unit diagonal) and the
 * diagonal stores D. Reuse the returned object for any number of right-hand
 * sides with `solveLDLtWithFactor`.
 */
export function factorLDLt(
  A: Float64Array,
  n: number,
  relativePivotTolerance = DEFAULT_RELATIVE_PIVOT_TOLERANCE
): LDLtFactorization {
  if (!Number.isInteger(n) || n < 0 || A.length < n * n) {
    throw new RangeError('LDLᵀ factorization dimensions are inconsistent.');
  }
  if (!Number.isFinite(relativePivotTolerance) || relativePivotTolerance < 0) {
    throw new RangeError('LDLᵀ relative pivot tolerance must be a finite non-negative value.');
  }

  let maxAbsDiagonal = 0;
  for (let index = 0; index < n; index++) {
    const diagonal = A[index * n + index]!;
    if (!Number.isFinite(diagonal)) {
      throw new SingularMatrixError(
        `剛性マトリクスの対角成分 ${index} が有限値ではありません (${diagonal})。`,
        index,
        diagonal,
        'non-finite'
      );
    }
    maxAbsDiagonal = Math.max(maxAbsDiagonal, Math.abs(diagonal));
  }
  const pivotTolerance = maxAbsDiagonal * relativePivotTolerance;

  for (let j = 0; j < n; j++) {
    // Compute D[j]
    let dj = A[j * n + j]!;
    for (let k = 0; k < j; k++) {
      const ljk = A[j * n + k]!;
      dj -= ljk * ljk * A[k * n + k]!;
    }

    if (!Number.isFinite(dj)) {
      throw new SingularMatrixError(
        `剛性マトリクスのピボット ${j} が有限値ではありません (${dj})。`,
        j,
        dj,
        'non-finite',
        pivotTolerance
      );
    }
    if (dj < 0) {
      throw new SingularMatrixError(
        `剛性マトリクスが不定です（負のピボット ${j} = ${dj.toExponential(3)}）。剛性・解放・拘束条件を確認してください。`,
        j,
        dj,
        'negative-pivot',
        pivotTolerance
      );
    }
    if (dj <= pivotTolerance) {
      throw new SingularMatrixError(
        `剛性マトリクスが特異または準特異です（ピボット ${j} = ${dj.toExponential(3)}、相対許容値 = ${pivotTolerance.toExponential(3)}）。拘束条件を確認してください。`,
        j,
        dj,
        'near-singular',
        pivotTolerance
      );
    }

    A[j * n + j] = dj;

    // Compute L[i][j] for i > j
    for (let i = j + 1; i < n; i++) {
      let lij = A[i * n + j]!;
      for (let k = 0; k < j; k++) {
        lij -= A[i * n + k]! * A[j * n + k]! * A[k * n + k]!;
      }
      A[i * n + j] = lij / dj;
    }
  }

  return { factors: A, n, pivotTolerance };
}

/** Solve one right-hand side using a previously computed L D Lᵀ factorization. */
export function solveLDLtWithFactor(
  factorization: LDLtFactorization,
  b: Float64Array
): Float64Array {
  const { factors: A, n } = factorization;
  if (b.length < n) {
    throw new RangeError('LDLᵀ right-hand-side dimensions are inconsistent.');
  }

  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = b[i]!;
    for (let j = 0; j < i; j++) {
      sum -= A[i * n + j]! * y[j]!;
    }
    y[i] = sum;
  }

  // Diagonal solve: D z = y
  const z = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    z[i] = y[i]! / A[i * n + i]!;
  }

  // Back substitution: Lᵀ x = z
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = z[i]!;
    for (let j = i + 1; j < n; j++) {
      sum -= A[j * n + i]! * x[j]!; // Lᵀ[i][j] = L[j][i]
    }
    x[i] = sum;
  }

  return x;
}

/** Solve multiple right-hand sides without repeating the factorization. */
export function solveLDLtMultiple(
  factorization: LDLtFactorization,
  rightHandSides: readonly Float64Array[]
): Float64Array[] {
  return rightHandSides.map((rightHandSide) =>
    solveLDLtWithFactor(factorization, rightHandSide)
  );
}

/**
 * Backward-compatible one-shot solve. The matrix is modified in-place during
 * factorization, matching the original `solveLDLt` contract.
 */
export function solveLDLt(
  A: Float64Array,
  b: Float64Array,
  n: number,
  relativePivotTolerance = DEFAULT_RELATIVE_PIVOT_TOLERANCE
): Float64Array {
  const factorization = factorLDLt(A, n, relativePivotTolerance);
  return solveLDLtWithFactor(factorization, b);
}
