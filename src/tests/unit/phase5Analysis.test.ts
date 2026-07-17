import { describe, expect, it } from 'vitest';
import { analyzeFrame } from '../../core/analysis/analyzeFrame';
import { analyzeAllLoadTargets } from '../../core/analysis/analyzeLoadTargets';
import { buildIndexedModel } from '../../core/model/indexing';
import { resolveAnalysisLoadModel } from '../../core/model/loadCases';
import type { ProjectModel } from '../../core/model/types';

const FIXED = { ux: true, uy: true, uz: true, rx: true, ry: true, rz: true };

function axialModel(): ProjectModel {
  return {
    title: 'Phase 5 axial bar',
    analysisMode: '3d',
    nodes: [
      { id: 'n1', x: 0, y: 0, z: 0, restraint: { ...FIXED } },
      {
        id: 'n2', x: 10, y: 0, z: 0,
        restraint: { ...FIXED, ux: false },
      },
    ],
    materials: [{
      id: 'mat', name: 'Test', E: 1000, G: 400, nu: 0.25,
      expansion: 1e-5, density: 2,
    }],
    sections: [{
      id: 'sec', name: 'Test', materialId: 'mat',
      A: 2, Ix: 1, Iy: 1, Iz: 1, ky: 1, kz: 1,
    }],
    springs: [],
    members: [{
      id: 'm1', ni: 'n1', nj: 'n2', sectionId: 'sec', codeAngle: 0,
      iSprings: { x: 0, y: 0, z: 0 }, jSprings: { x: 0, y: 0, z: 0 },
    }],
    couplings: [],
    nodeSprings: [],
    gravity: { x: 0, y: 0, z: -10 },
    loadCases: [
      { id: 'positive', name: 'Positive' },
      { id: 'negative', name: 'Negative' },
    ],
    loadCombinations: [{
      id: 'ultimate', name: 'Ultimate',
      factors: [
        { loadCaseId: 'positive', factor: 2 },
        { loadCaseId: 'negative', factor: 1 },
      ],
    }],
    activeLoadCaseId: 'positive',
    activeLoadCombinationId: null,
    nodalLoads: [
      { id: 'p', loadCaseId: 'positive', nodeId: 'n2', fx: 10, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 },
      { id: 'n', loadCaseId: 'negative', nodeId: 'n2', fx: -4, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 },
    ],
    memberLoads: [],
    units: { force: 'F', length: 'L', moment: 'F·L' },
  };
}

function analyzeActive(model: ProjectModel) {
  return analyzeFrame({ model: buildIndexedModel(resolveAnalysisLoadModel(model)) });
}

describe('Phase 5 analysis extensions', () => {
  it('factors once for all cases/combinations and records the component envelope', () => {
    const output = analyzeAllLoadTargets(axialModel());

    expect(output.factorizationCount).toBe(1);
    expect(output.results.map((result) => result.target.id)).toEqual([
      'positive', 'negative', 'ultimate',
    ]);
    expect(output.results[0]!.displacements[6]).toBeCloseTo(0.05, 10);
    expect(output.results[1]!.displacements[6]).toBeCloseTo(-0.02, 10);
    expect(output.results[2]!.displacements[6]).toBeCloseTo(0.08, 10);
    expect(output.envelope.displacements.min[6]).toBeCloseTo(-0.02, 10);
    expect(output.envelope.displacements.max[6]).toBeCloseTo(0.08, 10);
    expect(output.envelope.displacements.minTargetIds[6]).toBe('negative');
    expect(output.envelope.displacements.maxTargetIds[6]).toBe('ultimate');
  });

  it('adds nodal spring stiffness and reports the physical spring reaction', () => {
    const model = axialModel();
    model.nodeSprings = [{ id: 'support', nodeId: 'n2', ux: 200, uy: 0, uz: 0, rx: 0, ry: 0, rz: 0 }];
    const result = analyzeActive(model);

    expect(result.displacements[6]).toBeCloseTo(0.025, 10);
    expect(result.reactions[0]).toBeCloseTo(-5, 10);
    expect(result.reactions[6]).toBeCloseTo(-5, 10);
  });

  it('redirects a slave-node spring stiffness to its coupled master DOF', () => {
    const model = axialModel();
    model.nodes.push({
      id: 'spring-node', x: 20, y: 0, z: 0,
      restraint: { ...FIXED, ux: false },
    });
    model.couplings = [{
      id: 'tie', masterNodeId: 'n2', slaveNodeId: 'spring-node',
      ux: true, uy: false, uz: false, rx: false, ry: false, rz: false,
    }];
    model.nodeSprings = [{
      id: 'support', nodeId: 'spring-node',
      ux: 200, uy: 0, uz: 0, rx: 0, ry: 0, rz: 0,
    }];

    const result = analyzeActive(model);
    expect(result.displacements[6]).toBeCloseTo(0.025, 10);
    expect(result.displacements[12]).toBeCloseTo(0.025, 10);
    expect(result.reactions[12]).toBeCloseTo(-5, 10);
    expect(result.reactions[0]! + result.reactions[12]!).toBeCloseTo(-10, 10);
  });

  it('produces free thermal expansion and restrained thermal reactions', () => {
    const free = axialModel();
    free.nodalLoads = [];
    free.memberLoads = [{
      id: 'temperature', loadCaseId: 'positive', memberId: 'm1',
      type: 'temperature', direction: 'localX', value: 20,
    }];
    expect(analyzeActive(free).displacements[6]).toBeCloseTo(0.002, 10);

    const restrained = structuredClone(free);
    restrained.nodes[1]!.restraint.ux = true;
    const result = analyzeActive(restrained);
    expect(result.reactions[0]).toBeCloseTo(0.4, 10);
    expect(result.reactions[6]).toBeCloseTo(-0.4, 10);
  });

  it('projects global UDL and self-weight and preserves force equilibrium', () => {
    const model = axialModel();
    model.nodes[1] = {
      ...model.nodes[1]!, x: 6, y: 8, z: 0, restraint: { ...FIXED },
    };
    model.gravity = { x: 0, y: -10, z: 0 };
    model.nodalLoads = [];
    model.memberLoads = [
      { id: 'global', loadCaseId: 'positive', memberId: 'm1', type: 'udl', direction: 'globalY', value: -3 },
      { id: 'weight', loadCaseId: 'positive', memberId: 'm1', type: 'selfWeight', direction: 'globalY', value: 1 },
    ];
    const result = analyzeActive(model);

    // Global UDL contributes -30 and density*A*gravity contributes -400.
    expect(result.reactions[1]! + result.reactions[7]!).toBeCloseTo(430, 10);
    expect(result.reactions[0]! + result.reactions[6]!).toBeCloseTo(0, 10);
    expect(result.reactions[2]! + result.reactions[8]!).toBeCloseTo(0, 10);
  });

  it('warns on displacement relative to member length, even below the old absolute limit', () => {
    const model = axialModel();
    model.materials[0] = { ...model.materials[0]!, E: 1 };
    model.sections[0] = { ...model.sections[0]!, A: 1 };
    model.nodalLoads[0] = { ...model.nodalLoads[0]!, fx: 101 };

    const result = analyzeActive(model);
    expect(result.displacements[6]).toBeCloseTo(1_010, 10);
    expect(result.warnings[0]).toContain('代表長さ比');
  });
});
