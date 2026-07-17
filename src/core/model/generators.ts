import { SECTION_PRESETS } from './library';
import type {
  LoadCase,
  AnalysisMode,
  Material,
  Member,
  ProjectModel,
  Restraint,
  Section,
  StructuralNode,
} from './types';

export type ModelTemplateKind =
  | 'portal-frame'
  | 'cantilever'
  | 'continuous-beam'
  | 'single-bay-3d';

export const MODEL_TEMPLATE_KINDS: readonly ModelTemplateKind[] = [
  'portal-frame',
  'cantilever',
  'continuous-beam',
  'single-bay-3d',
];

export interface GeneratorCatalogOptions {
  materials: readonly Material[];
  sections: readonly Section[];
  columnSectionId: string;
  beamSectionId: string;
  units?: ProjectModel['units'];
}

export interface GridFrameOptions extends GeneratorCatalogOptions {
  /** Bay lengths along global X. */
  xSpans: readonly number[];
  /** Bay lengths along global Y. */
  ySpans: readonly number[];
  /** Storey heights along global Z. */
  storyHeights: readonly number[];
  title?: string;
}

export interface TemplateCatalogOptions {
  materials?: readonly Material[];
  sections?: readonly Section[];
  columnSectionId?: string;
  beamSectionId?: string;
  units?: ProjectModel['units'];
  title?: string;
}

export interface PortalFrameTemplateOptions extends TemplateCatalogOptions {
  span?: number;
  height?: number;
  lateralLoad?: number;
  beamUniformLoad?: number;
}

export interface CantileverTemplateOptions extends TemplateCatalogOptions {
  length?: number;
  tipLoad?: number;
}

export interface ContinuousBeamTemplateOptions extends TemplateCatalogOptions {
  spanLengths?: readonly number[];
  uniformLoad?: number;
}

export interface SingleBay3dTemplateOptions extends TemplateCatalogOptions {
  spanX?: number;
  spanY?: number;
  height?: number;
  lateralLoad?: number;
}

export type TemplateModelOptions = PortalFrameTemplateOptions
  & CantileverTemplateOptions
  & ContinuousBeamTemplateOptions
  & SingleBay3dTemplateOptions;

const DEFAULT_UNITS: ProjectModel['units'] = {
  force: 'kN',
  length: 'cm',
  moment: 'kN·cm',
};

const DEFAULT_LOAD_CASE: LoadCase = { id: 'lc1', name: 'Load Case 1' };

const FREE: Readonly<Restraint> = {
  ux: false,
  uy: false,
  uz: false,
  rx: false,
  ry: false,
  rz: false,
};

const FIXED: Readonly<Restraint> = {
  ux: true,
  uy: true,
  uz: true,
  rx: true,
  ry: true,
  rz: true,
};

const RIGID_END = { x: 0, y: 0, z: 0 } as const;

