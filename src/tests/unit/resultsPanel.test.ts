import { describe, expect, it } from 'vitest';
import type { CouplingConstraint, ProjectModel, Restraint } from '../../core/model/types';
import { buildEffectiveReactionRows } from '../../ui/tables/reactionRows';

const FREE: Restraint = { ux: false, uy: false, uz: false, rx: false, ry: false, rz: false };

function createBaseModel(): ProjectModel {
  return {
    title: 'Test',
    nodes: [],
    materials: [],
    sections: [],
    springs: [],
    members: [],
    couplings: [],
    nodalLoads: [],
    memberLoads: [],
    units: { force: 'kN', length: 'm', moment: 'kN·m' },
  };
}

function uxCoupling(id: string, masterNodeId: string, slaveNodeId: string): CouplingConstraint {
  return {
    id,
    masterNodeId,
    slaveNodeId,
    ux: true,
    uy: false,
    uz: false,
    rx: false,
    ry: false,
    rz: false,
  };
}

describe('buildEffectiveReactionRows', () => {
  it('shows a shared coupled reaction only once for multi-slave support groups', () => {
    const model = createBaseModel();
    model.nodes = [
      { id: 'master', x: 0, y: 0, z: 0, restraint: FREE },
      { id: 'slave1', x: 1, y: 0, z: 0, restraint: { ...FREE, ux: true } },
      { id: 'slave2', x: 2, y: 0, z: 0, restraint: { ...FREE, ux: true } },
    ];
    model.couplings = [
      { id: 'c1', masterNodeId: 'master', slaveNodeId: 'slave1', ux: true, uy: false, uz: false, rx: false, ry: false, rz: false },
      { id: 'c2', masterNodeId: 'master', slaveNodeId: 'slave2', ux: true, uy: false, uz: false, rx: false, ry: false, rz: false },
    ];

    const reactions = new Array(model.nodes.length * 6).fill(0);
    reactions[0] = 12.34;

    const { rows, hasSharedReactions, hasInvalidCouplings } = buildEffectiveReactionRows(model, reactions);

    expect(hasSharedReactions).toBe(true);
    expect(hasInvalidCouplings).toBe(false);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.cells[0]).toEqual({
      value: 12.34,
      isShared: true,
      isRepresentative: true,
    });
    expect(rows[1]!.cells[0]).toEqual({
      value: null,
      isShared: true,
      isRepresentative: false,
    });
  });

  it('shows auto-fixed out-of-plane reactions in X-Z 2D mode', () => {
    const model = createBaseModel();
    model.analysisMode = 'xz2d';
    model.nodes = [
      { id: 'free2d', x: 0, y: 0, z: 0, restraint: FREE },
    ];

    const reactions = new Array(model.nodes.length * 6).fill(0);
    reactions[1] = 1.1; // uy
    reactions[3] = 3.3; // rx
    reactions[5] = 5.5; // rz

    const { rows, hasSharedReactions } = buildEffectiveReactionRows(model, reactions);

    expect(hasSharedReactions).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.cells[1]).toEqual({
      value: 1.1,
      isShared: false,
      isRepresentative: true,
    });
    expect(rows[0]!.cells[3]).toEqual({
      value: 3.3,
      isShared: false,
      isRepresentative: true,
    });
    expect(rows[0]!.cells[5]).toEqual({
      value: 5.5,
      isShared: false,
      isRepresentative: true,
    });
  });

  it('shows member twist-restraint reactions', () => {
    const model = createBaseModel();
    model.nodes = [
      { id: 'n0', x: 0, y: 0, z: 0, restraint: FREE },
      { id: 'n1', x: 4, y: 0, z: 0, restraint: FREE },
    ];
    model.members = [
      {
        id: 'm1',
        ni: 'n0',
        nj: 'n1',
        sectionId: 'sec1',
        codeAngle: 0,
        iSprings: { x: 0, y: 0, z: 0 },
        jSprings: { x: 0, y: 0, z: 0 },
        torsionRestraint: 'i',
      },
    ];

    const reactions = new Array(model.nodes.length * 6).fill(0);
    reactions[3] = -12;

    const { rows } = buildEffectiveReactionRows(model, reactions);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.nodeId).toBe('n0');
    expect(rows[0]!.cells[3]).toEqual({
      value: -12,
      isShared: false,
      isRepresentative: true,
    });
  });

  it.each([
    {
      name: 'missing master node',
      nodes: [
        { id: 'slave', x: 0, y: 0, z: 0, restraint: { ...FREE, ux: true } },
      ],
      couplings: [uxCoupling('c1', 'missing', 'slave')],
      expectedValues: [10],
    },
    {
      name: 'missing slave node',
      nodes: [
        { id: 'master', x: 0, y: 0, z: 0, restraint: { ...FREE, ux: true } },
      ],
      couplings: [uxCoupling('c1', 'master', 'missing')],
      expectedValues: [10],
    },
    {
      name: 'self coupling',
      nodes: [
        { id: 'node', x: 0, y: 0, z: 0, restraint: { ...FREE, ux: true } },
      ],
      couplings: [uxCoupling('c1', 'node', 'node')],
      expectedValues: [10],
    },
    {
      name: 'duplicate slave DOF',
      nodes: [
        { id: 'master1', x: 0, y: 0, z: 0, restraint: FREE },
        { id: 'master2', x: 1, y: 0, z: 0, restraint: FREE },
        { id: 'slave', x: 2, y: 0, z: 0, restraint: { ...FREE, ux: true } },
      ],
      couplings: [
        uxCoupling('c1', 'master1', 'slave'),
        uxCoupling('c2', 'master2', 'slave'),
      ],
      expectedValues: [30],
    },
    {
      name: 'coupling cycle',
      nodes: [
        { id: 'a', x: 0, y: 0, z: 0, restraint: { ...FREE, ux: true } },
        { id: 'b', x: 1, y: 0, z: 0, restraint: { ...FREE, ux: true } },
      ],
      couplings: [
        uxCoupling('c1', 'a', 'b'),
        uxCoupling('c2', 'b', 'a'),
      ],
      expectedValues: [10, 20],
    },
  ])('falls back to per-node reactions without throwing for $name', ({ nodes, couplings, expectedValues }) => {
    const model = createBaseModel();
    model.nodes = nodes;
    model.couplings = couplings;
    const reactions = new Array(model.nodes.length * 6).fill(0);
    for (let nodeIndex = 0; nodeIndex < model.nodes.length; nodeIndex++) {
      reactions[nodeIndex * 6] = (nodeIndex + 1) * 10;
    }

    const result = buildEffectiveReactionRows(model, reactions);

    expect(result.hasInvalidCouplings).toBe(true);
    expect(result.hasSharedReactions).toBe(false);
    expect(result.rows.map((row) => row.cells[0]!.value)).toEqual(expectedValues);
    expect(result.rows.every((row) => row.cells[0]!.isRepresentative)).toBe(true);
  });
});
