import type { IndexedMember } from '../model/types';

/**
 * Build 6x6 coordinate transformation matrix T.
 * Transforms from global to local: d_local = T * d_global
 *
 * T = [ c  s  0  0  0  0 ]
 *     [-s  c  0  0  0  0 ]
 *     [ 0  0  1  0  0  0 ]
 *     [ 0  0  0  c  s  0 ]
 *     [ 0  0  0 -s  c  0 ]
 *     [ 0  0  0  0  0  1 ]
 */
export function buildTransformationMatrix(
  member: IndexedMember
): Float64Array {
  const c = member.cos;
  const s = member.sin;
  const T = new Float64Array(36);

  // Row 0
  T[0] = c;
  T[1] = s;
  // Row 1
  T[6] = -s;
  T[7] = c;
  // Row 2
  T[14] = 1;
  // Row 3
  T[21] = c;
  T[22] = s;
  // Row 4
  T[27] = -s;
  T[28] = c;
  // Row 5
  T[35] = 1;

  return T;
}

/**
 * Compute k_global = T^T * k_local * T
 * All matrices are 6x6 row-major Float64Array.
 */
export function transformToGlobal(
  kLocal: Float64Array,
  T: Float64Array
): Float64Array {
  const temp = new Float64Array(36); // T^T * k_local
  const kGlobal = new Float64Array(36);

  // temp = T^T * k_local
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      let sum = 0;
      for (let p = 0; p < 6; p++) {
        sum += T[p * 6 + i]! * kLocal[p * 6 + j]!; // T^T[i][p] = T[p][i]
      }
      temp[i * 6 + j] = sum;
    }
  }

  // kGlobal = temp * T
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      let sum = 0;
      for (let p = 0; p < 6; p++) {
        sum += temp[i * 6 + p]! * T[p * 6 + j]!;
      }
      kGlobal[i * 6 + j] = sum;
    }
  }

  return kGlobal;
}

/**
 * Transform a 6-element vector from local to global: f_global = T^T * f_local
 */
export function transformVectorToGlobal(
  fLocal: Float64Array,
  T: Float64Array
): Float64Array {
  const fGlobal = new Float64Array(6);
  for (let i = 0; i < 6; i++) {
    let sum = 0;
    for (let p = 0; p < 6; p++) {
      sum += T[p * 6 + i]! * fLocal[p]!; // T^T[i][p] = T[p][i]
    }
    fGlobal[i] = sum;
  }
  return fGlobal;
}

/**
 * Transform a 6-element vector from global to local: d_local = T * d_global
 */
export function transformVectorToLocal(
  dGlobal: Float64Array,
  T: Float64Array
): Float64Array {
  const dLocal = new Float64Array(6);
  for (let i = 0; i < 6; i++) {
    let sum = 0;
    for (let p = 0; p < 6; p++) {
      sum += T[i * 6 + p]! * dGlobal[p]!;
    }
    dLocal[i] = sum;
  }
  return dLocal;
}
