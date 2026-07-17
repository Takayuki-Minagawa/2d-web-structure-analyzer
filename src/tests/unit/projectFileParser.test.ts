import { describe, expect, it } from 'vitest';
import legacyCantilever from '../../examples/cantilever.json?raw';
import {
  parseProjectFile,
  parseProjectFileText,
  ProjectFileValidationError,
} from '../../io/projectFileParser';

function createV2Project(): Record<string, unknown> {
  return {
    schemaVersion: 2,
    savedAt: '2026-07-17T00:00:00.000Z',
    model: {
      title: 'Native',
      analysisMode: '3d',
      nodes: [{
        id: 'n1', x: 0, y: 0, z: 0,
        restraint: { ux: true, uy: true, uz: true, rx: true, ry: true, rz: true },
      }],
      materials: [{ id: 'mat1', name: 'Steel', E: 20500, G: 7900, nu: 0.3, expansion: 0 }],
      sections: [{
        id: 'sec1', name: 'Section', materialId: 'mat1',
        A: 1, Ix: 1, Iy: 1, Iz: 1, ky: 0, kz: 0,
      }],
      springs: [],
      members: [],
      couplings: [],
      nodalLoads: [],
      memberLoads: [],
      units: { force: 'kN', length: 'cm', moment: 'kN·cm' },
    },
  };
}

