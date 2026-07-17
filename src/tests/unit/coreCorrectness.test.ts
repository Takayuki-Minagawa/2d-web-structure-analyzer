import { describe, expect, it } from 'vitest';
import { analyzeFrame } from '../../core/analysis/analyzeFrame';
import { applyEndReleases, buildLocalStiffness } from '../../core/analysis/element3dFrame';
import { buildIndexedModel } from '../../core/model/indexing';
import type { ProjectModel, Restraint } from '../../core/model/types';
import { validateModel } from '../../core/model/validation';

const FREE: Restraint = {
  ux: false, uy: false, uz: false, rx: false, ry: false, rz: false,
};
const FIXED: Restraint = {
  ux: true, uy: true, uz: true, rx: true, ry: true, rz: true,
};

function createModel(): ProjectModel {
  return {
    title: 'Core correctness',
    nodes: [
      { id: 'n0', x: 0, y: 0, z: 0, restraint: FIXED },
      { id: 'n1', x: 4, y: 0, z: 0, restraint: FREE },
    ],
    materials: [
      { id: 'mat', name: 'Steel', E: 200e6, G: 80e6, nu: 0.25, expansion: 0 },
    ],
    sections: [{
      id: 'sec', name: 'Asymmetric', materialId: 'mat',
      A: 0.01, Ix: 1e-5, Iy: 1e-6, Iz: 4e-6, ky: 0, kz: 0,
    }],
    springs: [],
    members: [{
      id: 'm1', ni: 'n0', nj: 'n1', sectionId: 'sec', codeAngle: 0,
      iSprings: { x: 0, y: 0, z: 0 },
      jSprings: { x: 0, y: 0, z: 0 },
    }],
    couplings: [],
    nodalLoads: [],
    memberLoads: [],
    units: { force: 'kN', length: 'm', moment: 'kN·m' },
  };
}

function couplingOnlyModel(): ProjectModel {
  const model = createModel();
  model.nodes = [
    { id: 'A', x: 0, y: 0, z: 0, restraint: FIXED },
    { id: 'B', x: 1, y: 0, z: 0, restraint: FIXED },
    { id: 'C', x: 2, y: 0, z: 0, restraint: FIXED },
  ];
  model.members = [];
  return model;
}

const UX_ONLY = {
  ux: true, uy: false, uz: false, rx: false, ry: false, rz: false,
};

describe('coupling resolution', () => {
  it('path-compresses child-to-parent declarations independently of order', () => {
    const model = couplingOnlyModel();
    // C → B is intentionally declared before B → A.
    model.couplings = [
      { id: 'c-to-b', masterNodeId: 'B', slaveNodeId: 'C', ...UX_ONLY },
      { id: 'b-to-a', masterNodeId: 'A', slaveNodeId: 'B', ...UX_ONLY },
    ];

    const dofMap = buildIndexedModel(model).dofMap;
    expect(dofMap[0]).toBe(0);  // A ux
    expect(dofMap[6]).toBe(0);  // B ux → A ux
    expect(dofMap[12]).toBe(0); // C ux → B ux → A ux
  });

  it('rejects the same slave DOF being declared more than once', () => {
    const model = couplingOnlyModel();
    model.couplings = [
      { id: 'c1', masterNodeId: 'A', slaveNodeId: 'C', ...UX_ONLY },
      { id: 'c2', masterNodeId: 'B', slaveNodeId: 'C', ...UX_ONLY },
    ];

    expect(validateModel(model).some((error) => error.message.includes('重複してスレーブ')))
      .toBe(true);
    expect(() => buildIndexedModel(model)).toThrow('重複してスレーブ');
  });

  it('rejects master and slave referring to the same node', () => {
    const model = couplingOnlyModel();
    model.couplings = [
      { id: 'self', masterNodeId: 'A', slaveNodeId: 'A', ...UX_ONLY },
    ];

    expect(validateModel(model).some((error) => error.message.includes('同じ節点'))).toBe(true);
    expect(() => buildIndexedModel(model)).toThrow('同じ節点');
  });

  it('rejects a coupling cycle instead of looping forever', () => {
    const model = couplingOnlyModel();
    model.couplings = [
      { id: 'a-to-b', masterNodeId: 'B', slaveNodeId: 'A', ...UX_ONLY },
      { id: 'b-to-a', masterNodeId: 'A', slaveNodeId: 'B', ...UX_ONLY },
    ];

    expect(validateModel(model).some((error) => error.message.includes('循環'))).toBe(true);
    expect(() => buildIndexedModel(model)).toThrow('循環');
  });
});

