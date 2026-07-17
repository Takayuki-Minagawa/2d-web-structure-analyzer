import { describe, expect, it } from 'vitest';
import { generateDiagram } from '../../core/analysis/diagrams';
import { computeElementEndForces } from '../../core/analysis/recover';
import { buildIndexedModel } from '../../core/model/indexing';
import type { CMQMemberLoad, ProjectModel, Restraint } from '../../core/model/types';

const FIXED: Restraint = {
  ux: true, uy: true, uz: true, rx: true, ry: true, rz: true,
};

describe('asymmetric CMQ diagram correction', () => {
  it('matches moy/moz at mid-span when end shears do not define the end-moment chord', () => {
    const model: ProjectModel = {
      title: 'Asymmetric CMQ',
      nodes: [
        { id: 'n0', x: 0, y: 0, z: 0, restraint: FIXED },
        { id: 'n1', x: 4, y: 0, z: 0, restraint: FIXED },
      ],
      materials: [
        { id: 'mat', name: 'Steel', E: 200e6, G: 80e6, nu: 0.25, expansion: 0 },
      ],
      sections: [{
        id: 'sec', name: 'Section', materialId: 'mat',
        A: 0.01, Ix: 1e-5, Iy: 2e-5, Iz: 3e-5, ky: 0.5, kz: 0.5,
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
    const cmq: CMQMemberLoad = {
      id: 'cmq', memberId: 'm1', type: 'cmq',
      iQx: 0, iQy: -2, iQz: 3, iMy: -10, iMz: -4,
      jQx: 0, jQy: 0.5, jQz: -1, jMy: 2, jMz: 1,
      moy: 15, moz: 7,
    };
    model.memberLoads = [cmq];

    const indexed = buildIndexedModel(model);
    const member = indexed.members[0]!;
    const displacements = new Float64Array(indexed.dofCount);
    const endForces = computeElementEndForces(member, displacements, [cmq]);
    const diagram = generateDiagram(member, endForces, [cmq], displacements);
    const midpoint = diagram.points.find((point) => point.x === member.L / 2);

    expect(midpoint).toBeDefined();
    expect(midpoint!.My).toBeCloseTo(cmq.moy, 12);
    expect(midpoint!.Mz).toBeCloseTo(cmq.moz, 12);
  });
});
