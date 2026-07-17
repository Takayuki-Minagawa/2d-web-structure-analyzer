import { describe, expect, it, vi } from 'vitest';
import sampleText from '../../../public/samples/FrameModel_Sample.json?raw';
import { buildIndexedModel } from '../../core/model/indexing';
import { validateModel } from '../../core/model/validation';
import { analyzeFrame } from '../../core/analysis/analyzeFrame';
import { resolveAnalysisLoadModel } from '../../core/model/loadCases';
import { convertFrameJsonWithReport } from '../../io/frameJsonConverter';
import { isFrameJsonFormat, parseFrameJson } from '../../io/frameJsonParser';
import { importJsonTextAuto } from '../../io/jsonImporter';

function createFrameJson(): Record<string, unknown> {
  const zeroNodeLoad = { p1: 0, p2: 0, p3: 0, m1: 0, m2: 0, m3: 0 };
  return {
    title: 'Test',
    loadCaseCount: 2,
    loadCaseIndex: 0,
    calcCaseMemo: ['CALCULATION-CASE', '1,Dead', '2,Live'],
    nodes: [
      {
        number: 1, x: 0, y: 0, z: 0, temperature: 0, intensityGroup: 0,
        longWeight: 0, forceWeight: 0, addForceWeight: 0, area: 0,
        loads: [zeroNodeLoad, zeroNodeLoad],
      },
      {
        number: 2, x: 100, y: 0, z: 0, temperature: 0, intensityGroup: 0,
        longWeight: 0, forceWeight: 0, addForceWeight: 0, area: 0,
        loads: [zeroNodeLoad, zeroNodeLoad],
      },
    ],
    members: [
      {
        number: 1, iNodeNumber: 1, jNodeNumber: 2,
        ixSpring: 0, iySpring: 0, izSpring: 0,
        jxSpring: 0, jySpring: 0, jzSpring: 0,
        sectionNumber: 1, p1: 0, p2: 0, p3: 0,
        memberLoads: [{
          lengthMethod: 0, type: 9, direction: 1, scale: 1,
          loadCode: 'unsupported', unitLoad: -1, p1: 0, p2: 0, p3: 0,
        }],
        cmqLoads: [],
      },
      {
        number: 2, iNodeNumber: 1, jNodeNumber: 99,
        ixSpring: 0, iySpring: 0, izSpring: 0,
        jxSpring: 0, jySpring: 0, jzSpring: 0,
        sectionNumber: 1, p1: 0, p2: 0, p3: 0,
        memberLoads: [], cmqLoads: [],
      },
    ],
    sections: [{
      number: 1, materialNumber: 1, type: 0, shape: 0,
      p1_A: 10, p2_Ix: 10, p3_Iy: 10, p4_Iz: 10,
      ky: 0, kz: 0, comment: '  ""  ',
    }],
    materials: [{
      number: 1, young: 20500, shear: 7900, expansion: 0,
      poisson: 0.3, unitLoad: 0, name: '  "Steel"  ',
    }],
    boundaries: [{
      nodeNumber: 1, deltaX: 2, deltaY: 1, deltaZ: 0,
      thetaX: 0, thetaY: 0, thetaZ: 0,
    }],
    springs: [],
    walls: [{
      number: 1, leftBottomNode: 1, rightBottomNode: 2,
      leftTopNode: 1, rightTopNode: 2, materialNumber: 1,
      method: 0, p1: 0, p2: 0, p3: 0, p4: 0,
    }],
  };
}

describe('FrameJson import reliability', () => {
  it('recognizes FrameJson when boundaries are omitted and parses auto-import JSON once', () => {
    const raw = createFrameJson();
    delete raw.boundaries;
    expect(isFrameJsonFormat(raw)).toBe(true);

    const parseSpy = vi.spyOn(JSON, 'parse');
    try {
      const result = importJsonTextAuto(JSON.stringify(raw));
      expect(result.summary.format).toBe('frame-json');
      expect(parseSpy).toHaveBeenCalledTimes(1);
    } finally {
      parseSpy.mockRestore();
    }
  });

  it('returns structured warnings without treating unsupported boundary codes as fixed', () => {
    const result = convertFrameJsonWithReport(parseFrameJson(createFrameJson()));
    const warningCodes = result.warnings.map((warning) => warning.code);

    expect(warningCodes).toEqual(expect.arrayContaining([
      'normalized-name',
      'unsupported-boundary-code',
      'missing-member-node',
      'unsupported-member-load-type',
      'walls-ignored',
    ]));
    expect(result.model.nodes[0]!.restraint.ux).toBe(false);
    expect(result.model.nodes[0]!.restraint.uy).toBe(true);
    expect(result.model.nodes[0]!.number).toBe(1);
    expect(result.model.members[0]!.number).toBe(1);
    expect(result.model.materials[0]!.name).toBe('Steel');
    expect(result.model.sections[0]!.name).toBe('Section 1');
    expect(result.summary.skippedMembers).toBe(1);
    expect(result.summary.ignoredWalls).toBe(1);
    expect(result.loadCases).toEqual([
      { index: 0, name: 'Dead', selected: true },
      { index: 1, name: 'Live', selected: false },
    ]);
    expect(result.model.loadCases).toEqual([{ id: 'lc-frame-1', name: 'Dead' }]);
    expect(result.model.activeLoadCaseId).toBe('lc-frame-1');
  });

  it('ships a sample that validates and completes an analysis', () => {
    const imported = importJsonTextAuto(sampleText);
    const analysisModel = resolveAnalysisLoadModel(imported.model);
    expect(validateModel(analysisModel)).toEqual([]);

    const result = analyzeFrame({ model: buildIndexedModel(analysisModel) });
    expect(result.displacements.length).toBe(imported.model.nodes.length * 6);
    expect(Array.from(result.displacements).every(Number.isFinite)).toBe(true);
  });
});
