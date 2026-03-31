import type { IndexedModel } from '../model/types';

/**
 * Identify free (unconstrained) and fixed (constrained) DOF indices.
 */
export function partitionDofs(model: IndexedModel): {
  freeDofs: number[];
  fixedDofs: number[];
} {
  const freeDofs: number[] = [];
  const fixedDofs: number[] = [];

  for (const node of model.nodes) {
    const base = node.index * 3;

    if (node.restraint.ux) {
      fixedDofs.push(base);
    } else {
      freeDofs.push(base);
    }

    if (node.restraint.uy) {
      fixedDofs.push(base + 1);
    } else {
      freeDofs.push(base + 1);
    }

    if (node.restraint.rz) {
      fixedDofs.push(base + 2);
    } else {
      freeDofs.push(base + 2);
    }
  }

  return { freeDofs, fixedDofs };
}

/**
 * Extract the free-DOF submatrix from the full global stiffness matrix.
 */
export function extractFreeSystem(
  K: Float64Array,
  F: Float64Array,
  freeDofs: number[],
  n: number
): { Kff: Float64Array; Ff: Float64Array } {
  const nf = freeDofs.length;
  const Kff = new Float64Array(nf * nf);
  const Ff = new Float64Array(nf);

  for (let i = 0; i < nf; i++) {
    const gi = freeDofs[i]!;
    Ff[i] = F[gi]!;
    for (let j = 0; j < nf; j++) {
      const gj = freeDofs[j]!;
      Kff[i * nf + j] = K[gi * n + gj]!;
    }
  }

  return { Kff, Ff };
}