describe('native project file parser', () => {
  it('migrates schema v1 data instead of discarding it', () => {
    const result = parseProjectFileText(legacyCantilever);

    expect(result.migratedFromSchemaVersion).toBe(1);
    expect(result.file.schemaVersion).toBe(2);
    expect(result.model.analysisMode).toBe('xy2d');
    expect(result.model.nodes[0]!.z).toBe(0);
    expect(result.model.nodes[0]!.restraint.rz).toBe(true);
    expect(result.model.materials[0]!.G).toBeGreaterThan(0);
    expect(result.model.sections[0]!.Iz).toBeGreaterThan(0);
    expect(result.model.members[0]!.iSprings).toEqual({ x: 0, y: 0, z: 0 });
    expect(result.warnings.map((warning) => warning.code)).toContain('schema-v1-migrated');
  });

  it('rejects malformed native model values at the import boundary', () => {
    const project = createV2Project();
    const model = project.model as { nodes: Array<Record<string, unknown>> };
    delete model.nodes[0]!.z;

    expect(() => parseProjectFile(project)).toThrow(ProjectFileValidationError);
    expect(() => parseProjectFile(project)).toThrow('model.nodes[0].z must be a finite number');
  });

  it('rejects unsupported future schema versions', () => {
    const project = createV2Project();
    project.schemaVersion = 99;
    expect(() => parseProjectFile(project)).toThrow('schemaVersion must be 1 or 2');
  });

  it('preserves Phase 5 material, support-spring, gravity and member-load fields', () => {
    const project = createV2Project();
    const model = project.model as Record<string, unknown>;
    (model.materials as Array<Record<string, unknown>>)[0]!.density = 7.85e-6;
    model.nodes = [
      ...(model.nodes as unknown[]),
      {
        id: 'n2', x: 100, y: 0, z: 0,
        restraint: { ux: false, uy: false, uz: false, rx: false, ry: false, rz: false },
      },
    ];
    model.members = [{
      id: 'm1', ni: 'n1', nj: 'n2', sectionId: 'sec1', codeAngle: 0,
      iSprings: { x: 0, y: 0, z: 0 }, jSprings: { x: 0, y: 0, z: 0 },
    }];
    model.nodeSprings = [{ id: 'ns1', nodeId: 'n2', ux: 10, uy: 20, uz: 30, rx: 1, ry: 2, rz: 3 }];
    model.gravity = { x: 0, y: 0, z: -980.665 };
    model.memberLoads = [
      { id: 'g1', memberId: 'm1', type: 'udl', direction: 'globalZ', value: -2 },
      { id: 't1', memberId: 'm1', type: 'temperature', direction: 'localX', value: 30 },
      { id: 's1', memberId: 'm1', type: 'selfWeight', direction: 'globalZ', value: 1 },
    ];

    const result = parseProjectFile(project);

    expect(result.model.materials[0]!.density).toBe(7.85e-6);
    expect(result.model.nodeSprings?.[0]).toMatchObject({ nodeId: 'n2', uz: 30 });
    expect(result.model.gravity).toEqual({ x: 0, y: 0, z: -980.665 });
    expect(result.model.memberLoads.map((load) => load.type)).toEqual([
      'udl', 'temperature', 'selfWeight',
    ]);
  });

  it('recovers undeclared load cases without reassigning loads or dropping combination factors', () => {
    const project = createV2Project();
    const model = project.model as Record<string, unknown>;
    model.loadCases = [{ id: 'dead', name: 'Dead' }];
    model.activeLoadCaseId = 'orphan';
    model.loadCombinations = [{
      id: 'ultimate',
      name: 'Ultimate',
      factors: [
        { loadCaseId: 'dead', factor: 1.2 },
        { loadCaseId: 'orphan', factor: 1.6 },
      ],
    }];
    model.nodalLoads = [{
      id: 'n-orphan', loadCaseId: 'orphan', nodeId: 'n1',
      fx: 1, fy: 0, fz: 0, mx: 0, my: 0, mz: 0,
    }];
    model.memberLoads = [{
      id: 'm-orphan', loadCaseId: 'orphan', memberId: 'missing-member',
      type: 'udl', direction: 'localY', value: -2,
    }];

    const result = parseProjectFile(project);

    expect(result.model.loadCases).toContainEqual({
      id: 'orphan',
      name: 'Recovered (orphan)',
    });
    expect(result.model.nodalLoads[0]!.loadCaseId).toBe('orphan');
    expect(result.model.memberLoads[0]!.loadCaseId).toBe('orphan');
    expect(result.model.loadCombinations?.[0]?.factors).toEqual([
      { loadCaseId: 'dead', factor: 1.2 },
      { loadCaseId: 'orphan', factor: 1.6 },
    ]);

    const warning = result.warnings.find(
      (candidate) => candidate.code === 'unknown-load-case-recovered'
    );
    expect(warning).toMatchObject({
      count: 4,
      itemIds: [
        'model.nodalLoads[0]',
        'model.memberLoads[0]',
        'model.loadCombinations[0].factors[1]',
        'model.activeLoadCaseId',
      ],
    });
    expect(warning?.message).toContain('loads were not reassigned');
    expect(warning?.message).toContain('combination factors were not removed');
  });

  it('keeps legacy v2 files without load-case fields on the implicit default case', () => {
    const project = createV2Project();
    const model = project.model as Record<string, unknown>;
    model.nodalLoads = [{
      id: 'legacy-load', nodeId: 'n1',
      fx: 1, fy: 0, fz: 0, mx: 0, my: 0, mz: 0,
    }];

    const result = parseProjectFile(project);

    expect(result.model.loadCases).toBeUndefined();
    expect(result.model.nodalLoads[0]!.loadCaseId).toBeUndefined();
    expect(result.warnings.some(
      (warning) => warning.code === 'unknown-load-case-recovered'
    )).toBe(false);
  });

  it('reports and resets an undeclared active load combination', () => {
    const project = createV2Project();
    const model = project.model as Record<string, unknown>;
    model.loadCases = [{ id: 'dead', name: 'Dead' }];
    model.loadCombinations = [{ id: 'service', name: 'Service', factors: [] }];
    model.activeLoadCombinationId = 'missing-combination';

    const result = parseProjectFile(project);

    expect(result.model.activeLoadCombinationId).toBeNull();
    expect(result.model.loadCombinations).toEqual([
      { id: 'service', name: 'Service', factors: [] },
    ]);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: 'unknown-active-load-combination-reset',
      count: 1,
      itemIds: ['model.activeLoadCombinationId'],
    }));
  });

  it('rejects duplicate and cross-kind load-target IDs at the import boundary', () => {
    const duplicateCases = createV2Project();
    (duplicateCases.model as Record<string, unknown>).loadCases = [
      { id: 'dead', name: 'Dead 1' },
      { id: 'dead', name: 'Dead 2' },
    ];
    expect(() => parseProjectFile(duplicateCases)).toThrow(
      'model.loadCases[1].id must be unique'
    );

    const duplicateCombinations = createV2Project();
    (duplicateCombinations.model as Record<string, unknown>).loadCombinations = [
      { id: 'ultimate', name: 'Ultimate 1', factors: [] },
      { id: 'ultimate', name: 'Ultimate 2', factors: [] },
    ];
    expect(() => parseProjectFile(duplicateCombinations)).toThrow(
      'model.loadCombinations[1].id must be unique'
    );

    const crossKindDuplicate = createV2Project();
    const crossKindModel = crossKindDuplicate.model as Record<string, unknown>;
    crossKindModel.loadCases = [{ id: 'same', name: 'Dead' }];
    crossKindModel.loadCombinations = [{ id: 'same', name: 'Combination', factors: [] }];
    expect(() => parseProjectFile(crossKindDuplicate)).toThrow(
      'model.loadCombinations[0].id must not reuse load-case ID "same"'
    );

    const recoveredCrossKindDuplicate = createV2Project();
    const recoveredCrossKindModel = recoveredCrossKindDuplicate.model as Record<string, unknown>;
    recoveredCrossKindModel.loadCases = [{ id: 'dead', name: 'Dead' }];
    recoveredCrossKindModel.loadCombinations = [{
      id: 'same', name: 'Combination', factors: [{ loadCaseId: 'same', factor: 1 }],
    }];
    expect(() => parseProjectFile(recoveredCrossKindDuplicate)).toThrow(
      'references undeclared load-case ID "same"'
    );
  });
});
