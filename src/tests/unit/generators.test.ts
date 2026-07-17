import { describe, expect, it } from 'vitest';
import { analyzeFrame } from '../../core/analysis/analyzeFrame';
import {
  generateCantileverTemplate,
  generateContinuousBeamTemplate,
  generateGridFrame,
  generatePortalFrameTemplate,
  generateSingleBay3dFrameTemplate,
  generateTemplateModel,
  MODEL_TEMPLATE_KINDS,
  type GeneratorCatalogOptions,
} from '../../core/model/generators';
import { buildIndexedModel } from '../../core/model/indexing';
import type { ProjectModel } from '../../core/model/types';
import { validateModel } from '../../core/model/validation';

function catalog(): GeneratorCatalogOptions {
  return {
    materials: [{
      id: 'steel',
      name: 'Steel',
      E: 20500,
      G: 7900,
      nu: 0.3,
      expansion: 0.000012,
    }],
    sections: [
      {
        id: 'column',
        name: 'Column',
        materialId: 'steel',
        A: 100,
        Ix: 1000,
        Iy: 5000,
        Iz: 5000,
        ky: 0.5,
        kz: 0.5,
      },
      {
        id: 'beam',
        name: 'Beam',
        materialId: 'steel',
        A: 80,
        Ix: 600,
        Iy: 3000,
        Iz: 1000,
        ky: 0.5,
        kz: 0.5,
      },
    ],
    columnSectionId: 'column',
    beamSectionId: 'beam',
    units: { force: 'kN', length: 'cm', moment: 'kN·cm' },
  };
}

function expectSequentialDisplayNumbers(model: ProjectModel): void {
  expect(model.nodes.map((node) => node.number)).toEqual(
    Array.from({ length: model.nodes.length }, (_, index) => index + 1),
  );
  expect(model.members.map((member) => member.number)).toEqual(
    Array.from({ length: model.members.length }, (_, index) => index + 1),
  );
}

function expectAnalysisReady(model: ProjectModel): void {
  expect(validateModel(model)).toEqual([]);
  const result = analyzeFrame({ model: buildIndexedModel(model) });
  expect(Array.from(result.displacements).every(Number.isFinite)).toBe(true);
  expect(Array.from(result.reactions).every(Number.isFinite)).toBe(true);
}

describe('grid frame generator', () => {
  it('generates deterministic coordinates, connectivity, sections and fixed bases', () => {
    const inputCatalog = catalog();
    const inputSnapshot = JSON.stringify(inputCatalog);
    const model = generateGridFrame({
      ...inputCatalog,
      title: '2 by 1, two-storey frame',
      xSpans: [300, 400],
      ySpans: [500],
      storyHeights: [300, 350],
    });

    expect(model.title).toBe('2 by 1, two-storey frame');
    expect(model.analysisMode).toBe('3d');
    expect(model.nodes).toHaveLength(18);
    expect(model.members).toHaveLength(26);
    expect(model.nodes[0]).toMatchObject({ id: 'n1', number: 1, x: 0, y: 0, z: 0 });
    expect(model.nodes[2]).toMatchObject({ id: 'n3', x: 700, y: 0, z: 0 });
    expect(model.nodes[3]).toMatchObject({ id: 'n4', x: 0, y: 500, z: 0 });
    expect(model.nodes[6]).toMatchObject({ id: 'n7', x: 0, y: 0, z: 300 });
    expect(model.nodes[17]).toMatchObject({ id: 'n18', x: 700, y: 500, z: 650 });

    expect(model.nodes.slice(0, 6).every((node) => Object.values(node.restraint).every(Boolean))).toBe(true);
    expect(model.nodes.slice(6).every((node) => Object.values(node.restraint).every((value) => !value))).toBe(true);
    expect(model.members.filter((member) => member.sectionId === 'column')).toHaveLength(12);
    expect(model.members.filter((member) => member.sectionId === 'beam')).toHaveLength(14);
    expect(model.members[0]).toMatchObject({ id: 'm1', ni: 'n1', nj: 'n7', sectionId: 'column' });
    expect(model.members[6]).toMatchObject({ id: 'm7', ni: 'n7', nj: 'n8', sectionId: 'beam' });
    expect(model.members[10]).toMatchObject({ id: 'm11', ni: 'n7', nj: 'n10', sectionId: 'beam' });

    const nodeIds = new Set(model.nodes.map((node) => node.id));
    expect(model.members.every((member) => nodeIds.has(member.ni) && nodeIds.has(member.nj))).toBe(true);
    expectSequentialDisplayNumbers(model);
    expect(JSON.stringify(inputCatalog)).toBe(inputSnapshot);
    expectAnalysisReady(model);
  });

  it('copies the supplied catalog and units instead of aliasing caller state', () => {
    const inputCatalog = catalog();
    const model = generateGridFrame({
      ...inputCatalog,
      xSpans: [100],
      ySpans: [200],
      storyHeights: [300],
    });

    model.materials[0]!.name = 'Changed';
    model.sections[0]!.name = 'Changed';
    model.units.length = 'm';
    expect(inputCatalog.materials[0]!.name).toBe('Steel');
    expect(inputCatalog.sections[0]!.name).toBe('Column');
    expect(inputCatalog.units?.length).toBe('cm');
  });

  it('rejects invalid grids and inconsistent catalogs', () => {
    const valid = catalog();
    const generate = (overrides: Partial<Parameters<typeof generateGridFrame>[0]>) => (
      generateGridFrame({
        ...valid,
        xSpans: [100],
        ySpans: [100],
        storyHeights: [100],
        ...overrides,
      })
    );

    expect(() => generate({ xSpans: [] })).toThrow(/xSpans/);
    expect(() => generate({ ySpans: [0] })).toThrow(/ySpans/);
    expect(() => generate({ storyHeights: [Number.NaN] })).toThrow(/storyHeights/);
    expect(() => generate({ columnSectionId: 'missing' })).toThrow(/Column section/);
    expect(() => generate({ sections: [{ ...valid.sections[0]!, materialId: 'missing' }] })).toThrow(
      /missing material/,
    );
    expect(() => generate({ materials: [valid.materials[0]!, valid.materials[0]!] })).toThrow(
      /Duplicate material/,
    );
  });
});

