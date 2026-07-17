import { create, useStore } from 'zustand';
import { temporal, type TemporalState } from 'zundo';
import type {
  ProjectModel,
  StructuralNode,
  Member,
  Material,
  Section,
  NodalLoad,
  MemberLoad,
  CouplingConstraint,
  AnalysisError,
  AnalysisResult,
  Restraint,
  AnalysisMode,
  LoadCase,
  LoadCombination,
  NodalSpringSupport,
} from '../core/model/types';
import type {
  AnalyzeAllSuccess,
  SerializedTargetResult,
  WorkerResponse,
} from '../worker/protocol';
import { importJsonTextAuto, type JsonImportResult } from '../io/jsonImporter';
import {
  DEFAULT_ANALYSIS_MODE,
  findNodesOffAnalysisPlane,
  getAnalysisMode,
  get2dModeConfig,
  lockNodeToAnalysisPlane,
  normalizeAnalysisMode,
} from '../core/model/analysisMode';
import {
  DEFAULT_TORSION_RESTRAINT,
  normalizeTorsionRestraint,
} from '../core/model/torsionRestraint';
import {
  DEFAULT_LOAD_CASE,
  getActiveLoadCaseId,
  getLoadCases,
  getLoadCombinations,
} from '../core/model/loadCases';
import {
  ensureDisplayNumbers,
  nextDisplayNumber,
} from '../core/model/displayNumbers';

/** Distributive Omit that works correctly with union types */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

const DEFAULT_RESTRAINT: Restraint = {
  ux: false, uy: false, uz: false,
  rx: false, ry: false, rz: false,
};

export type AnalysisModeUpdateResult =
  | { ok: true }
  | {
      ok: false;
      code: 'off-plane-nodes';
      mode: Exclude<AnalysisMode, '3d'>;
      nodeIds: string[];
    };

export type SelectionCloneResult = {
  nodeIds: string[];
  memberIds: string[];
};

export type AnalysisResultView =
  | { kind: 'target'; targetId: string }
  | { kind: 'envelope'; bound: 'min' | 'max' };

type CoordinateAxis = 'x' | 'y' | 'z';
type CoordinateOffset = { x: number; y: number; z: number };

export function normalizeProjectModel(model: ProjectModel): ProjectModel {
  const loadCases = getLoadCases(model);
  const loadCaseIds = new Set(loadCases.map((loadCase) => loadCase.id));
  const fallbackLoadCaseId = loadCases[0]!.id;
  const activeLoadCaseId = model.activeLoadCaseId && loadCaseIds.has(model.activeLoadCaseId)
    ? model.activeLoadCaseId
    : fallbackLoadCaseId;
  const loadCombinations = getLoadCombinations(model).map((combo) => ({
    ...combo,
    factors: combo.factors.filter((factor) => loadCaseIds.has(factor.loadCaseId)),
  }));
  const activeLoadCombinationId = model.activeLoadCombinationId &&
    loadCombinations.some((combo) => combo.id === model.activeLoadCombinationId)
    ? model.activeLoadCombinationId
    : null;

  // Idempotently fills defaults for older persisted/imported project files.
  return ensureDisplayNumbers({
    ...model,
    analysisMode: normalizeAnalysisMode(model.analysisMode),
    springs: model.springs ?? [],
    loadCases,
    loadCombinations,
    activeLoadCaseId,
    activeLoadCombinationId,
    members: (model.members ?? []).map((member) => ({
      ...member,
      iSprings: member.iSprings ?? { x: 0, y: 0, z: 0 },
      jSprings: member.jSprings ?? { x: 0, y: 0, z: 0 },
      torsionRestraint: normalizeTorsionRestraint(member.torsionRestraint),
    })),
    couplings: model.couplings ?? [],
    nodeSprings: model.nodeSprings ?? [],
    gravity: { ...(model.gravity ?? { x: 0, y: 0, z: 0 }) },
    nodalLoads: (model.nodalLoads ?? []).map((load) => ({
      ...load,
      loadCaseId: load.loadCaseId && loadCaseIds.has(load.loadCaseId)
        ? load.loadCaseId
        : fallbackLoadCaseId,
    })),
    memberLoads: (model.memberLoads ?? []).map((load) => ({
      ...load,
      loadCaseId: load.loadCaseId && loadCaseIds.has(load.loadCaseId)
        ? load.loadCaseId
        : fallbackLoadCaseId,
    })),
  });
}