function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite number greater than zero (received ${value}).`);
  }
}

function validateLengths(name: string, lengths: readonly number[], allowEmpty = false): void {
  if (!allowEmpty && lengths.length === 0) {
    throw new RangeError(`${name} must contain at least one length.`);
  }
  lengths.forEach((length, index) => assertPositiveFinite(`${name}[${index}]`, length));
}

function cumulativeCoordinates(lengths: readonly number[]): number[] {
  const coordinates = [0];
  for (const length of lengths) {
    coordinates.push(coordinates[coordinates.length - 1]! + length);
  }
  return coordinates;
}

function cloneCatalog(catalog: GeneratorCatalogOptions): Pick<ProjectModel, 'materials' | 'sections' | 'units'> {
  if (catalog.materials.length === 0) {
    throw new RangeError('materials must contain at least one material.');
  }
  if (catalog.sections.length === 0) {
    throw new RangeError('sections must contain at least one section.');
  }

  const materialIds = new Set<string>();
  for (const material of catalog.materials) {
    if (materialIds.has(material.id)) {
      throw new RangeError(`Duplicate material id: ${material.id}.`);
    }
    materialIds.add(material.id);
  }

  const sectionIds = new Set<string>();
  for (const section of catalog.sections) {
    if (sectionIds.has(section.id)) {
      throw new RangeError(`Duplicate section id: ${section.id}.`);
    }
    if (!materialIds.has(section.materialId)) {
      throw new RangeError(
        `Section ${section.id} references missing material ${section.materialId}.`,
      );
    }
    sectionIds.add(section.id);
  }

  if (!sectionIds.has(catalog.columnSectionId)) {
    throw new RangeError(`Column section ${catalog.columnSectionId} was not found in sections.`);
  }
  if (!sectionIds.has(catalog.beamSectionId)) {
    throw new RangeError(`Beam section ${catalog.beamSectionId} was not found in sections.`);
  }

  return {
    materials: catalog.materials.map((material) => ({ ...material })),
    sections: catalog.sections.map((section) => ({ ...section })),
    units: { ...(catalog.units ?? DEFAULT_UNITS) },
  };
}

function createBaseModel(
  title: string,
  analysisMode: AnalysisMode,
  catalog: GeneratorCatalogOptions,
): ProjectModel {
  const clonedCatalog = cloneCatalog(catalog);
  return {
    title,
    analysisMode,
    nodes: [],
    materials: clonedCatalog.materials,
    sections: clonedCatalog.sections,
    springs: [],
    loadCases: [{ ...DEFAULT_LOAD_CASE }],
    loadCombinations: [],
    activeLoadCaseId: DEFAULT_LOAD_CASE.id,
    activeLoadCombinationId: null,
    members: [],
    couplings: [],
    nodalLoads: [],
    memberLoads: [],
    units: clonedCatalog.units,
  };
}

function makeNode(
  number: number,
  x: number,
  y: number,
  z: number,
  restraint: Readonly<Restraint>,
): StructuralNode {
  return { id: `n${number}`, number, x, y, z, restraint: { ...restraint } };
}

function makeMember(
  number: number,
  ni: string,
  nj: string,
  sectionId: string,
): Member {
  return {
    id: `m${number}`,
    number,
    ni,
    nj,
    sectionId,
    codeAngle: 0,
    iSprings: { ...RIGID_END },
    jSprings: { ...RIGID_END },
  };
}

/**
 * Generates a complete orthogonal space-frame model. Nodes are numbered level
 * by level (Z, then Y, then X). Members are numbered by storey: columns first,
 * followed by X beams and Y beams. Beams are generated only above the base.
 */
export function generateGridFrame(options: GridFrameOptions): ProjectModel {
  validateLengths('xSpans', options.xSpans);
  validateLengths('ySpans', options.ySpans);
  validateLengths('storyHeights', options.storyHeights);

  const model = createBaseModel(options.title ?? 'Grid Frame', '3d', options);
  const xs = cumulativeCoordinates(options.xSpans);
  const ys = cumulativeCoordinates(options.ySpans);
  const zs = cumulativeCoordinates(options.storyHeights);
  const nx = xs.length;
  const ny = ys.length;

  const nodeNumberAt = (level: number, yIndex: number, xIndex: number): number => (
    level * ny * nx + yIndex * nx + xIndex + 1
  );
  const nodeIdAt = (level: number, yIndex: number, xIndex: number): string => (
    `n${nodeNumberAt(level, yIndex, xIndex)}`
  );

  for (let level = 0; level < zs.length; level++) {
    for (let yIndex = 0; yIndex < ny; yIndex++) {
      for (let xIndex = 0; xIndex < nx; xIndex++) {
        const number = nodeNumberAt(level, yIndex, xIndex);
        model.nodes.push(makeNode(
          number,
          xs[xIndex]!,
          ys[yIndex]!,
          zs[level]!,
          level === 0 ? FIXED : FREE,
        ));
      }
    }
  }

  let memberNumber = 1;
  for (let level = 1; level < zs.length; level++) {
    // Columns between the current and preceding level.
    for (let yIndex = 0; yIndex < ny; yIndex++) {
      for (let xIndex = 0; xIndex < nx; xIndex++) {
        model.members.push(makeMember(
          memberNumber++,
          nodeIdAt(level - 1, yIndex, xIndex),
          nodeIdAt(level, yIndex, xIndex),
          options.columnSectionId,
        ));
      }
    }

    // X-direction beams at the current floor.
    for (let yIndex = 0; yIndex < ny; yIndex++) {
      for (let xIndex = 0; xIndex < nx - 1; xIndex++) {
        model.members.push(makeMember(
          memberNumber++,
          nodeIdAt(level, yIndex, xIndex),
          nodeIdAt(level, yIndex, xIndex + 1),
          options.beamSectionId,
        ));
      }
    }

    // Y-direction beams at the current floor.
    for (let xIndex = 0; xIndex < nx; xIndex++) {
      for (let yIndex = 0; yIndex < ny - 1; yIndex++) {
        model.members.push(makeMember(
          memberNumber++,
          nodeIdAt(level, yIndex, xIndex),
          nodeIdAt(level, yIndex + 1, xIndex),
          options.beamSectionId,
        ));
      }
    }
  }

  return model;
}

function defaultTemplateCatalog(): GeneratorCatalogOptions {
  const beamProperties = SECTION_PRESETS.find((preset) => preset.name === 'H-300x150x6.5x9')
    ?? SECTION_PRESETS[0]!;
  const columnProperties = SECTION_PRESETS.find((preset) => preset.name === 'H-200x200x8x12')
    ?? beamProperties;
  const materialId = 'mat1';
  return {
    materials: [{
      id: materialId,
      name: 'Steel SS400',
      E: 20500,
      G: 7900,
      nu: 0.3,
      expansion: 0.000012,
    }],
    sections: [
      { id: 'sec-column', materialId, ...columnProperties },
      { id: 'sec-beam', materialId, ...beamProperties },
    ],
    columnSectionId: 'sec-column',
    beamSectionId: 'sec-beam',
    units: { ...DEFAULT_UNITS },
  };
}

function resolveTemplateCatalog(options: TemplateCatalogOptions): GeneratorCatalogOptions {
  if (options.materials === undefined && options.sections === undefined) {
    const defaults = defaultTemplateCatalog();
    return {
      ...defaults,
      columnSectionId: options.columnSectionId ?? defaults.columnSectionId,
      beamSectionId: options.beamSectionId ?? defaults.beamSectionId,
      units: { ...(options.units ?? defaults.units ?? DEFAULT_UNITS) },
    };
  }

  if (options.materials === undefined || options.sections === undefined) {
    throw new RangeError('materials and sections must be supplied together.');
  }
  const firstSectionId = options.sections[0]?.id;
  if (firstSectionId === undefined) {
    throw new RangeError('sections must contain at least one section.');
  }
  return {
    materials: options.materials,
    sections: options.sections,
    columnSectionId: options.columnSectionId ?? firstSectionId,
    beamSectionId: options.beamSectionId ?? firstSectionId,
    units: { ...(options.units ?? DEFAULT_UNITS) },
  };
}

/** Generates a one-bay, one-storey planar moment frame in the global X-Z plane. */
export function generatePortalFrameTemplate(
  options: PortalFrameTemplateOptions = {},
): ProjectModel {
  const span = options.span ?? 600;
  const height = options.height ?? 400;
  const lateralLoad = options.lateralLoad ?? 10;
  const beamUniformLoad = options.beamUniformLoad ?? -0.08;
  assertPositiveFinite('span', span);
  assertPositiveFinite('height', height);
  if (!Number.isFinite(lateralLoad)) throw new RangeError('lateralLoad must be finite.');
  if (!Number.isFinite(beamUniformLoad)) throw new RangeError('beamUniformLoad must be finite.');

  const catalog = resolveTemplateCatalog(options);
  const model = createBaseModel(options.title ?? 'Portal Frame', 'xz2d', catalog);
  model.nodes = [
    makeNode(1, 0, 0, 0, FIXED),
    makeNode(2, span, 0, 0, FIXED),
    makeNode(3, 0, 0, height, FREE),
    makeNode(4, span, 0, height, FREE),
  ];
  model.members = [
    makeMember(1, 'n1', 'n3', catalog.columnSectionId),
    makeMember(2, 'n2', 'n4', catalog.columnSectionId),
    makeMember(3, 'n3', 'n4', catalog.beamSectionId),
  ];
  model.nodalLoads = [{
    id: 'nl1',
    loadCaseId: DEFAULT_LOAD_CASE.id,
    nodeId: 'n3',
    fx: lateralLoad,
    fy: 0,
    fz: 0,
    mx: 0,
    my: 0,
    mz: 0,
  }];
  model.memberLoads = [{
    id: 'ml1',
    loadCaseId: DEFAULT_LOAD_CASE.id,
    memberId: 'm3',
    type: 'udl',
    direction: 'localZ',
    value: beamUniformLoad,
  }];
  return model;
}

/** Generates a planar cantilever beam with a transverse tip load. */
export function generateCantileverTemplate(
  options: CantileverTemplateOptions = {},
): ProjectModel {
  const length = options.length ?? 400;
  const tipLoad = options.tipLoad ?? -10;
  assertPositiveFinite('length', length);
  if (!Number.isFinite(tipLoad)) throw new RangeError('tipLoad must be finite.');

  const catalog = resolveTemplateCatalog(options);
  const model = createBaseModel(options.title ?? 'Cantilever Beam', 'xz2d', catalog);
  model.nodes = [
    makeNode(1, 0, 0, 0, FIXED),
    makeNode(2, length, 0, 0, FREE),
  ];
  model.members = [makeMember(1, 'n1', 'n2', catalog.beamSectionId)];
  model.nodalLoads = [{
    id: 'nl1',
    loadCaseId: DEFAULT_LOAD_CASE.id,
    nodeId: 'n2',
    fx: 0,
    fy: 0,
    fz: tipLoad,
    mx: 0,
    my: 0,
    mz: 0,
  }];
  return model;
}

/** Generates a continuous beam with a pin at the first support and rollers thereafter. */
export function generateContinuousBeamTemplate(
  options: ContinuousBeamTemplateOptions = {},
): ProjectModel {
  const spanLengths = options.spanLengths ?? [400, 400, 400];
  const uniformLoad = options.uniformLoad ?? -0.05;
  validateLengths('spanLengths', spanLengths);
  if (!Number.isFinite(uniformLoad)) throw new RangeError('uniformLoad must be finite.');

  const catalog = resolveTemplateCatalog(options);
  const model = createBaseModel(options.title ?? 'Continuous Beam', 'xz2d', catalog);
  const xs = cumulativeCoordinates(spanLengths);
  model.nodes = xs.map((x, index) => makeNode(index + 1, x, 0, 0, {
    ...FREE,
    ux: index === 0,
    uz: true,
  }));
  model.members = spanLengths.map((_, index) => makeMember(
    index + 1,
    `n${index + 1}`,
    `n${index + 2}`,
    catalog.beamSectionId,
  ));
  model.memberLoads = model.members.map((member, index) => ({
    id: `ml${index + 1}`,
    loadCaseId: DEFAULT_LOAD_CASE.id,
    memberId: member.id,
    type: 'udl' as const,
    direction: 'localZ' as const,
    value: uniformLoad,
  }));
  return model;
}

/** Generates a fixed-base one-bay space frame with a lateral roof load. */
export function generateSingleBay3dFrameTemplate(
  options: SingleBay3dTemplateOptions = {},
): ProjectModel {
  const spanX = options.spanX ?? 600;
  const spanY = options.spanY ?? 600;
  const height = options.height ?? 400;
  const lateralLoad = options.lateralLoad ?? 10;
  assertPositiveFinite('spanX', spanX);
  assertPositiveFinite('spanY', spanY);
  assertPositiveFinite('height', height);
  if (!Number.isFinite(lateralLoad)) throw new RangeError('lateralLoad must be finite.');

  const catalog = resolveTemplateCatalog(options);
  const model = generateGridFrame({
    ...catalog,
    title: options.title ?? 'Single-Bay 3D Frame',
    xSpans: [spanX],
    ySpans: [spanY],
    storyHeights: [height],
  });
  const loadedNode = model.nodes[model.nodes.length - 1]!;
  model.nodalLoads = [{
    id: 'nl1',
    loadCaseId: DEFAULT_LOAD_CASE.id,
    nodeId: loadedNode.id,
    fx: lateralLoad,
    fy: 0,
    fz: 0,
    mx: 0,
    my: 0,
    mz: 0,
  }];
  return model;
}

/** Generates one of the four built-in, analysis-ready template models. */
export function generateTemplateModel(
  kind: ModelTemplateKind,
  options: TemplateModelOptions = {},
): ProjectModel {
  switch (kind) {
    case 'portal-frame':
      return generatePortalFrameTemplate(options);
    case 'cantilever':
      return generateCantileverTemplate(options);
    case 'continuous-beam':
      return generateContinuousBeamTemplate(options);
    case 'single-bay-3d':
      return generateSingleBay3dFrameTemplate(options);
  }
}
