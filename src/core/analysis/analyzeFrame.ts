import type {
  AnalysisInput,
  AnalysisOutput,
  AnalysisError,
  IndexedModel,
} from '../model/types';
import { assembleGlobalStiffness } from './assembly';
import { buildGlobalForceVector } from './loads';
import { partitionDofs, extractFreeSystem } from './constraints';
import { factorLDLt, SingularMatrixError, solveLDLtWithFactor } from './solverDense';
import { computeReactions, computeAllElementEndForces } from './recover';
import { generateAllDiagrams } from './diagrams';
import { createSingularStabilityDiagnostics } from './stabilityDiagnostics';
import { groupMemberLoadsByMember } from './loads';

const MAX_TRANSLATION_LENGTH_RATIO = 100;
const MAX_ROTATION_RADIANS = 100;

export class AnalysisException extends Error implements AnalysisError {
  readonly type: AnalysisError['type'];
  readonly elementId?: string;
  readonly nodeId?: string;
  readonly diagnostics?: NonNullable<AnalysisError['diagnostics']>;

  constructor(
    type: AnalysisError['type'],
    message: string,
    details: Pick<AnalysisError, 'elementId' | 'nodeId' | 'diagnostics'> = {}
  ) {
    super(message);
    this.name = 'AnalysisException';
    this.type = type;
    if (details.elementId !== undefined) this.elementId = details.elementId;
    if (details.nodeId !== undefined) this.nodeId = details.nodeId;
    if (details.diagnostics !== undefined) this.diagnostics = details.diagnostics;
  }
}

/**
 * Main analysis entry point.
 * Performs linear elastic 3D frame analysis.
 */
export function analyzeFrame(input: AnalysisInput): AnalysisOutput {
  const { model } = input;
  const warnings: string[] = [];
  const n = model.dofCount;

  // 1. Assemble global stiffness matrix
  const K = assembleGlobalStiffness(model);

  // 2. Build global force vector (nodal loads + equivalent nodal loads)
  const F = buildGlobalForceVector(model);

  // 3. Partition DOFs into free and fixed
  const { freeDofs, fixedDofs } = partitionDofs(model);

  // 4. Solve for free DOF displacements
  const d = new Float64Array(n);

  if (freeDofs.length > 0) {
    const { Kff, Ff } = extractFreeSystem(K, F, freeDofs, n);

    let df: Float64Array;
    try {
      const factorization = factorLDLt(Kff, freeDofs.length);
      df = solveLDLtWithFactor(factorization, Ff);
    } catch (e) {
      const diagnostics = e instanceof SingularMatrixError
        ? createSingularStabilityDiagnostics(model, K, freeDofs, e.pivotIndex)
        : createSingularStabilityDiagnostics(model, K, freeDofs);
      throw createAnalysisException(
        'singular',
        e instanceof Error
          ? e.message
          : '剛性マトリクスが特異です。拘束条件を確認してください。',
        { diagnostics }
      );
    }

    for (let i = 0; i < freeDofs.length; i++) {
      d[freeDofs[i]!] = df[i]!;
    }
  }

  return completeAnalysisOutput(model, K, F, d, fixedDofs, warnings);
}

export function createAnalysisException(
  type: AnalysisError['type'],
  message: string,
  details: Pick<AnalysisError, 'elementId' | 'nodeId' | 'diagnostics'> = {}
): AnalysisException {
  return new AnalysisException(type, message, details);
}

/** Complete recovery for a solved displacement vector and prepared K/F pair. */
export function completeAnalysisOutput(
  model: IndexedModel,
  K: Float64Array,
  F: Float64Array,
  d: Float64Array,
  fixedDofs: number[],
  warnings: string[] = []
): AnalysisOutput {
  const { dofMap } = model;
  for (let i = 0; i < model.dofCount; i++) {
    if (dofMap[i] !== i) d[i] = d[dofMap[i]!]!;
  }

  const reactions = computeReactions(
    K,
    d,
    F,
    model.dofCount,
    fixedDofs,
    model.nodeSprings,
    model.dofMap
  );
  const memberLoadsByMember = groupMemberLoadsByMember(model.memberLoads);
  const elementEndForces = computeAllElementEndForces(model, d, memberLoadsByMember);
  const diagrams = generateAllDiagrams(model, elementEndForces, d, memberLoadsByMember);
  appendDisplacementWarnings(model, d, warnings);

  return { displacements: d, reactions, elementEndForces, diagrams, warnings };
}

function appendDisplacementWarnings(
  model: IndexedModel,
  displacements: Float64Array,
  warnings: string[]
): void {
  let representativeLength = 0;
  for (const member of model.members) {
    representativeLength = Math.max(representativeLength, member.L);
  }
  for (let dof = 0; dof < displacements.length; dof++) {
    const value = Math.abs(displacements[dof]!);
    const localDof = dof % 6;
    const excessive = localDof < 3
      ? representativeLength > 0 && value / representativeLength > MAX_TRANSLATION_LENGTH_RATIO
      : value > MAX_ROTATION_RADIANS;
    if (!excessive) continue;
    const relative = localDof < 3
      ? `、代表長さ比 ${(value / representativeLength).toExponential(3)}`
      : '';
    warnings.push(
      `自由度 ${dof} の変位がモデル寸法に対して非常に大きくなっています (${displacements[dof]!.toExponential(3)}${relative})。モデルを確認してください。`
    );
    break;
  }
}
