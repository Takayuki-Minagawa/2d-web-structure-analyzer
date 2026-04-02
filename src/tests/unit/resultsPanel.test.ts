import { describe, expect, it } from 'vitest';
import type { ProjectModel, Restraint } from '../../core/model/types';
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

    const { rows, hasSharedReactions } = buildEffectiveReactionRows(model, reactions);

    expect(hasSharedReactions).toBe(true);
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
});