describe('built-in model templates', () => {
  it('generates an analysis-ready portal frame', () => {
    const model = generatePortalFrameTemplate();
    expect(model.analysisMode).toBe('xz2d');
    expect(model.nodes).toHaveLength(4);
    expect(model.members).toHaveLength(3);
    expect(model.nodalLoads).toHaveLength(1);
    expect(model.memberLoads).toHaveLength(1);
    expect(model.members.map((member) => member.sectionId)).toEqual([
      'sec-column',
      'sec-column',
      'sec-beam',
    ]);
    expectSequentialDisplayNumbers(model);
    expectAnalysisReady(model);
  });

  it('generates an analysis-ready cantilever', () => {
    const model = generateCantileverTemplate({ length: 250, tipLoad: -5 });
    expect(model.analysisMode).toBe('xz2d');
    expect(model.nodes).toHaveLength(2);
    expect(model.members).toHaveLength(1);
    expect(model.nodes[1]).toMatchObject({ x: 250, y: 0, z: 0 });
    expect(model.nodalLoads[0]).toMatchObject({ nodeId: 'n2', fz: -5 });
    expectSequentialDisplayNumbers(model);
    expectAnalysisReady(model);
  });

  it('generates an analysis-ready continuous beam with cumulative unequal spans', () => {
    const model = generateContinuousBeamTemplate({
      spanLengths: [300, 450, 350],
      uniformLoad: -0.1,
    });
    expect(model.analysisMode).toBe('xz2d');
    expect(model.nodes.map((node) => node.x)).toEqual([0, 300, 750, 1100]);
    expect(model.members).toHaveLength(3);
    expect(model.memberLoads).toHaveLength(3);
    expect(model.nodes[0]!.restraint).toMatchObject({ ux: true, uz: true, ry: false });
    expect(model.nodes.slice(1).every((node) => node.restraint.uz && !node.restraint.ux)).toBe(true);
    expectSequentialDisplayNumbers(model);
    expectAnalysisReady(model);
  });

  it('generates an analysis-ready one-bay 3D frame', () => {
    const model = generateSingleBay3dFrameTemplate({
      spanX: 500,
      spanY: 400,
      height: 300,
      lateralLoad: 20,
    });
    expect(model.analysisMode).toBe('3d');
    expect(model.nodes).toHaveLength(8);
    expect(model.members).toHaveLength(8);
    expect(model.nodes[7]).toMatchObject({ x: 500, y: 400, z: 300 });
    expect(model.nodalLoads[0]).toMatchObject({ nodeId: 'n8', fx: 20 });
    expectSequentialDisplayNumbers(model);
    expectAnalysisReady(model);
  });

  it('dispatches every named template deterministically', () => {
    expect(MODEL_TEMPLATE_KINDS).toEqual([
      'portal-frame',
      'cantilever',
      'continuous-beam',
      'single-bay-3d',
    ]);
    for (const kind of MODEL_TEMPLATE_KINDS) {
      expect(generateTemplateModel(kind)).toEqual(generateTemplateModel(kind));
    }
  });

  it('accepts a caller-supplied catalog and section selection', () => {
    const inputCatalog = catalog();
    const model = generatePortalFrameTemplate({
      ...inputCatalog,
      span: 700,
      height: 350,
    });

    expect(model.sections.map((section) => section.id)).toEqual(['column', 'beam']);
    expect(model.members.map((member) => member.sectionId)).toEqual(['column', 'column', 'beam']);
    expect(model.nodes[3]).toMatchObject({ x: 700, z: 350 });
  });

  it('rejects incomplete custom catalogs and invalid template dimensions', () => {
    expect(() => generatePortalFrameTemplate({ materials: catalog().materials })).toThrow(
      /supplied together/,
    );
    expect(() => generateCantileverTemplate({ length: 0 })).toThrow(/length/);
    expect(() => generateContinuousBeamTemplate({ spanLengths: [] })).toThrow(/spanLengths/);
    expect(() => generateSingleBay3dFrameTemplate({ spanY: Number.POSITIVE_INFINITY })).toThrow(
      /spanY/,
    );
  });
});
