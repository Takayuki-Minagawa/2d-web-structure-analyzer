import type {
  ProjectModel,
  AnalysisError,
  DiagramPoint,
} from '../core/model/types';

// Messages from main -> worker
export interface AnalyzeRequest {
  type: 'analyze';
  model: ProjectModel;
}

export type WorkerRequest = AnalyzeRequest;

// Messages from worker -> main
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

export type WorkerResponse = AnalyzeSuccess | AnalyzeError;
