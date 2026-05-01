import type { Member, ProjectModel, TorsionRestraintEnd } from './types';

export const DEFAULT_TORSION_RESTRAINT: TorsionRestraintEnd = 'none';
export const AXIS_ALIGNED_TOLERANCE = 1e-9;

export function normalizeTorsionRestraint(value: unknown): TorsionRestraintEnd {
  return value === 'i' || value === 'j' ? value : DEFAULT_TORSION_RESTRAINT;
}

export function getMemberTorsionRestraint(member: Member): TorsionRestraintEnd {
  return normalizeTorsionRestraint(member.torsionRestraint);
}

export function getAxisAlignedRotationDofOffset(
  dx: number,
  dy: number,
  dz: number,
  length: number,
  tolerance = AXIS_ALIGNED_TOLERANCE
): number | null {
  if (length <= tolerance) return null;

  const lx = dx / length;
  const ly = dy / length;
  const lz = dz / length;

  if (Math.abs(Math.abs(lx) - 1) <= tolerance &&
      Math.abs(ly) <= tolerance &&
      Math.abs(lz) <= tolerance) return 3; // global rx
  if (Math.abs(lx) <= tolerance &&
      Math.abs(Math.abs(ly) - 1) <= tolerance &&
      Math.abs(lz) <= tolerance) return 4; // global ry
  if (Math.abs(lx) <= tolerance &&
      Math.abs(ly) <= tolerance &&
      Math.abs(Math.abs(lz) - 1) <= tolerance) return 5; // global rz

  return null;
}

export function getMemberAxisRotationDofOffset(
  model: ProjectModel,
  member: Member
): number | null {
  const ni = model.nodes.find((node) => node.id === member.ni);
  const nj = model.nodes.find((node) => node.id === member.nj);
  if (!ni || !nj) return null;

  const dx = nj.x - ni.x;
  const dy = nj.y - ni.y;
  const dz = nj.z - ni.z;
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return getAxisAlignedRotationDofOffset(dx, dy, dz, length);
}

export function findMembersWithUnsupportedTorsionRestraint(
  model: ProjectModel
): Member[] {
  return model.members.filter((member) =>
    getMemberTorsionRestraint(member) !== DEFAULT_TORSION_RESTRAINT &&
    getMemberAxisRotationDofOffset(model, member) === null
  );
}

export function getTorsionRestraintSourceDofs(model: ProjectModel): number[] {
  const nodeIdToIndex = new Map(model.nodes.map((node, index) => [node.id, index]));
  const dofs: number[] = [];

  for (const member of model.members) {
    const restraint = getMemberTorsionRestraint(member);
    if (restraint === DEFAULT_TORSION_RESTRAINT) continue;

    const offset = getMemberAxisRotationDofOffset(model, member);
    if (offset === null) continue;

    const nodeId = restraint === 'i' ? member.ni : member.nj;
    const nodeIndex = nodeIdToIndex.get(nodeId);
    if (nodeIndex === undefined) continue;
    dofs.push(nodeIndex * 6 + offset);
  }

  return dofs;
}