export function createDefaultModel(): ProjectModel {
  const matId = generateId();
  return {
    title: '',
    analysisMode: DEFAULT_ANALYSIS_MODE,
    nodes: [],
    materials: [
      { id: matId, name: 'Steel', E: 20500, G: 7900, nu: 0.3, expansion: 0.000012, density: 0 },
    ],
    sections: [
      { id: generateId(), name: 'Default', materialId: matId, A: 100, Ix: 1000, Iy: 500, Iz: 500, ky: 0, kz: 0 },
    ],
    springs: [],
    loadCases: [DEFAULT_LOAD_CASE],
    loadCombinations: [],
    activeLoadCaseId: DEFAULT_LOAD_CASE.id,
    activeLoadCombinationId: null,
    members: [],
    couplings: [],
    nodeSprings: [],
    gravity: { x: 0, y: 0, z: 0 },
    nodalLoads: [],
    memberLoads: [],
    units: { force: 'kN', length: 'cm', moment: 'kN·cm' },
  };
}

function replacementState(
  model: ProjectModel,
  fitViewVersion: number,
  lastImportReport: JsonImportResult | null = null,
) {
  return {
    model: normalizeProjectModel(model),
    analysisResult: null,
    analysisResults: [] as AnalyzeAllSuccess['results'],
    analysisEnvelope: null,
    analysisFactorizationCount: null,
    analysisResultView: null,
    analysisError: null,
    isAnalyzing: false,
    isResultStale: false,
    fitViewVersion: fitViewVersion + 1,
    lastImportReport,
  } as const;
}

function targetResultToAnalysisResult(
  result: SerializedTargetResult<number[]>,
): AnalysisResult {
  return {
    displacements: result.displacements,
    reactions: result.reactions,
    elementEndForces: result.elementEndForces,
    diagrams: result.diagrams,
    warnings: result.warnings,
  };
}

interface ProjectState {
  model: ProjectModel;
  analysisResult: AnalysisResult | null;
  analysisResults: AnalyzeAllSuccess['results'];
  analysisEnvelope: AnalyzeAllSuccess['envelope'] | null;
  analysisFactorizationCount: number | null;
  analysisResultView: AnalysisResultView | null;
  analysisError: AnalysisError | null;
  isAnalyzing: boolean;
  isResultStale: boolean;
  /** Incremented when a full model load occurs and the view should fit to new content. */
  fitViewVersion: number;
  lastImportReport: JsonImportResult | null;

  // Node operations
  addNode: (x: number, y: number, z: number) => string;
  updateNode: (id: string, updates: Partial<Omit<StructuralNode, 'id'>>) => void;
  updateNodes: (ids: Iterable<string>, updates: Partial<Omit<StructuralNode, 'id'>>) => void;
  removeNode: (id: string) => void;
  addNodeSpring: (spring: Omit<NodalSpringSupport, 'id'>) => string;
  updateNodeSpring: (id: string, updates: Partial<Omit<NodalSpringSupport, 'id'>>) => void;
  removeNodeSpring: (id: string) => void;

  // Member operations
  addMember: (ni: string, nj: string) => string;
  updateMember: (id: string, updates: Partial<Omit<Member, 'id'>>) => void;
  updateMembers: (ids: Iterable<string>, updates: Partial<Omit<Member, 'id'>>) => void;
  removeMember: (id: string) => void;
  duplicateSelection: (nodeIds: string[], memberIds: string[], offset: CoordinateOffset, copies?: number) => SelectionCloneResult;
  mirrorSelection: (nodeIds: string[], memberIds: string[], axis: CoordinateAxis) => SelectionCloneResult;

  // Material operations
  addMaterial: (mat: Omit<Material, 'id'>) => string;
  updateMaterial: (id: string, updates: Partial<Omit<Material, 'id'>>) => void;
  removeMaterial: (id: string) => void;

  // Section operations
  addSection: (sec: Omit<Section, 'id'>) => string;
  updateSection: (id: string, updates: Partial<Omit<Section, 'id'>>) => void;
  removeSection: (id: string) => void;

