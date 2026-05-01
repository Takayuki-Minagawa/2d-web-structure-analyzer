import type {
  DofName,
  IndexedModel,
  StabilityDiagnostic,
} from '../model/types';

const DOF_NAMES: DofName[] = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
const DOF_LABELS: Record<DofName, string> = {
  ux: 'X方向変位 ux',
  uy: 'Y方向変位 uy',
  uz: 'Z方向変位 uz',
  rx: 'X軸回転 rx',
  ry: 'Y軸回転 ry',
  rz: 'Z軸回転 rz',
};
const MAX_ZERO_STIFFNESS_DIAGNOSTICS = 6;
const MAX_RELEASE_DIAGNOSTICS = 4;

interface DofDescriptor {
  nodeId: string;
  dof: DofName;
  dofIndex: number;
}

interface RowNorm {
  sourceDof: number;
  norm: number;
}

export function createSingularStabilityDiagnostics(
  model: IndexedModel,
  stiffness: Float64Array,
  freeDofs: number[],
  pivotIndex?: number
): StabilityDiagnostic[] {
  const diagnostics: StabilityDiagnostic[] = [];
  const seen = new Set<string>();
  const pivotDof = pivotIndex === undefined ? undefined : freeDofs[pivotIndex];

  if (pivotDof !== undefined) {
    const desc = describeDof(model, pivotDof);
    if (desc) {
      diagnostics.push({
        kind: 'singular-pivot',
        message: `特異ピボットは節点 ${desc.nodeId} の ${DOF_LABELS[desc.dof]} に対応します。`,
        suggestion: 'この自由度に拘束、回転バネ、接続部材、または該当する部材端拘束が不足していないか確認してください。',
        nodeId: desc.nodeId,
        dof: desc.dof,
        dofIndex: desc.dofIndex,
      });
      seen.add(`dof:${desc.dofIndex}`);
    }
  }

  for (const row of findZeroStiffnessDofs(model, stiffness, freeDofs)) {
    if (seen.has(`dof:${row.sourceDof}`)) continue;
    const desc = describeDof(model, row.sourceDof);
    if (!desc) continue;
    diagnostics.push({
      kind: 'zero-stiffness-dof',
      message: `節点 ${desc.nodeId} の ${DOF_LABELS[desc.dof]} は自由DOFですが、有効な剛性がほぼありません。`,
      suggestion: '孤立節点、未接続の回転自由度、両端ピン、または必要な支持条件の抜けを確認してください。',
      nodeId: desc.nodeId,
      dof: desc.dof,
      dofIndex: desc.dofIndex,
    });
    seen.add(`dof:${desc.dofIndex}`);
    if (diagnostics.filter((d) => d.kind === 'zero-stiffness-dof').length >= MAX_ZERO_STIFFNESS_DIAGNOSTICS) {
      break;
    }
  }

  for (const diagnostic of findBothEndReleaseDiagnostics(model)) {
    if (diagnostics.filter((d) => d.kind === 'released-member').length >= MAX_RELEASE_DIAGNOSTICS) {
      break;
    }
    diagnostics.push(diagnostic);
  }

  return diagnostics;
}

function describeDof(model: IndexedModel, sourceDof: number): DofDescriptor | null {
  const nodeIndex = Math.floor(sourceDof / 6);
  const dof = DOF_NAMES[sourceDof % 6];
  const node = model.nodes[nodeIndex];
  if (!node || !dof) return null;
  return { nodeId: node.id, dof, dofIndex: sourceDof };
}

function findZeroStiffnessDofs(
  model: IndexedModel,
  stiffness: Float64Array,
  freeDofs: number[]
): RowNorm[] {
  const norms = freeDofs.map((sourceDof) => ({
    sourceDof,
    norm: freeRowAbsSum(stiffness, model.dofCount, sourceDof, freeDofs),
  }));
  const maxNorm = norms.reduce((max, row) => Math.max(max, row.norm), 0);
  const tolerance = Math.max(1e-14, maxNorm * 1e-12);
  return norms
    .filter((row) => row.norm <= tolerance)
    .slice(0, MAX_ZERO_STIFFNESS_DIAGNOSTICS + 1);
}

function freeRowAbsSum(
  stiffness: Float64Array,
  dofCount: number,
  sourceDof: number,
  freeDofs: number[]
): number {
  let sum = 0;
  const rowOffset = sourceDof * dofCount;
  for (const colDof of freeDofs) {
    sum += Math.abs(stiffness[rowOffset + colDof]!);
  }
  return sum;
}

function findBothEndReleaseDiagnostics(model: IndexedModel): StabilityDiagnostic[] {
  const diagnostics: StabilityDiagnostic[] = [];
  for (const member of model.members) {
    const releasedLabels: string[] = [];
    if (member.releases[0].type === 'pin' && member.releases[3].type === 'pin') {
      releasedLabels.push('local x ねじり');
    }
    if (member.releases[1].type === 'pin' && member.releases[4].type === 'pin') {
      releasedLabels.push('local y 曲げ回転');
    }
    if (member.releases[2].type === 'pin' && member.releases[5].type === 'pin') {
      releasedLabels.push('local z 曲げ回転');
    }
    if (releasedLabels.length === 0) continue;

    diagnostics.push({
      kind: 'released-member',
      message: `部材 ${member.id} は ${releasedLabels.join('、')} が両端ピンです。`,
      suggestion: '片端に回転拘束または回転バネを追加するか、今回追加済みの一端捻り拘束が適用できる部材ではそれを使用してください。',
      elementId: member.id,
    });
  }
  return diagnostics;
}
