import type {
  IndexedModel,
  IndexedMember,
  MemberLoad,
  CMQMemberLoad,
  DiagramSeries,
  DiagramPoint,
} from '../model/types';
import { buildTransformationMatrix, transformVectorToLocal } from './transforms';
import { getMemberDofs } from './assembly';
import { computePhiY, computePhiZ } from './element3dFrame';
import {
  computeCMQMomentDiagramCorrection,
  groupMemberLoadsByMember,
  resolveDistributedLoadLocalComponents,
  resolvePointLoadLocalComponents,
} from './loads';
import { timoshenkoShapeFunctions } from './timoshenko';

const NUM_SAMPLE_POINTS = 51;

/**
 * Generate section force diagrams for a single 3D member.
 *
 * End forces (local):
 *   [Nxi, Vyi, Vzi, Mxi, Myi, Mzi, Nxj, Vyj, Vzj, Mxj, Myj, Mzj]
 */
export function generateDiagram(
  member: IndexedMember,
  endForces: Float64Array,
  memberLoads: MemberLoad[],
  globalDisplacements: Float64Array,
  gravity: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }
): DiagramSeries {
  const { L, id } = member;
  const phiY = computePhiY(member);
  const phiZ = computePhiZ(member);

  // End forces
  const Nxi = endForces[0]!;
  const Vyi = endForces[1]!;
  const Vzi = endForces[2]!;
  const Mxi = endForces[3]!;
  const Myi = endForces[4]!;
  const Mzi = endForces[5]!;

  // Extract local displacements
  const T = member.transformation ?? buildTransformationMatrix(member);
  const dofs = getMemberDofs(member.ni, member.nj);
  const dGlobal = new Float64Array(12);
  for (let i = 0; i < 12; i++) {
    dGlobal[i] = globalDisplacements[dofs[i]!]!;
  }
  const dLocal = transformVectorToLocal(dGlobal, T);
  // dLocal = [uxi, uyi, uzi, rxi, ryi, rzi, uxj, uyj, uzj, rxj, ryj, rzj]

  // Collect sample positions
  const sampleSet = new Set<number>();
  for (let i = 0; i <= NUM_SAMPLE_POINTS; i++) {
    sampleSet.add((i / NUM_SAMPLE_POINTS) * L);
  }
  sampleSet.add(L / 2);

  // Add point load positions
  for (const ml of memberLoads) {
    if (ml.type === 'point') {
      sampleSet.add(ml.a);
      sampleSet.add(Math.max(0, ml.a - 1e-8));
      sampleSet.add(Math.min(L, ml.a + 1e-8));
    }
  }

  sampleSet.add(0);
  sampleSet.add(L);

  const positions = Array.from(sampleSet)
    .filter((x) => x >= 0 && x <= L)
    .sort((a, b) => a - b);

  // Resolve global/self-weight loads once, then integrate local components.
  const axialUDLs: number[] = [];
  const yUDLs: number[] = [];
  const zUDLs: number[] = [];
  const axialPoints: Array<{ a: number; value: number }> = [];
  const yPoints: Array<{ a: number; value: number }> = [];
  const zPoints: Array<{ a: number; value: number }> = [];
  for (const load of memberLoads) {
    if (load.type === 'udl' || load.type === 'selfWeight') {
      const component = resolveDistributedLoadLocalComponents(member, load, gravity);
      if (component.x !== 0) axialUDLs.push(component.x);
      if (component.y !== 0) yUDLs.push(component.y);
      if (component.z !== 0) zUDLs.push(component.z);
    } else if (load.type === 'point') {
      const component = resolvePointLoadLocalComponents(member, load);
      if (component.x !== 0) axialPoints.push({ a: load.a, value: component.x });
      if (component.y !== 0) yPoints.push({ a: load.a, value: component.y });
      if (component.z !== 0) zPoints.push({ a: load.a, value: component.z });
    }
  }
  const cmqLoads = memberLoads.filter((ml): ml is CMQMemberLoad => ml.type === 'cmq');

  const points: DiagramPoint[] = positions.map((x) => {
    // Axial force
    let N = Nxi;
    for (const udl of axialUDLs) {
      N += udl * x;
    }
    for (const pl of axialPoints) {
      if (x >= pl.a) N += pl.value;
    }

    // Shear Vy
    let Vy = Vyi;
    for (const udl of yUDLs) {
      Vy += udl * x;
    }
    for (const pl of yPoints) {
      if (x >= pl.a) Vy += pl.value;
    }

    // Shear Vz
    let Vz = Vzi;
    for (const udl of zUDLs) {
      Vz += udl * x;
    }
    for (const pl of zPoints) {
      if (x >= pl.a) Vz += pl.value;
    }

    // Torsion Mx (constant if no distributed torque)
    const Mx = Mxi;

    // Bending My (XZ plane): My(x) = Myi + Vzi*x + ...
    let My = Myi + Vzi * x;
    for (const udl of zUDLs) {
      My += (udl * x * x) / 2;
    }
    for (const pl of zPoints) {
      if (x >= pl.a) My += pl.value * (x - pl.a);
    }
    for (const cmq of cmqLoads) {
      My += computeCMQMomentDiagramCorrection(cmq, x, L).My;
    }

    // Bending Mz (XY plane): Mz(x) = Mzi - Vyi*x - ...
    let Mz = Mzi - Vyi * x;
    for (const udl of yUDLs) {
      Mz -= (udl * x * x) / 2;
    }
    for (const pl of yPoints) {
      if (x >= pl.a) Mz -= pl.value * (x - pl.a);
    }
    for (const cmq of cmqLoads) {
      Mz += computeCMQMomentDiagramCorrection(cmq, x, L).Mz;
    }

    // Displacement interpolation
    const xi = L > 0 ? x / L : 0;

    // Axial: linear
    const ux = dLocal[0]! * (1 - xi) + dLocal[6]! * xi;

    // Transverse Y: Timoshenko with phi_z, DOFs 1(uyi),5(rzi),7(uyj),11(rzj)
    const [h1z, h2z, h3z, h4z] = timoshenkoShapeFunctions(xi, L, phiZ);
    const uy = dLocal[1]! * h1z + dLocal[5]! * h2z +
               dLocal[7]! * h3z + dLocal[11]! * h4z;

    // Transverse Z: Timoshenko with phi_y, DOFs 2(uzi),4(ryi),8(uzj),10(ryj)
    // Note: rotation coupling sign is accounted for in the shape function signs
    const [h1y, h2y, h3y, h4y] = timoshenkoShapeFunctions(xi, L, phiY);
    const uz = dLocal[2]! * h1y + (-dLocal[4]!) * h2y +
               dLocal[8]! * h3y + (-dLocal[10]!) * h4y;

    return { x, N, Vy, Vz, Mx, My, Mz, ux, uy, uz };
  });

  return { memberId: id, points };
}

/**
 * Generate diagrams for all members.
 */
export function generateAllDiagrams(
  model: IndexedModel,
  elementEndForces: Map<string, Float64Array>,
  globalDisplacements: Float64Array,
  memberLoadsByMember = groupMemberLoadsByMember(model.memberLoads)
): Map<string, DiagramSeries> {
  const diagrams = new Map<string, DiagramSeries>();

  for (const member of model.members) {
    const endForces = elementEndForces.get(member.id);
    if (!endForces) continue;

    const memberLoads = memberLoadsByMember.get(member.id) ?? [];
    const diagram = generateDiagram(
      member,
      endForces,
      memberLoads,
      globalDisplacements,
      model.gravity
    );
    diagrams.set(member.id, diagram);
  }

  return diagrams;
}
