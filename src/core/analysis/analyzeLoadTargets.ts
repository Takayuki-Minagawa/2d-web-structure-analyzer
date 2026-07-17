import type {
  AnalysisError,
  AnalysisTargetResult,
  ComponentEnvelope,
  IndexedModel,
  MemberId,
  MultiTargetAnalysisOutput,
  ProjectModel,
} from '../model/types';
import { buildIndexedModel } from '../model/indexing';
import { validateModel } from '../model/validation';
import { getAnalysisTargets, resolveLoadTargetModel } from '../model/loadCases';
import { assembleGlobalStiffness } from './assembly';
import { buildGlobalForceVector } from './loads';
import { partitionDofs, extractFreeSystem } from './constraints';
import {
  factorLDLt,
  SingularMatrixError,
  solveLDLtMultiple,
} from './solverDense';
import {
  completeAnalysisOutput,
  createAnalysisException,
} from './analyzeFrame';
import { createSingularStabilityDiagnostics } from './stabilityDiagnostics';

function errorDetails(error: AnalysisError): Pick<AnalysisError, 'elementId' | 'nodeId' | 'diagnostics'> {
  const details: Pick<AnalysisError, 'elementId' | 'nodeId' | 'diagnostics'> = {};
  if (error.elementId !== undefined) details.elementId = error.elementId;
  if (error.nodeId !== undefined) details.nodeId = error.nodeId;
  if (error.diagnostics !== undefined) details.diagnostics = error.diagnostics;
  return details;
}

function targetIndexedModel(
  base: IndexedModel,
  source: ProjectModel,
  target: ReturnType<typeof getAnalysisTargets>[number]
): IndexedModel {
  const targetModel = resolveLoadTargetModel(source, target);
  return {
    ...base,
    nodalLoads: targetModel.nodalLoads,
    memberLoads: targetModel.memberLoads,
  };
}

function createEnvelope(
  arrays: readonly Float64Array[],
  targetIds: readonly string[],
  length: number
): ComponentEnvelope {
  const min = new Float64Array(length);
  const max = new Float64Array(length);
  const minTargetIds = new Array<string>(length).fill('');
  const maxTargetIds = new Array<string>(length).fill('');
  if (arrays.length === 0) return { min, max, minTargetIds, maxTargetIds };

  for (let component = 0; component < length; component++) {
    let minimum = arrays[0]![component]!;
    let maximum = minimum;
    let minimumTarget = targetIds[0]!;
    let maximumTarget = minimumTarget;
    for (let targetIndex = 1; targetIndex < arrays.length; targetIndex++) {
      const value = arrays[targetIndex]![component]!;
      if (value < minimum) {
        minimum = value;
        minimumTarget = targetIds[targetIndex]!;
      }
      if (value > maximum) {
        maximum = value;
        maximumTarget = targetIds[targetIndex]!;
      }
    }
    min[component] = minimum;
    max[component] = maximum;
    minTargetIds[component] = minimumTarget;
    maxTargetIds[component] = maximumTarget;
  }
  return { min, max, minTargetIds, maxTargetIds };
}

/**
 * Analyze all load cases and combinations while assembling and factoring the
 * stiffness matrix once. Results remain available per target and as a
 * component-wise minimum/maximum envelope.
 */
export function analyzeAllLoadTargets(model: ProjectModel): MultiTargetAnalysisOutput {
  const validationError = validateModel(model)[0];
  if (validationError) {
    throw createAnalysisException(
      validationError.type,
      validationError.message,
      errorDetails(validationError)
    );
  }

  const indexed = buildIndexedModel(model);
  const K = assembleGlobalStiffness(indexed);
  const { freeDofs, fixedDofs } = partitionDofs(indexed);
  const targets = getAnalysisTargets(model);
  const targetModels = targets.map((target) => targetIndexedModel(indexed, model, target));
  const forceVectors = targetModels.map((targetModel) => buildGlobalForceVector(targetModel));

  let factorizationCount = 0;
  let freeDisplacements: Float64Array[];
  if (freeDofs.length === 0) {
    freeDisplacements = targets.map(() => new Float64Array(0));
  } else {
    const { Kff } = extractFreeSystem(
      K,
      new Float64Array(indexed.dofCount),
      freeDofs,
      indexed.dofCount
    );
    try {
      const factorization = factorLDLt(Kff, freeDofs.length);
      factorizationCount = 1;
      const rightHandSides = forceVectors.map((force) => {
        const rhs = new Float64Array(freeDofs.length);
        for (let i = 0; i < freeDofs.length; i++) rhs[i] = force[freeDofs[i]!]!;
        return rhs;
      });
      freeDisplacements = solveLDLtMultiple(factorization, rightHandSides);
    } catch (error) {
      const diagnostics = error instanceof SingularMatrixError
        ? createSingularStabilityDiagnostics(indexed, K, freeDofs, error.pivotIndex)
        : createSingularStabilityDiagnostics(indexed, K, freeDofs);
      throw createAnalysisException(
        'singular',
        error instanceof Error
          ? error.message
          : '剛性マトリクスが特異です。拘束条件を確認してください。',
        { diagnostics }
      );
    }
  }

  const results: AnalysisTargetResult[] = targets.map((target, targetIndex) => {
    const displacement = new Float64Array(indexed.dofCount);
    const free = freeDisplacements[targetIndex]!;
    for (let i = 0; i < freeDofs.length; i++) displacement[freeDofs[i]!] = free[i]!;
    const output = completeAnalysisOutput(
      targetModels[targetIndex]!,
      K,
      forceVectors[targetIndex]!,
      displacement,
      fixedDofs
    );
    return { ...output, target };
  });

  const targetIds = results.map((result) => result.target.id);
  const elementEndForces = new Map<MemberId, ComponentEnvelope>();
  for (const member of indexed.members) {
    const arrays = results.map((result) => result.elementEndForces.get(member.id) ?? new Float64Array(12));
    elementEndForces.set(member.id, createEnvelope(arrays, targetIds, 12));
  }

  return {
    results,
    envelope: {
      displacements: createEnvelope(
        results.map((result) => result.displacements),
        targetIds,
        indexed.dofCount
      ),
      reactions: createEnvelope(
        results.map((result) => result.reactions),
        targetIds,
        indexed.dofCount
      ),
      elementEndForces,
    },
    factorizationCount,
  };
}

/** More discoverable alias for clients that primarily think in load cases. */
export const analyzeAllLoadCases = analyzeAllLoadTargets;
