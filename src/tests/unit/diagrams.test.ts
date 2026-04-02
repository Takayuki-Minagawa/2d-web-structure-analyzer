import { describe, expect, it } from 'vitest';
import { buildIndexedModel } from '../../core/model/indexing';
import { computeElementEndForces } from '../../core/analysis/recover';
import { generateDiagram } from '../../core/analysis/diagrams';
import type { ProjectModel, Restraint } from '../../core/model/types';

const FIXED: Restraint = { ux: true, uy: true, uz: true, rx: true, ry: true, rz: true };

function createBaseModel(): ProjectModel {
  return {
    title: 'Test',
    nodes: [],
    materials: [{ id: 'mat1', name: 'Steel', E: 200e6, G: 200e6 / (2 * 1.3), nu: 0.3, expansion: 0 }],
    sections: [{
      id: 'sec1', name: '10x10', materialId: 'mat1',
      A: 0.01, Ix: 8.333e-6, Iy: 8.333e-6, Iz: 8.333e-6, ky: 0.5, kz: 0.5,
    }],
    springs: [],
    members: [],
    couplings: [],
    nodalLoads: [],
    memberLoads: [],
    units: { force: 'kN', length: 'm', moment: 'kN·m' },
  };
}

describe('CMQ diagram moments', () => {
  it('preserves CMQ mid-span moments in the generated result diagram', () => {
    const model = createBaseModel();
    model.nodes = [
      { id: 'n0', x: 0, y: 0, z: 0, restraint: FIXED },
      { id: 'n1', x: 4, y: 0, z: 0, restraint: FIXED },
    ];
    model.members = [{
      id: 'm1',
      ni: 'n0',
      nj: 'n1',
      sectionId: 'sec1',
      codeAngle: 0,
      iSprings: { x: 0, y: 0, z: 0 },
      jSprings: { x: 0, y: 0, z: 0 },
    }];

    const cmqLoad = {
      id: 'cmq1',
      memberId: 'm1',
      type: 'cmq' as const,
      iQx: 0,
      iQy: 0,
      iQz: 0,
      iMy: -10,
      iMz: -4,
      jQx: 0,
      jQy: 0,
      jQz: 0,
      jMy: 10,
      jMz: 4,
      moy: 15,
      moz: 7,
    };
    model.memberLoads = [cmqLoad];

    const indexed = buildIndexedModel(model);
    const member = indexed.members[0]!;
    const globalDisplacements = new Float64Array(indexed.dofCount);
    const endForces = computeElementEndForces(member, globalDisplacements, [cmqLoad]);
    const diagram = generateDiagram(member, endForces, [cmqLoad], globalDisplacements);

    const midPoint = diagram.points.find((p) => Math.abs(p.x - member.L / 2) < 1e-12);
    expect(midPoint).toBeDefined();
    expect(midPoint!.My).toBeCloseTo(cmqLoad.moy, 8);
    expect(midPoint!.Mz).toBeCloseTo(cmqLoad.moz, 8);
  });
});
