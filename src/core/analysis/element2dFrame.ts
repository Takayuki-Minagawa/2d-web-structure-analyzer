import type { IndexedMember } from '../model/types';

/**
 * Build 6x6 local stiffness matrix for a 2D frame element.
 * DOF order: [uix, uiy, rzi, ujx, ujy, rzj]
 */
export function buildLocalStiffness(
  member: IndexedMember
): Float64Array {
  const { E, A, I, L } = member;
  const k = new Float64Array(36); // 6x6 row-major

  const EA_L = (E * A) / L;
  const EI_L3 = (E * I) / (L * L * L);
  const EI_L2 = (E * I) / (L * L);
  const EI_L = (E * I) / L;

  // Row 0: [EA/L, 0, 0, -EA/L, 0, 0]
  k[0] = EA_L;
  k[3] = -EA_L;

  // Row 1: [0, 12EI/L^3, 6EI/L^2, 0, -12EI/L^3, 6EI/L^2]
  k[7] = 12 * EI_L3;
  k[8] = 6 * EI_L2;
  k[10] = -12 * EI_L3;
  k[11] = 6 * EI_L2;

  // Row 2: [0, 6EI/L^2, 4EI/L, 0, -6EI/L^2, 2EI/L]
  k[13] = 6 * EI_L2;
  k[14] = 4 * EI_L;
  k[16] = -6 * EI_L2;
  k[17] = 2 * EI_L;

  // Row 3: [-EA/L, 0, 0, EA/L, 0, 0]
  k[18] = -EA_L;
  k[21] = EA_L;

  // Row 4: [0, -12EI/L^3, -6EI/L^2, 0, 12EI/L^3, -6EI/L^2]
  k[25] = -12 * EI_L3;
  k[26] = -6 * EI_L2;
  k[28] = 12 * EI_L3;
  k[29] = -6 * EI_L2;

  // Row 5: [0, 6EI/L^2, 2EI/L, 0, -6EI/L^2, 4EI/L]
  k[31] = 6 * EI_L2;
  k[32] = 2 * EI_L;
  k[34] = -6 * EI_L2;
  k[35] = 4 * EI_L;

  return k;
}
