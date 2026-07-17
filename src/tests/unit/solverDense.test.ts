import { describe, expect, it } from 'vitest';
import {
  SingularMatrixError,
  factorLDLt,
  solveLDLt,
  solveLDLtMultiple,
} from '../../core/analysis/solverDense';

function captureSingularError(run: () => unknown): SingularMatrixError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(SingularMatrixError);
    return error as SingularMatrixError;
  }
  throw new Error('Expected solveLDLt to throw');
}

describe('solveLDLt', () => {
  it('solves a known symmetric positive-definite system', () => {
    const solution = solveLDLt(
      new Float64Array([4, 2, 2, 3]),
      new Float64Array([8, 8]),
      2
    );

    expect(solution[0]).toBeCloseTo(1, 12);
    expect(solution[1]).toBeCloseTo(2, 12);
  });

  it('reuses one factorization for multiple right-hand sides', () => {
    const factorization = factorLDLt(new Float64Array([4, 2, 2, 3]), 2);
    const [first, second] = solveLDLtMultiple(factorization, [
      new Float64Array([8, 8]),
      new Float64Array([2, 7]),
    ]);

    expect(Array.from(first!)).toEqual([1, 2]);
    expect(second![0]).toBeCloseTo(-1, 12);
    expect(second![1]).toBeCloseTo(3, 12);
  });

  it.each([1e-18, 1, 1e18])(
    'uses a scale-relative pivot tolerance (scale=%s)',
    (scale) => {
      const solution = solveLDLt(
        new Float64Array([2 * scale, 0, 0, 3 * scale]),
        new Float64Array([4 * scale, 9 * scale]),
        2
      );

      expect(solution[0]).toBeCloseTo(2, 12);
      expect(solution[1]).toBeCloseTo(3, 12);
    }
  );

  it('rejects a pivot that is small relative to the maximum diagonal', () => {
    const error = captureSingularError(() => solveLDLt(
      new Float64Array([1, 0, 0, 1e-13]),
      new Float64Array([1, 1]),
      2
    ));

    expect(error.reason).toBe('near-singular');
    expect(error.pivotIndex).toBe(1);
    expect(error.pivotTolerance).toBeCloseTo(1e-12, 18);
  });

  it('reports a negative pivot as an indefinite system', () => {
    const error = captureSingularError(() => solveLDLt(
      new Float64Array([2, 0, 0, -1]),
      new Float64Array([1, 1]),
      2
    ));

    expect(error.reason).toBe('negative-pivot');
    expect(error.pivotIndex).toBe(1);
    expect(error.pivotValue).toBe(-1);
    expect(error.message).toContain('負のピボット');
    expect(error.message).toContain('不定');
  });
});
