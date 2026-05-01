import type { ProjectModel, Restraint, StructuralNode, AnalysisMode } from './types';

export const DEFAULT_ANALYSIS_MODE: AnalysisMode = '3d';
export const XZ_2D_MODE: AnalysisMode = 'xz2d';
export const XZ_PLANE_TOLERANCE = 1e-9;

export function getAnalysisMode(model: ProjectModel): AnalysisMode {
  return model.analysisMode ?? DEFAULT_ANALYSIS_MODE;
}

export function isXz2dMode(model: ProjectModel): boolean {
  return getAnalysisMode(model) === XZ_2D_MODE;
}

export function findNodesOffXzPlane(
  model: ProjectModel,
  tolerance = XZ_PLANE_TOLERANCE
): StructuralNode[] {
  return model.nodes.filter((node) => Math.abs(node.y) > tolerance);
}

export function getEffectiveRestraint(
  restraint: Restraint,
  mode: AnalysisMode
): Restraint {
  if (mode !== XZ_2D_MODE) return restraint;
  return {
    ...restraint,
    uy: true,
    rx: true,
    rz: true,
  };
}
