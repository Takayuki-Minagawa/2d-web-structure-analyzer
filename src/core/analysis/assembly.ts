import type { IndexedModel } from '../model/types';
import { buildLocalStiffness } from './element2dFrame';
import { buildTransformationMatrix, transformToGlobal } from './transforms';

/**
 * Assemble global stiffness matrix from all element contributions.
 * Returns a dense symmetric matrix stored as Float64Array (row-major, full).
 */
export function assembleGlobalStiffness(model: IndexedModel): Float64Array {
  const n = model.dofCount;
  const K = new Float64Array(n * n);

  for (const member of model.members) {
    const kLocal = buildLocalStiffness(member);
    const T = buildTransformationMatrix(member);
    const kGlobal = transformToGlobal(kLocal, T);

    // DOF mapping: member's 6 DOFs -> global DOF indices
    const dofs = getMemberDofs(member.ni, member.nj);

    // Scatter into global matrix
    for (let i = 0; i < 6; i++) {
      const gi = dofs[i]!;
      for (let j = 0; j < 6; j++) {
        const gj = dofs[j]!;
        K[gi * n + gj]! += kGlobal[i * 6 + j]!;
      }
    }
  }

  return K;
}

/**
 * Get global DOF indices for a member given its node indices.
 * DOF order per node: [ux, uy, rz]
 */
export function getMemberDofs(ni: number, nj: number): [number, number, number, number, number, number] {
  return [
    ni * 3,     // uix
    ni * 3 + 1, // uiy
    ni * 3 + 2, // rzi
    nj * 3,     // ujx
    nj * 3 + 1, // ujy
    nj * 3 + 2, // rzj
  ];
}
