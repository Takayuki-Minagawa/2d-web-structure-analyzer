import type {
  AnalysisError,
  ComponentEnvelope,
  DiagramPoint,
  MultiTargetAnalysisOutput,
} from '../core/model/types';
import { buildIndexedModel } from '../core/model/indexing';
import { validateModel } from '../core/model/validation';
import { analyzeFrame } from '../core/analysis/analyzeFrame';
import { analyzeAllLoadTargets } from '../core/analysis/analyzeLoadTargets';
import { resolveAnalysisLoadModel } from '../core/model/loadCases';
import type {
  AnalysisExecutionRequest,
  AnalyzeAllSuccess,
  AnalyzeAllSuccessV2,
  AnyWorkerResponse,
  WorkerResponse,
  WorkerResponseV2,
} from './protocol';
import { isAnalyzeRequestV2 } from './protocol';

export interface AnalysisResponseEnvelope {
  response: AnyWorkerResponse;
  transferables: Transferable[];
}

function serializeDiagrams(
  diagrams: Map<string, { memberId: string; points: DiagramPoint[] }>
): Record<string, { memberId: string; points: DiagramPoint[] }> {
  const serialized: Record<string, { memberId: string; points: DiagramPoint[] }> = {};
  diagrams.forEach((value, key) => {
    serialized[key] = { memberId: value.memberId, points: value.points };
  });
  return serialized;
}

function mapAnalysisError(errorValue: unknown): AnalysisError {
  if (!errorValue || typeof errorValue !== 'object') {
    return { type: 'numerical', message: String(errorValue || 'An unknown error occurred during analysis.') };
  }
  const source = errorValue as Partial<AnalysisError> & { message?: unknown };
  const error: AnalysisError = {
    type: source.type ?? 'numerical',
    message: typeof source.message === 'string'
      ? source.message
      : 'An unknown error occurred during analysis.',
  };
  if (source.elementId !== undefined) error.elementId = source.elementId;
  if (source.nodeId !== undefined) error.nodeId = source.nodeId;
  if (source.diagnostics !== undefined) error.diagnostics = source.diagnostics;
  return error;
}

function errorEnvelope(
  request: AnalysisExecutionRequest,
  error: AnalysisError
): AnalysisResponseEnvelope {
  const response: WorkerResponse | WorkerResponseV2 = isAnalyzeRequestV2(request)
    ? { type: 'analyze-error', requestId: request.requestId, error }
    : { type: 'analyze-error', error };
  return { response, transferables: [] };
}

function serializeEndForcesAsArrays(
  values: Map<string, Float64Array>
): Record<string, number[]> {
  const serialized: Record<string, number[]> = {};
  values.forEach((value, key) => {
    serialized[key] = Array.from(value);
  });
  return serialized;
}

function serializeLegacyEnvelope(component: ComponentEnvelope): {
  min: number[];
  max: number[];
  minTargetIds: string[];
  maxTargetIds: string[];
} {
  return {
    min: Array.from(component.min),
    max: Array.from(component.max),
    minTargetIds: component.minTargetIds,
    maxTargetIds: component.maxTargetIds,
  };
}

function serializeAnalyzeAllLegacy(result: MultiTargetAnalysisOutput): AnalyzeAllSuccess {
  const elementEndForces: AnalyzeAllSuccess['envelope']['elementEndForces'] = {};
  result.envelope.elementEndForces.forEach((component, memberId) => {
    elementEndForces[memberId] = serializeLegacyEnvelope(component);
  });
  return {
    type: 'analyze-all-success',
    results: result.results.map((targetResult) => ({
      target: targetResult.target,
      displacements: Array.from(targetResult.displacements),
      reactions: Array.from(targetResult.reactions),
      elementEndForces: serializeEndForcesAsArrays(targetResult.elementEndForces),
      diagrams: serializeDiagrams(targetResult.diagrams),
      warnings: targetResult.warnings,
    })),
    envelope: {
      displacements: serializeLegacyEnvelope(result.envelope.displacements),
      reactions: serializeLegacyEnvelope(result.envelope.reactions),
      elementEndForces,
    },
    factorizationCount: result.factorizationCount,
  };
}

