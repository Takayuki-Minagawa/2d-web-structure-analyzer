import type { IndexedModel, IndexedMember, MemberLoad } from '../model/types';
import { buildLocalStiffness } from './element2dFrame';
import { buildTransformationMatrix, transformVectorToLocal } from './transforms';
import { computeMemberLoadFixedEndForces } from './loads';
import { getMemberDofs } from './assembly';

/**
 * Compute reactions: R = K_full * d - F_full
 */
export function computeReactions(
  K: Float64Array,
  d: Float64Array,
  F: Float64Array,
  n: number,
  fixedDofs: number[]
): Float64Array {
  const R = new Float64Array(n);

  for (const fi of fixedDofs) {
    let kd = 0;
    for (let j = 0; j < n; j++) {
      kd += K[fi * n + j]! * d[j]!;
    }
    R[fi] = kd - F[fi]!;
  }

  return R;
}

/**
 * Compute element end forces in local coordinates for a single member.
 * q_end_local = k_local * d_local - f_member_load_local
 *
 * Sign convention: positive axial = tension
 */
export function computeElementEndForces(
  member: IndexedMember,
  globalDisplacements: Float64Array,
  memberLoads: MemberLoad[]
): Float64Array {
  const kLocal = buildLocalStiffness(member);
  const T = buildTransformationMatrix(member);

  // Extract element global displacements
  const dofs = getMemberDofs(member.ni, member.nj);
  const dGlobal = new Float64Array(6);
  for (let i = 0; i < 6; i++) {
    dGlobal[i] = globalDisplacements[dofs[i]!]!;
  }

  // Transform to local
  const dLocal = transformVectorToLocal(dGlobal, T);

  // k_local * d_local
  const kd = new Float64Array(6);
  for (let i = 0; i < 6; i++) {
    let sum = 0;
    for (let j = 0; j < 6; j++) {
      sum += kLocal[i * 6 + j]! * dLocal[j]!;
    }
    kd[i] = sum;
  }

  // Subtract fixed-end forces from member loads
  const fMemberLocal = new Float64Array(6);
  for (const ml of memberLoads) {
    const fLocal = computeMemberLoadFixedEndForces(member, ml);
    for (let i = 0; i < 6; i++) {
      fMemberLocal[i]! += fLocal[i]!;
    }
  }

  const endForces = new Float64Array(6);
  for (let i = 0; i < 6; i++) {
    endForces[i] = kd[i]! - fMemberLocal[i]!;
  }

  return endForces;
}

/**
 * Compute all element end forces for the model.
 */
export function computeAllElementEndForces(
  model: IndexedModel,
  globalDisplacements: Float64Array
): Map<string, Float64Array> {
  const result = new Map<string, Float64Array>();

  for (const member of model.members) {
    const memberLoads = model.memberLoads.filter(
      (ml) => ml.memberId === member.id
    );
    const endForces = computeElementEndForces(
      member,
      globalDisplacements,
      memberLoads
    );
    result.set(member.id, endForces);
  }

  return result;
}
