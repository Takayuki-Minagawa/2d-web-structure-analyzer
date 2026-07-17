import type {
  ProjectModel,
  AnalysisError,
  DiagramPoint,
  AnalysisTarget,
} from '../core/model/types';

export type WorkerRequestId = string;

// Legacy messages remain supported until the main-thread client adopts v2.
export interface AnalyzeRequest {
  type: 'analyze';
  model: ProjectModel;
}

export interface AnalyzeRequestV2 extends AnalyzeRequest {
  requestId: WorkerRequestId;
}

export interface AnalyzeAllRequest {
  type: 'analyze-all';
  model: ProjectModel;
}

export interface AnalyzeAllRequestV2 extends AnalyzeAllRequest {
  requestId: WorkerRequestId;
}

export interface CancelRequest {
  type: 'cancel';
  requestId: WorkerRequestId;
}

export type AnalysisExecutionRequest =
  | AnalyzeRequest
  | AnalyzeRequestV2
  | AnalyzeAllRequest
  | AnalyzeAllRequestV2;
export type AnalysisExecutionRequestV2 = AnalyzeRequestV2 | AnalyzeAllRequestV2;
export type WorkerRequest = AnalysisExecutionRequest | CancelRequest;

export interface AnalyzeSuccess {
  type: 'analyze-success';
  displacements: number[];
  reactions: number[];
  elementEndForces: Record<string, number[]>;
  diagrams: Record<string, { memberId: string; points: DiagramPoint[] }>;
  warnings: string[];
}

export interface AnalyzeError {
  type: 'analyze-error';
  error: AnalysisError;
}

export interface SerializedTargetResult<TArray extends number[] | Float64Array> {
  target: AnalysisTarget;
  displacements: TArray;
  reactions: TArray;
  elementEndForces: Record<string, TArray>;
  diagrams: Record<string, { memberId: string; points: DiagramPoint[] }>;
  warnings: string[];
}

export interface SerializedComponentEnvelope<TArray extends number[] | Float64Array> {
  min: TArray;
  max: TArray;
  minTargetIds: string[];
  maxTargetIds: string[];
}

export interface SerializedAnalysisEnvelope<TArray extends number[] | Float64Array> {
  displacements: SerializedComponentEnvelope<TArray>;
  reactions: SerializedComponentEnvelope<TArray>;
  elementEndForces: Record<string, SerializedComponentEnvelope<TArray>>;
}

export interface AnalyzeAllSuccess {
  type: 'analyze-all-success';
  results: Array<SerializedTargetResult<number[]>>;
  envelope: SerializedAnalysisEnvelope<number[]>;
  factorizationCount: number;
}

/** Legacy response consumed by the current store. */
/** Existing single-target main-thread clients intentionally keep this narrow. */
export type WorkerResponse = AnalyzeSuccess | AnalyzeError;

export interface AnalyzeSuccessV2 {
  type: 'analyze-success';
  requestId: WorkerRequestId;
  displacements: Float64Array;
  reactions: Float64Array;
  elementEndForces: Record<string, Float64Array>;
  diagrams: Record<string, { memberId: string; points: DiagramPoint[] }>;
  warnings: string[];
}

export interface AnalyzeErrorV2 {
  type: 'analyze-error';
  requestId: WorkerRequestId;
  error: AnalysisError;
}

export interface AnalyzeAllSuccessV2 {
  type: 'analyze-all-success';
  requestId: WorkerRequestId;
  results: Array<SerializedTargetResult<Float64Array>>;
  envelope: SerializedAnalysisEnvelope<Float64Array>;
  factorizationCount: number;
}

export interface AnalyzeCanceled {
  type: 'analyze-canceled';
  requestId: WorkerRequestId;
}

export type WorkerResponseV2 =
  | AnalyzeSuccessV2
  | AnalyzeAllSuccessV2
  | AnalyzeErrorV2
  | AnalyzeCanceled;
export type AnyWorkerResponse = WorkerResponse | AnalyzeAllSuccess | WorkerResponseV2;

export function isAnalyzeRequestV2(
  request: AnalysisExecutionRequest
): request is AnalysisExecutionRequestV2 {
  return 'requestId' in request && typeof request.requestId === 'string';
}