describe('FrameModelMaker rotational springs', () => {
  it('uses kTheta for custom springs regardless of the opaque method code', () => {
    const model = createModel();
    model.springs = [
      { id: 's6', number: 6, method: 0, kTheta: 16_960 },
      { id: 's7', number: 7, method: 1, kTheta: 13_490 },
      { id: 's8', number: 8, method: 1, kTheta: 0 },
    ];
    model.members[0] = {
      ...model.members[0]!,
      iSprings: { x: 0, y: 6, z: 7 },
      jSprings: { x: 0, y: 0, z: 8 },
    };

    const releases = buildIndexedModel(model).members[0]!.releases;
    expect(releases[1]).toEqual({ type: 'spring', kTheta: 16_960 });
    expect(releases[2]).toEqual({ type: 'spring', kTheta: 13_490 });
    expect(releases[5]).toEqual({ type: 'pin', kTheta: 0 });
  });

  it('condenses a finite rotational spring with the expected series stiffness', () => {
    const model = createModel();
    const kTheta = 10_000;
    model.springs = [{ id: 's3', number: 3, method: 0, kTheta }];
    model.members[0] = {
      ...model.members[0]!,
      iSprings: { x: 0, y: 0, z: 3 },
    };
    const member = buildIndexedModel(model).members[0]!;
    const stiffness = buildLocalStiffness(member);
    const originalPivot = stiffness[5 * 12 + 5]!;

    applyEndReleases(stiffness, member.releases);

    expect(stiffness[5 * 12 + 5])
      .toBeCloseTo(kTheta * originalPivot / (originalPivot + kTheta), 10);
  });
});

describe('core validation edges', () => {
  it('rejects point-load positions outside the member span', () => {
    const model = createModel();
    model.memberLoads = [
      { id: 'before', memberId: 'm1', type: 'point', direction: 'localY', value: -1, a: -0.1 },
      { id: 'after', memberId: 'm1', type: 'point', direction: 'localY', value: -1, a: 4.1 },
    ];

    const errors = validateModel(model);
    expect(errors.some((error) => error.elementId === 'm1' && error.message.includes('before') && error.message.includes('範囲'))).toBe(true);
    expect(errors.some((error) => error.elementId === 'm1' && error.message.includes('after') && error.message.includes('範囲'))).toBe(true);
  });

  it('rejects duplicate IDs, non-finite coordinates and negative shear ratios', () => {
    const model = createModel();
    model.nodes[1] = { ...model.nodes[1]!, id: 'n0', x: Number.NaN };
    model.sections[0] = { ...model.sections[0]!, ky: -0.1 };

    const errors = validateModel(model);
    expect(errors.some((error) => error.message.includes('ID "n0" が重複'))).toBe(true);
    expect(errors.some((error) => error.message.includes('有限値ではありません'))).toBe(true);
    expect(errors.some((error) => error.message.includes('ky') && error.message.includes('非負値'))).toBe(true);
  });

  it('rejects a member reference to a missing custom spring number', () => {
    const model = createModel();
    model.members[0] = {
      ...model.members[0]!,
      iSprings: { x: 0, y: 0, z: 99 },
    };

    expect(validateModel(model).some((error) => error.message.includes('バネ番号 99'))).toBe(true);
    expect(() => buildIndexedModel(model)).toThrow('バネ番号 99');
  });
});

describe('3D code-angle and member-load regressions', () => {
  it('rotates the unequal Iy/Iz bending stiffness by 90 degrees', () => {
    const load = -1;
    const unrotated = createModel();
    unrotated.nodalLoads = [
      { id: 'tip', nodeId: 'n1', fx: 0, fy: load, fz: 0, mx: 0, my: 0, mz: 0 },
    ];
    const rotated = createModel();
    rotated.members[0] = { ...rotated.members[0]!, codeAngle: 90 };
    rotated.nodalLoads = [...unrotated.nodalLoads];

    const uy0 = analyzeFrame({ model: buildIndexedModel(unrotated) }).displacements[7]!;
    const uy90 = analyzeFrame({ model: buildIndexedModel(rotated) }).displacements[7]!;
    const { E } = unrotated.materials[0]!;
    const { Iy, Iz } = unrotated.sections[0]!;
    const length = 4;

    expect(uy0).toBeCloseTo(load * length ** 3 / (3 * E * Iz), 10);
    expect(uy90).toBeCloseTo(load * length ** 3 / (3 * E * Iy), 10);
    expect(Math.abs(uy90 / uy0)).toBeCloseTo(Iz / Iy, 10);
  });

  it('balances total reactions against a uniform member load', () => {
    const model = createModel();
    model.nodes[1] = { ...model.nodes[1]!, restraint: FIXED };
    model.memberLoads = [
      { id: 'udl', memberId: 'm1', type: 'udl', direction: 'localY', value: -10 },
    ];

    const reactions = analyzeFrame({ model: buildIndexedModel(model) }).reactions;
    expect(reactions[1]! + reactions[7]!).toBeCloseTo(40, 10);
  });
});