  // Load operations
  addNodalLoad: (load: Omit<NodalLoad, 'id'>) => string;
  updateNodalLoad: (id: string, updates: Partial<Omit<NodalLoad, 'id'>>) => void;
  removeNodalLoad: (id: string) => void;
  addMemberLoad: (load: DistributiveOmit<MemberLoad, 'id'>) => string;
  updateMemberLoad: (id: string, updates: Partial<DistributiveOmit<MemberLoad, 'id'>>) => void;
  replaceMemberLoad: (id: string, load: DistributiveOmit<MemberLoad, 'id'>) => void;
  removeMemberLoad: (id: string) => void;

  // Load cases
  addLoadCase: (name?: string) => string;
  updateLoadCase: (id: string, updates: Partial<Omit<LoadCase, 'id'>>) => void;
  removeLoadCase: (id: string) => void;
  setActiveLoadCase: (id: string) => void;
  addLoadCombination: (name?: string) => string;
  updateLoadCombination: (id: string, updates: Partial<Omit<LoadCombination, 'id'>>) => void;
  removeLoadCombination: (id: string) => void;
  setActiveLoadCombination: (id: string | null) => void;

  // Coupling operations
  addCoupling: (c: Omit<CouplingConstraint, 'id'>) => string;
  updateCoupling: (id: string, updates: Partial<Omit<CouplingConstraint, 'id'>>) => void;
  removeCoupling: (id: string) => void;

  // Analysis
  setAnalyzing: (v: boolean) => void;
  setAnalysisResult: (resp: WorkerResponse | AnalyzeAllSuccess) => void;
  selectAnalysisResultView: (view: AnalysisResultView) => void;
  markResultStale: () => void;
  setAnalysisMode: (mode: AnalysisMode) => AnalysisModeUpdateResult;
  flattenNodesTo2dPlane: (mode?: AnalysisMode) => string[];
  flattenNodesToXzPlane: () => string[];

  // Project
  loadModel: (model: ProjectModel) => void;
  importFrameJson: (text: string, loadCaseIndex?: number) => JsonImportResult;
  importJsonAuto: (text: string) => JsonImportResult;
  clearImportReport: () => void;
  setImportReport: (report: JsonImportResult | null) => void;
  resetModel: () => void;

  // Units
  updateUnits: (updates: Partial<ProjectModel['units']>) => void;
  updateGravity: (updates: Partial<NonNullable<ProjectModel['gravity']>>) => void;
}

type ProjectHistoryState = Pick<ProjectState, 'model'>;

