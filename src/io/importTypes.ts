import type { ProjectModel } from '../core/model/types';

export interface ImportWarning {
  code: string;
  message: string;
  count?: number;
  itemIds?: Array<string | number>;
}

export interface ImportSummary {
  format: 'frame-json' | 'project-file';
  nodes: number;
  members: number;
  materials: number;
  sections: number;
  nodalLoads: number;
  memberLoads: number;
  skippedMembers: number;
  ignoredWalls: number;
}

export interface ImportLoadCaseInfo {
  index: number;
  name: string;
  selected: boolean;
}

export interface ModelImportResult {
  model: ProjectModel;
  warnings: ImportWarning[];
  summary: ImportSummary;
  loadCases: ImportLoadCaseInfo[];
}