function appendComponentTransferables(
  component: ComponentEnvelope,
  transferables: Transferable[]
): ComponentEnvelope {
  transferables.push(component.min.buffer as ArrayBuffer, component.max.buffer as ArrayBuffer);
  return component;
}

function serializeAnalyzeAllV2(
  requestId: string,
  result: MultiTargetAnalysisOutput
): AnalysisResponseEnvelope {
  const transferables: Transferable[] = [];
  const elementEnvelope: AnalyzeAllSuccessV2['envelope']['elementEndForces'] = {};
  result.envelope.elementEndForces.forEach((component, memberId) => {
    elementEnvelope[memberId] = appendComponentTransferables(component, transferables);
  });
  const results: AnalyzeAllSuccessV2['results'] = result.results.map((targetResult) => {
    transferables.push(
      targetResult.displacements.buffer as ArrayBuffer,
      targetResult.reactions.buffer as ArrayBuffer
    );
    const elementEndForces: Record<string, Float64Array> = {};
    targetResult.elementEndForces.forEach((value, memberId) => {
      elementEndForces[memberId] = value;
      transferables.push(value.buffer as ArrayBuffer);
    });
    return {
      target: targetResult.target,
      displacements: targetResult.displacements,
      reactions: targetResult.reactions,
      elementEndForces,
      diagrams: serializeDiagrams(targetResult.diagrams),
      warnings: targetResult.warnings,
    };
  });
  const response: AnalyzeAllSuccessV2 = {
    type: 'analyze-all-success',
    requestId,
    results,
    envelope: {
      displacements: appendComponentTransferables(result.envelope.displacements, transferables),
      reactions: appendComponentTransferables(result.envelope.reactions, transferables),
      elementEndForces: elementEnvelope,
    },
    factorizationCount: result.factorizationCount,
  };
  return { response, transferables };
}

/** Execute and serialize one analysis request without depending on worker globals. */
export function createAnalysisResponse(
  request: AnalysisExecutionRequest
): AnalysisResponseEnvelope {
  try {
    if (request.type === 'analyze-all') {
      const result = analyzeAllLoadTargets(request.model);
      if (!isAnalyzeRequestV2(request)) {
        return { response: serializeAnalyzeAllLegacy(result), transferables: [] };
      }
      return serializeAnalyzeAllV2(request.requestId, result);
    }

    const analysisModel = resolveAnalysisLoadModel(request.model);
    const errors = validateModel(analysisModel);
    const firstError = errors[0];
    if (firstError) return errorEnvelope(request, firstError);

    const indexed = buildIndexedModel(analysisModel);
    const result = analyzeFrame({ model: indexed });
    const diagrams = serializeDiagrams(result.diagrams);

    if (!isAnalyzeRequestV2(request)) {
      const elementEndForces: Record<string, number[]> = {};
      result.elementEndForces.forEach((value, key) => {
        elementEndForces[key] = Array.from(value);
      });
      const response: WorkerResponse = {
        type: 'analyze-success',
        displacements: Array.from(result.displacements),
        reactions: Array.from(result.reactions),
        elementEndForces,
        diagrams,
        warnings: result.warnings,
      };
      return { response, transferables: [] };
    }

    const elementEndForces: Record<string, Float64Array> = {};
    const transferables: Transferable[] = [
      result.displacements.buffer as ArrayBuffer,
      result.reactions.buffer as ArrayBuffer,
    ];
    result.elementEndForces.forEach((value, key) => {
      elementEndForces[key] = value;
      transferables.push(value.buffer as ArrayBuffer);
    });
    const response: WorkerResponseV2 = {
      type: 'analyze-success',
      requestId: request.requestId,
      displacements: result.displacements,
      reactions: result.reactions,
      elementEndForces,
      diagrams,
      warnings: result.warnings,
    };
    return { response, transferables };
  } catch (error) {
    return errorEnvelope(request, mapAnalysisError(error));
  }
}