export const useProjectStore = create<ProjectState>()(temporal((set, get) => ({
  model: createDefaultModel(),
  analysisResult: null,
  analysisResults: [],
  analysisEnvelope: null,
  analysisFactorizationCount: null,
  analysisResultView: null,
  analysisError: null,
  isAnalyzing: false,
  isResultStale: false,
  fitViewVersion: 0,
  lastImportReport: null,

  addNode: (x, y, z) => {
    const id = generateId();
    set((s) => ({
      model: {
        ...s.model,
        nodes: [
          ...s.model.nodes,
          lockNodeToAnalysisPlane(
            {
              id,
              number: nextDisplayNumber(s.model.nodes),
              x,
              y,
              z,
              restraint: { ...DEFAULT_RESTRAINT },
            },
            getAnalysisMode(s.model)
          ),
        ],
      },
      isResultStale: true,
    }));
    return id;
  },

  updateNode: (id, updates) => {
    set((s) => ({
      model: {
        ...s.model,
        nodes: s.model.nodes.map((n) =>
          n.id === id
            ? lockNodeToAnalysisPlane({ ...n, ...updates }, getAnalysisMode(s.model))
            : n
        ),
      },
      isResultStale: true,
    }));
  },

  updateNodes: (ids, updates) => {
    const selected = new Set(ids);
    if (selected.size === 0) return;
    set((s) => ({
      model: {
        ...s.model,
        nodes: s.model.nodes.map((node) =>
          selected.has(node.id)
            ? lockNodeToAnalysisPlane({ ...node, ...updates }, getAnalysisMode(s.model))
            : node
        ),
      },
      isResultStale: true,
    }));
  },

  removeNode: (id) => {
    set((s) => {
      const removedMemberIds = new Set(
        s.model.members.filter((m) => m.ni === id || m.nj === id).map((m) => m.id)
      );
      return {
        model: {
          ...s.model,
          nodes: s.model.nodes.filter((n) => n.id !== id),
          members: s.model.members.filter((m) => m.ni !== id && m.nj !== id),
          nodalLoads: s.model.nodalLoads.filter((l) => l.nodeId !== id),
          memberLoads: s.model.memberLoads.filter((l) => !removedMemberIds.has(l.memberId)),
          couplings: s.model.couplings.filter((c) => c.masterNodeId !== id && c.slaveNodeId !== id),
          nodeSprings: (s.model.nodeSprings ?? []).filter((spring) => spring.nodeId !== id),
        },
        isResultStale: true,
      };
    });
  },

  addNodeSpring: (spring) => {
    const id = generateId();
    set((s) => ({
      model: {
        ...s.model,
        nodeSprings: [...(s.model.nodeSprings ?? []), { ...spring, id }],
      },
      isResultStale: true,
    }));
    return id;
  },

  updateNodeSpring: (id, updates) => {
    set((s) => ({
      model: {
        ...s.model,
        nodeSprings: (s.model.nodeSprings ?? []).map((spring) =>
          spring.id === id ? { ...spring, ...updates } : spring
        ),
      },
      isResultStale: true,
    }));
  },

  removeNodeSpring: (id) => {
    set((s) => ({
      model: {
        ...s.model,
        nodeSprings: (s.model.nodeSprings ?? []).filter((spring) => spring.id !== id),
      },
      isResultStale: true,
    }));
  },

  addMember: (ni, nj) => {
    const id = generateId();
    const { sections } = get().model;
    const sectionId = sections[0]?.id ?? '';
    set((s) => ({
      model: {
        ...s.model,
        members: [...s.model.members, {
          id, number: nextDisplayNumber(s.model.members), ni, nj, sectionId,
          codeAngle: 0,
          iSprings: { x: 0, y: 0, z: 0 },
          jSprings: { x: 0, y: 0, z: 0 },
          torsionRestraint: DEFAULT_TORSION_RESTRAINT,
        }],
      },
      isResultStale: true,
    }));
    return id;
  },

  updateMember: (id, updates) => {
    set((s) => ({
      model: {
        ...s.model,
        members: s.model.members.map((m) =>
          m.id === id
            ? {
                ...m,
                ...updates,
                torsionRestraint: updates.torsionRestraint !== undefined
                  ? normalizeTorsionRestraint(updates.torsionRestraint)
                  : normalizeTorsionRestraint(m.torsionRestraint),
              }
            : m
        ),
      },
      isResultStale: true,
    }));
  },

  updateMembers: (ids, updates) => {
    const selected = new Set(ids);
    if (selected.size === 0) return;
    set((s) => ({
      model: {
        ...s.model,
        members: s.model.members.map((member) =>
          selected.has(member.id)
            ? {
                ...member,
                ...updates,
                torsionRestraint: updates.torsionRestraint !== undefined
                  ? normalizeTorsionRestraint(updates.torsionRestraint)
                  : normalizeTorsionRestraint(member.torsionRestraint),
              }
            : member
        ),
      },
      isResultStale: true,
    }));
  },

  removeMember: (id) => {
    set((s) => ({
      model: {
        ...s.model,
        members: s.model.members.filter((m) => m.id !== id),
        memberLoads: s.model.memberLoads.filter((l) => l.memberId !== id),
      },
      isResultStale: true,
    }));
  },

  duplicateSelection: (nodeIds, memberIds, offset, copies = 1) => {
    let result: SelectionCloneResult = { nodeIds: [], memberIds: [] };
    const copyCount = Math.max(1, Math.floor(copies));
    set((s) => {
      const selectedNodeIds = new Set(nodeIds);
      const selectedMemberIds = new Set(memberIds);
      for (const member of s.model.members) {
        if (!selectedMemberIds.has(member.id)) continue;
        selectedNodeIds.add(member.ni);
        selectedNodeIds.add(member.nj);
      }

      const sourceNodes = s.model.nodes.filter((node) => selectedNodeIds.has(node.id));
      const sourceMembers = s.model.members.filter((member) =>
        selectedMemberIds.has(member.id) &&
        selectedNodeIds.has(member.ni) &&
        selectedNodeIds.has(member.nj)
      );
      if (sourceNodes.length === 0) return {};

      const newNodes: StructuralNode[] = [];
      const newMembers: Member[] = [];
      const newNodeIds: string[] = [];
      const newMemberIds: string[] = [];
      const mode = getAnalysisMode(s.model);
      let nodeNumber = nextDisplayNumber(s.model.nodes);
      let memberNumber = nextDisplayNumber(s.model.members);

      for (let copyIndex = 1; copyIndex <= copyCount; copyIndex++) {
        const nodeIdMap = new Map<string, string>();
        for (const node of sourceNodes) {
          const id = generateId();
          nodeIdMap.set(node.id, id);
          newNodeIds.push(id);
          newNodes.push(lockNodeToAnalysisPlane({
            ...node,
            id,
            number: nodeNumber++,
            x: node.x + offset.x * copyIndex,
            y: node.y + offset.y * copyIndex,
            z: node.z + offset.z * copyIndex,
            restraint: { ...node.restraint },
          }, mode));
        }
        for (const member of sourceMembers) {
          const ni = nodeIdMap.get(member.ni);
          const nj = nodeIdMap.get(member.nj);
          if (!ni || !nj) continue;
          const id = generateId();
          newMemberIds.push(id);
          newMembers.push({
            ...member,
            id,
            number: memberNumber++,
            ni,
            nj,
            iSprings: { ...member.iSprings },
            jSprings: { ...member.jSprings },
          });
        }
      }

      result = { nodeIds: newNodeIds, memberIds: newMemberIds };
      return {
        model: {
          ...s.model,
          nodes: [...s.model.nodes, ...newNodes],
          members: [...s.model.members, ...newMembers],
        },
        isResultStale: true,
      };
    });
    return result;
  },

  mirrorSelection: (nodeIds, memberIds, axis) => {
    let result: SelectionCloneResult = { nodeIds: [], memberIds: [] };
    set((s) => {
      const selectedNodeIds = new Set(nodeIds);
      const selectedMemberIds = new Set(memberIds);
      for (const member of s.model.members) {
        if (!selectedMemberIds.has(member.id)) continue;
        selectedNodeIds.add(member.ni);
        selectedNodeIds.add(member.nj);
      }

      const sourceNodes = s.model.nodes.filter((node) => selectedNodeIds.has(node.id));
      const sourceMembers = s.model.members.filter((member) =>
        selectedMemberIds.has(member.id) &&
        selectedNodeIds.has(member.ni) &&
        selectedNodeIds.has(member.nj)
      );
      if (sourceNodes.length === 0) return {};

      const nodeIdMap = new Map<string, string>();
      const mode = getAnalysisMode(s.model);
      let nodeNumber = nextDisplayNumber(s.model.nodes);
      let memberNumber = nextDisplayNumber(s.model.members);
      const newNodes = sourceNodes.map((node) => {
        const id = generateId();
        nodeIdMap.set(node.id, id);
        return lockNodeToAnalysisPlane({
          ...node,
          id,
          number: nodeNumber++,
          [axis]: -node[axis],
          restraint: { ...node.restraint },
        }, mode);
      });
      const newMembers = sourceMembers.flatMap((member) => {
        const ni = nodeIdMap.get(member.ni);
        const nj = nodeIdMap.get(member.nj);
        if (!ni || !nj) return [];
        return [{
          ...member,
          id: generateId(),
          number: memberNumber++,
          ni,
          nj,
          iSprings: { ...member.iSprings },
          jSprings: { ...member.jSprings },
        }];
      });

      result = {
        nodeIds: newNodes.map((node) => node.id),
        memberIds: newMembers.map((member) => member.id),
      };
      return {
        model: {
          ...s.model,
          nodes: [...s.model.nodes, ...newNodes],
          members: [...s.model.members, ...newMembers],
        },
        isResultStale: true,
      };
    });
    return result;
  },

  addMaterial: (mat) => {
    const id = generateId();
    set((s) => ({
      model: {
        ...s.model,
        materials: [...s.model.materials, { ...mat, id }],
      },
    }));
    return id;
  },

  updateMaterial: (id, updates) => {
    set((s) => ({
      model: {
        ...s.model,
        materials: s.model.materials.map((m) =>
          m.id === id ? { ...m, ...updates } : m
        ),
      },
      isResultStale: true,
    }));
  },

  removeMaterial: (id) => {
    set((s) => ({
      model: {
        ...s.model,
        materials: s.model.materials.filter((m) => m.id !== id),
      },
    }));
  },

  addSection: (sec) => {
    const id = generateId();
    set((s) => ({
      model: {
        ...s.model,
        sections: [...s.model.sections, { ...sec, id }],
      },
    }));
    return id;
  },

  updateSection: (id, updates) => {
    set((s) => ({
      model: {
        ...s.model,
        sections: s.model.sections.map((sec) =>
          sec.id === id ? { ...sec, ...updates } : sec
        ),
      },
      isResultStale: true,
    }));
  },

  removeSection: (id) => {
    set((s) => ({
      model: {
        ...s.model,
        sections: s.model.sections.filter((sec) => sec.id !== id),
      },
    }));
  },

  addNodalLoad: (load) => {
    const id = generateId();
    set((s) => ({
      model: {
        ...s.model,
        nodalLoads: [
          ...s.model.nodalLoads,
          { ...load, id, loadCaseId: load.loadCaseId ?? getActiveLoadCaseId(s.model) },
        ],
      },
      isResultStale: true,
    }));
    return id;
  },

  updateNodalLoad: (id, updates) => {
    set((s) => ({
      model: {
        ...s.model,
        nodalLoads: s.model.nodalLoads.map((l) =>
          l.id === id ? { ...l, ...updates } : l
        ),
      },
      isResultStale: true,
    }));
  },

  removeNodalLoad: (id) => {
    set((s) => ({
      model: {
        ...s.model,
        nodalLoads: s.model.nodalLoads.filter((l) => l.id !== id),
      },
      isResultStale: true,
    }));
  },

  addMemberLoad: (load) => {
    const id = generateId();
    set((s) => ({
      model: {
        ...s.model,
        memberLoads: [
          ...s.model.memberLoads,
          { ...load, id, loadCaseId: load.loadCaseId ?? getActiveLoadCaseId(s.model) } as MemberLoad,
        ],
      },
      isResultStale: true,
    }));
    return id;
  },

  updateMemberLoad: (id, updates) => {
    set((s) => ({
      model: {
        ...s.model,
        memberLoads: s.model.memberLoads.map((l) =>
          l.id === id ? { ...l, ...updates } as MemberLoad : l
        ),
      },
      isResultStale: true,
    }));
  },

  replaceMemberLoad: (id, load) => {
    set((s) => ({
      model: {
        ...s.model,
        memberLoads: s.model.memberLoads.map((item) =>
          item.id === id ? { ...load, id } as MemberLoad : item
        ),
      },
      isResultStale: true,
    }));
  },

  removeMemberLoad: (id) => {
    set((s) => ({
      model: {
        ...s.model,
        memberLoads: s.model.memberLoads.filter((l) => l.id !== id),
      },
      isResultStale: true,
    }));
  },

  addLoadCase: (name) => {
    const id = generateId();
    set((s) => ({
      model: {
        ...s.model,
        loadCases: [...getLoadCases(s.model), { id, name: name ?? 'New Case' }],
        loadCombinations: getLoadCombinations(s.model).map((combo) => ({
          ...combo,
          factors: [...combo.factors, { loadCaseId: id, factor: 0 }],
        })),
        activeLoadCaseId: id,
        activeLoadCombinationId: null,
      },
      isResultStale: true,
    }));
    return id;
  },

  updateLoadCase: (id, updates) => {
    set((s) => ({
      model: {
        ...s.model,
        loadCases: getLoadCases(s.model).map((loadCase) =>
          loadCase.id === id ? { ...loadCase, ...updates } : loadCase
        ),
      },
      isResultStale: true,
    }));
  },

  removeLoadCase: (id) => {
    set((s) => {
      const cases = getLoadCases(s.model);
      if (cases.length <= 1) return {};
      const remainingCases = cases.filter((loadCase) => loadCase.id !== id);
      const fallbackId = remainingCases[0]!.id;
      const combinations = getLoadCombinations(s.model).map((combo) => ({
        ...combo,
        factors: combo.factors.filter((factor) => factor.loadCaseId !== id),
      }));
      const nextActiveCombinationId = s.model.activeLoadCombinationId &&
        combinations.some((combo) => combo.id === s.model.activeLoadCombinationId)
        ? s.model.activeLoadCombinationId
        : null;
      const nextActiveLoadCaseId = s.model.activeLoadCaseId &&
        s.model.activeLoadCaseId !== id
        ? s.model.activeLoadCaseId
        : fallbackId;

      return {
        model: {
          ...s.model,
          loadCases: remainingCases,
          activeLoadCaseId: nextActiveLoadCaseId,
          activeLoadCombinationId: nextActiveCombinationId,
          loadCombinations: combinations,
          nodalLoads: s.model.nodalLoads.map((load) =>
            load.loadCaseId === id ? { ...load, loadCaseId: fallbackId } : load
          ),
          memberLoads: s.model.memberLoads.map((load) =>
            load.loadCaseId === id ? { ...load, loadCaseId: fallbackId } as MemberLoad : load
          ),
        },
        isResultStale: true,
      };
    });
  },

  setActiveLoadCase: (id) => {
    set((s) => ({
      model: {
        ...s.model,
        activeLoadCaseId: id,
        activeLoadCombinationId: null,
      },
      isResultStale: true,
    }));
  },

  addLoadCombination: (name) => {
    const id = generateId();
    set((s) => ({
      model: {
        ...s.model,
        loadCombinations: [
          ...getLoadCombinations(s.model),
          {
            id,
            name: name ?? 'New Combination',
            factors: getLoadCases(s.model).map((loadCase) => ({
              loadCaseId: loadCase.id,
              factor: loadCase.id === getActiveLoadCaseId(s.model) ? 1 : 0,
            })),
          },
        ],
        activeLoadCombinationId: id,
      },
      isResultStale: true,
    }));
    return id;
  },

  updateLoadCombination: (id, updates) => {
    set((s) => ({
      model: {
        ...s.model,
        loadCombinations: getLoadCombinations(s.model).map((combo) =>
          combo.id === id ? { ...combo, ...updates } : combo
        ),
      },
      isResultStale: true,
    }));
  },

  removeLoadCombination: (id) => {
    set((s) => ({
      model: {
        ...s.model,
        loadCombinations: getLoadCombinations(s.model).filter((combo) => combo.id !== id),
        activeLoadCombinationId: s.model.activeLoadCombinationId === id
          ? null
          : s.model.activeLoadCombinationId ?? null,
      },
      isResultStale: true,
    }));
  },

  setActiveLoadCombination: (id) => {
    set((s) => ({
      model: {
        ...s.model,
        activeLoadCombinationId: id,
      },
      isResultStale: true,
    }));
  },

  addCoupling: (c) => {
    const id = generateId();
    set((s) => ({
      model: {
        ...s.model,
        couplings: [...(s.model.couplings ?? []), { ...c, id }],
      },
      isResultStale: true,
    }));
    return id;
  },

  updateCoupling: (id, updates) => {
    set((s) => ({
      model: {
        ...s.model,
        couplings: (s.model.couplings ?? []).map((c) =>
          c.id === id ? { ...c, ...updates } : c
        ),
      },
      isResultStale: true,
    }));
  },

  removeCoupling: (id) => {
    set((s) => ({
      model: {
        ...s.model,
        couplings: (s.model.couplings ?? []).filter((c) => c.id !== id),
      },
      isResultStale: true,
    }));
  },

  setAnalyzing: (v) => set({ isAnalyzing: v }),

  setAnalysisResult: (resp) => {
    if (resp.type === 'analyze-all-success') {
      set((s) => {
        const preferredTargetId = s.model.activeLoadCombinationId
          ?? getActiveLoadCaseId(s.model);
        const selected = resp.results.find((result) => result.target.id === preferredTargetId)
          ?? resp.results[0];
        return {
          analysisResult: selected ? targetResultToAnalysisResult(selected) : null,
          analysisResults: resp.results,
          analysisEnvelope: resp.envelope,
          analysisFactorizationCount: resp.factorizationCount,
          analysisResultView: selected
            ? { kind: 'target' as const, targetId: selected.target.id }
            : null,
          analysisError: null,
          isAnalyzing: false,
          isResultStale: false,
        };
      });
    } else if (resp.type === 'analyze-success') {
      set({
        analysisResult: {
          displacements: resp.displacements,
          reactions: resp.reactions,
          elementEndForces: resp.elementEndForces,
          diagrams: resp.diagrams,
          warnings: resp.warnings,
        },
        analysisResults: [],
        analysisEnvelope: null,
        analysisFactorizationCount: null,
        analysisResultView: null,
        analysisError: null,
        isAnalyzing: false,
        isResultStale: false,
      });
    } else {
      set({
        analysisResult: null,
        analysisResults: [],
        analysisEnvelope: null,
        analysisFactorizationCount: null,
        analysisResultView: null,
        analysisError: resp.error,
        isAnalyzing: false,
        isResultStale: false,
      });
    }
  },

  selectAnalysisResultView: (view) => {
    set((s) => {
      if (view.kind === 'envelope') return { analysisResultView: view };
      const selected = s.analysisResults.find((result) => result.target.id === view.targetId);
      if (!selected) return {};
      return {
        analysisResult: targetResultToAnalysisResult(selected),
        analysisResultView: view,
      };
    });
  },

  markResultStale: () => set({ isResultStale: true }),

  setAnalysisMode: (mode) => {
    const target2dConfig = get2dModeConfig(mode);
    if (target2dConfig) {
      const offPlaneNodes = findNodesOffAnalysisPlane(get().model, mode);
      if (offPlaneNodes.length > 0) {
        const nodeIds = offPlaneNodes.map((node) => node.id);
        return {
          ok: false,
          code: 'off-plane-nodes',
          mode: target2dConfig.mode,
          nodeIds,
        };
      }
    }

    if (getAnalysisMode(get().model) === mode) return { ok: true };

    set((s) => ({
      model: { ...s.model, analysisMode: mode },
      isResultStale: true,
    }));
    return { ok: true };
  },

  flattenNodesTo2dPlane: (mode) => {
    const targetMode = mode ?? getAnalysisMode(get().model);
    const config = get2dModeConfig(targetMode);
    if (!config) return [];
    const offPlaneNodeIds = findNodesOffAnalysisPlane(get().model, targetMode).map((node) => node.id);
    if (offPlaneNodeIds.length === 0) return [];

    set((s) => ({
      model: {
        ...s.model,
        nodes: s.model.nodes.map((node) =>
          offPlaneNodeIds.includes(node.id)
            ? { ...node, [config.lockedCoordinate]: 0 }
            : node
        ),
      },
      isResultStale: true,
    }));

    return offPlaneNodeIds;
  },

  flattenNodesToXzPlane: () => get().flattenNodesTo2dPlane('xz2d'),

  loadModel: (model) => set((s) => replacementState(model, s.fitViewVersion)),

  importFrameJson: (text, loadCaseIndex) => {
    const report = importJsonTextAuto(text, loadCaseIndex);
    set((s) => replacementState(report.model, s.fitViewVersion, report));
    return report;
  },

  importJsonAuto: (text) => {
    const report = importJsonTextAuto(text);
    set((s) => replacementState(report.model, s.fitViewVersion, report));
    return report;
  },

  clearImportReport: () => set({ lastImportReport: null }),
  setImportReport: (report) => set({ lastImportReport: report }),

  resetModel: () => set((s) => replacementState(createDefaultModel(), s.fitViewVersion)),

  updateUnits: (updates) => {
    set((s) => ({
      model: {
        ...s.model,
        units: { ...s.model.units, ...updates },
      },
      isResultStale: true,
    }));
  },

  updateGravity: (updates) => {
    set((s) => ({
      model: {
        ...s.model,
        gravity: { ...(s.model.gravity ?? { x: 0, y: 0, z: 0 }), ...updates },
      },
      isResultStale: true,
    }));
  },
}), {
  partialize: (state): ProjectHistoryState => ({ model: state.model }),
  equality: (past, current) => past.model === current.model,
  limit: 100,
}));

export const useProjectHistory = <T,>(
  selector: (state: TemporalState<ProjectHistoryState>) => T,
): T => useStore(useProjectStore.temporal, selector);

function afterHistoryNavigation(): void {
  useProjectStore.setState({
    isResultStale: true,
    analysisError: null,
  });
}

export function undoProject(): void {
  useProjectStore.temporal.getState().undo();
  afterHistoryNavigation();
}

export function redoProject(): void {
  useProjectStore.temporal.getState().redo();
  afterHistoryNavigation();
}
