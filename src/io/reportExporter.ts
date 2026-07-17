import type {
  AnalysisError,
  AnalysisResult,
  AnalysisTarget,
  ProjectModel,
} from '../core/model/types';
import { getActiveLoadTargetName } from '../core/model/loadCases';
import { memberLabel, nodeLabel } from '../core/model/displayNumbers';
import { formatEngineering } from '../core/formatEngineering';
import type { SerializedAnalysisEnvelope } from '../worker/protocol';

export type ReportResultView =
  | {
      kind: 'target';
      target: AnalysisTarget;
    }
  | {
      kind: 'envelope';
      bound: 'min' | 'max';
      envelope: SerializedAnalysisEnvelope<number[]>;
      /** Maps governing target IDs in the component envelope to display names. */
      targetNames: Record<string, string>;
    };

export interface ReportInput {
  model: ProjectModel;
  result: AnalysisResult | null;
  /** The result view selected in the Results panel. */
  resultView?: ReportResultView;
  error: AnalysisError | null;
  generatedAt: Date;
  /** Must be supplied by state-aware callers to prevent exporting stale results. */
  isResultStale?: boolean;
  /** Optional composited 3D viewport screenshot for printable reports. */
  viewportImageDataUrl?: string;
}

export class StaleAnalysisResultError extends Error {
  constructor() {
    super('The analysis result is stale. Run the analysis again before exporting a report.');
    this.name = 'StaleAnalysisResultError';
  }
}

const DOF_LABELS = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
const REACTION_LABELS = ['Rx', 'Ry', 'Rz', 'Mx', 'My', 'Mz'];
const END_FORCE_LABELS = ['Ni', 'Vyi', 'Vzi', 'Mxi', 'Myi', 'Mzi', 'Nj', 'Vyj', 'Vzj', 'Mxj', 'Myj', 'Mzj'];

type EnvelopeGoverningTargets = {
  displacements: string[];
  reactions: string[];
  elementEndForces: Record<string, string[]>;
};

type ResolvedReportResult = {
  result: AnalysisResult;
  governingTargets: EnvelopeGoverningTargets | null;
};

export function generateMarkdownReport(input: ReportInput): string {
  assertReportExportable(input);
  const { model, error, generatedAt } = input;
  const resolvedResult = resolveReportResult(input);
  const result = resolvedResult?.result ?? null;
  const lines: string[] = [
    `# ${model.title || 'Frame Analysis Report'}`,
    '',
    `Generated: ${generatedAt.toISOString()}`,
    `Analysis target: ${reportTargetLabel(input)}`,
    '',
    '## Model',
    '',
    `- Nodes: ${model.nodes.length}`,
    `- Members: ${model.members.length}`,
    `- Materials: ${model.materials.length}`,
    `- Sections: ${model.sections.length}`,
    `- Nodal loads: ${model.nodalLoads.length}`,
    `- Member loads: ${model.memberLoads.length}`,
    `- Nodal springs: ${model.nodeSprings?.length ?? 0}`,
    '',
  ];

  if (error) {
    lines.push('## Analysis Error', '', error.message, '');
    return lines.join('\n');
  }

  lines.push(
    '## Input — Nodes', '',
    markdownTable(
      ['Node', `X [${model.units.length}]`, `Y [${model.units.length}]`, `Z [${model.units.length}]`, 'ux', 'uy', 'uz', 'rx', 'ry', 'rz'],
      model.nodes.map((node) => [nodeLabel(node), fmt(node.x), fmt(node.y), fmt(node.z), ...(['ux', 'uy', 'uz', 'rx', 'ry', 'rz'] as const).map((dof) => node.restraint[dof] ? 'fixed' : 'free')]),
    ),
    '', '## Input — Members', '',
    markdownTable(
      ['Member', 'i', 'j', 'Section', 'Code angle [deg]'],
      model.members.map((member) => [
        memberLabel(member),
        nodeLabel(model.nodes.find((node) => node.id === member.ni)),
        nodeLabel(model.nodes.find((node) => node.id === member.nj)),
        model.sections.find((section) => section.id === member.sectionId)?.name ?? member.sectionId,
        fmt(member.codeAngle),
      ]),
    ),
    '', '## Input — Materials', '',
    markdownTable(
      ['Name', 'E', 'G', 'nu', 'alpha', 'density'],
      model.materials.map((material) => [material.name, fmt(material.E), fmt(material.G), fmt(material.nu), fmt(material.expansion), fmt(material.density)]),
    ),
    '', '## Input — Sections', '',
    markdownTable(
      ['Name', 'Material', 'A', 'Ix', 'Iy', 'Iz', 'ky', 'kz'],
      model.sections.map((section) => [section.name, model.materials.find((material) => material.id === section.materialId)?.name ?? section.materialId, fmt(section.A), fmt(section.Ix), fmt(section.Iy), fmt(section.Iz), fmt(section.ky), fmt(section.kz)]),
    ),
    '', '## Input — Loads', '',
    markdownTable(
      ['Kind', 'Target', 'Case', 'Components'],
      [
        ...model.nodalLoads.map((load) => ['Nodal', nodeLabel(model.nodes.find((node) => node.id === load.nodeId)), loadCaseName(model, load.loadCaseId), `Fx=${fmt(load.fx)}, Fy=${fmt(load.fy)}, Fz=${fmt(load.fz)}, Mx=${fmt(load.mx)}, My=${fmt(load.my)}, Mz=${fmt(load.mz)}`]),
        ...model.memberLoads.map((load) => ['Member', memberLabel(model.members.find((member) => member.id === load.memberId)), loadCaseName(model, load.loadCaseId), memberLoadSummary(load)]),
      ],
    ),
    '', '## Input — Nodal Springs', '',
    markdownTable(
      ['Node', 'Kux', 'Kuy', 'Kuz', 'Krx', 'Kry', 'Krz'],
      nodalSpringRows(model),
    ),
    '', '## Input — Gravity', '',
    `- (${fmt(model.gravity?.x ?? 0)}, ${fmt(model.gravity?.y ?? 0)}, ${fmt(model.gravity?.z ?? 0)})`,
    '',
  );

  if (!result) {
    lines.push('## Results', '', 'No analysis result is available.', '');
    return lines.join('\n');
  }

  lines.push('## Displacements', '', markdownTable(
    ['Node', ...DOF_LABELS],
    model.nodes.map((node, index) => [
      nodeLabel(node),
      ...DOF_LABELS.map((_, dof) => fmt(result.displacements[index * 6 + dof])),
    ])
  ));

  lines.push('', '## Reactions', '', markdownTable(
    ['Node', ...REACTION_LABELS],
    model.nodes.map((node, index) => [
      nodeLabel(node),
      ...REACTION_LABELS.map((_, dof) => fmt(result.reactions[index * 6 + dof])),
    ])
  ));

  lines.push('', '## Member End Forces', '', markdownTable(
    ['Member', ...END_FORCE_LABELS],
    model.members.map((member) => [
      memberLabel(member),
      ...END_FORCE_LABELS.map((_, index) => fmt(result.elementEndForces[member.id]?.[index])),
    ])
  ));

  if (resolvedResult?.governingTargets) {
    const governing = resolvedResult.governingTargets;
    lines.push(
      '',
      '## Envelope Governing Targets — Displacements',
      '',
      markdownTable(
        ['Node', ...DOF_LABELS],
        model.nodes.map((node, index) => [
          nodeLabel(node),
          ...DOF_LABELS.map((_, dof) => governing.displacements[index * 6 + dof] ?? ''),
        ]),
      ),
      '',
      '## Envelope Governing Targets — Reactions',
      '',
      markdownTable(
        ['Node', ...REACTION_LABELS],
        model.nodes.map((node, index) => [
          nodeLabel(node),
          ...REACTION_LABELS.map((_, dof) => governing.reactions[index * 6 + dof] ?? ''),
        ]),
      ),
      '',
      '## Envelope Governing Targets — Member End Forces',
      '',
      markdownTable(
        ['Member', ...END_FORCE_LABELS],
        model.members.map((member) => [
          memberLabel(member),
          ...END_FORCE_LABELS.map((_, index) => governing.elementEndForces[member.id]?.[index] ?? ''),
        ]),
      ),
    );
  }

  if (result.warnings.length > 0) {
    lines.push('', '## Warnings', '', ...result.warnings.map((warning) => `- ${warning}`));
  }

  return `${lines.join('\n')}\n`;
}

export function generateCsvReport(input: ReportInput): string {
  assertReportExportable(input);
  const { model, error, generatedAt } = input;
  const resolvedResult = resolveReportResult(input);
  const result = resolvedResult?.result ?? null;
  const rows: string[][] = [
    ['Frame Analysis Report'],
    ['Generated', generatedAt.toISOString()],
    ['Analysis target', reportTargetLabel(input)],
    [],
    ['Model'],
    ['Nodes', String(model.nodes.length)],
    ['Members', String(model.members.length)],
    ['Materials', String(model.materials.length)],
    ['Sections', String(model.sections.length)],
    ['Nodal loads', String(model.nodalLoads.length)],
    ['Member loads', String(model.memberLoads.length)],
    ['Nodal springs', String(model.nodeSprings?.length ?? 0)],
    [],
  ];

  if (error) {
    rows.push(['Analysis Error'], [error.message]);
    return rows.map(csvRow).join('\n');
  }

  rows.push(['Input Nodes'], ['Node', 'X', 'Y', 'Z', 'ux', 'uy', 'uz', 'rx', 'ry', 'rz']);
  for (const node of model.nodes) rows.push([nodeLabel(node), fmt(node.x), fmt(node.y), fmt(node.z), ...(['ux', 'uy', 'uz', 'rx', 'ry', 'rz'] as const).map((dof) => node.restraint[dof] ? 'fixed' : 'free')]);
  rows.push([], ['Input Members'], ['Member', 'i', 'j', 'Section', 'Code angle']);
  for (const member of model.members) rows.push([
    memberLabel(member),
    nodeLabel(model.nodes.find((node) => node.id === member.ni)),
    nodeLabel(model.nodes.find((node) => node.id === member.nj)),
    model.sections.find((section) => section.id === member.sectionId)?.name ?? member.sectionId,
    fmt(member.codeAngle),
  ]);
  rows.push([], ['Input Materials'], ['Name', 'E', 'G', 'nu', 'alpha', 'density']);
  for (const material of model.materials) rows.push([material.name, fmt(material.E), fmt(material.G), fmt(material.nu), fmt(material.expansion), fmt(material.density)]);
  rows.push([], ['Input Sections'], ['Name', 'Material', 'A', 'Ix', 'Iy', 'Iz', 'ky', 'kz']);
  for (const section of model.sections) rows.push([section.name, model.materials.find((material) => material.id === section.materialId)?.name ?? section.materialId, fmt(section.A), fmt(section.Ix), fmt(section.Iy), fmt(section.Iz), fmt(section.ky), fmt(section.kz)]);
  rows.push([], ['Input Loads'], ['Kind', 'Target', 'Case', 'Components']);
  for (const load of model.nodalLoads) rows.push(['Nodal', nodeLabel(model.nodes.find((node) => node.id === load.nodeId)), loadCaseName(model, load.loadCaseId), `Fx=${fmt(load.fx)} Fy=${fmt(load.fy)} Fz=${fmt(load.fz)} Mx=${fmt(load.mx)} My=${fmt(load.my)} Mz=${fmt(load.mz)}`]);
  for (const load of model.memberLoads) rows.push(['Member', memberLabel(model.members.find((member) => member.id === load.memberId)), loadCaseName(model, load.loadCaseId), memberLoadSummary(load)]);
  rows.push([], ['Input Nodal Springs'], ['Node', 'Kux', 'Kuy', 'Kuz', 'Krx', 'Kry', 'Krz'], ...nodalSpringRows(model));
  rows.push([], ['Input Gravity'], ['X', 'Y', 'Z'], [fmt(model.gravity?.x ?? 0), fmt(model.gravity?.y ?? 0), fmt(model.gravity?.z ?? 0)]);
  rows.push([]);

  if (!result) {
    rows.push(['Results'], ['No analysis result is available.']);
    return rows.map(csvRow).join('\n');
  }

  rows.push(['Displacements'], ['Node', ...DOF_LABELS]);
  for (const [index, node] of model.nodes.entries()) {
    rows.push([
      nodeLabel(node),
      ...DOF_LABELS.map((_, dof) => fmt(result.displacements[index * 6 + dof])),
    ]);
  }

  rows.push([], ['Reactions'], ['Node', ...REACTION_LABELS]);
  for (const [index, node] of model.nodes.entries()) {
    rows.push([
      nodeLabel(node),
      ...REACTION_LABELS.map((_, dof) => fmt(result.reactions[index * 6 + dof])),
    ]);
  }

  rows.push([], ['Member End Forces'], ['Member', ...END_FORCE_LABELS]);
  for (const member of model.members) {
    rows.push([
      memberLabel(member),
      ...END_FORCE_LABELS.map((_, index) => fmt(result.elementEndForces[member.id]?.[index])),
    ]);
  }

  if (resolvedResult?.governingTargets) {
    const governing = resolvedResult.governingTargets;
    rows.push([], ['Envelope Governing Targets - Displacements'], ['Node', ...DOF_LABELS]);
    for (const [index, node] of model.nodes.entries()) {
      rows.push([
        nodeLabel(node),
        ...DOF_LABELS.map((_, dof) => governing.displacements[index * 6 + dof] ?? ''),
      ]);
    }
    rows.push([], ['Envelope Governing Targets - Reactions'], ['Node', ...REACTION_LABELS]);
    for (const [index, node] of model.nodes.entries()) {
      rows.push([
        nodeLabel(node),
        ...REACTION_LABELS.map((_, dof) => governing.reactions[index * 6 + dof] ?? ''),
      ]);
    }
    rows.push([], ['Envelope Governing Targets - Member End Forces'], ['Member', ...END_FORCE_LABELS]);
    for (const member of model.members) {
      rows.push([
        memberLabel(member),
        ...END_FORCE_LABELS.map((_, index) => governing.elementEndForces[member.id]?.[index] ?? ''),
      ]);
    }
  }

  if (result.warnings.length > 0) {
    rows.push([], ['Warnings'], ...result.warnings.map((warning) => [warning]));
  }

  return rows.map(csvRow).join('\n');
}

export function generatePrintableReportHtml(input: ReportInput): string {
  assertReportExportable(input);
  const { model, error, generatedAt, viewportImageDataUrl } = input;
  const resolvedResult = resolveReportResult(input);
  const result = resolvedResult?.result ?? null;
  const nodeRows = model.nodes.map((node) => [
    nodeLabel(node), fmt(node.x), fmt(node.y), fmt(node.z),
    ...(['ux', 'uy', 'uz', 'rx', 'ry', 'rz'] as const).map((dof) => node.restraint[dof] ? 'fixed' : 'free'),
  ]);
  const memberRows = model.members.map((member) => [
    memberLabel(member),
    nodeLabel(model.nodes.find((node) => node.id === member.ni)),
    nodeLabel(model.nodes.find((node) => node.id === member.nj)),
    model.sections.find((section) => section.id === member.sectionId)?.name ?? member.sectionId,
    fmt(member.codeAngle),
  ]);
  const materialRows = model.materials.map((material) => [material.name, fmt(material.E), fmt(material.G), fmt(material.nu), fmt(material.expansion), fmt(material.density)]);
  const sectionRows = model.sections.map((section) => [section.name, model.materials.find((material) => material.id === section.materialId)?.name ?? section.materialId, fmt(section.A), fmt(section.Ix), fmt(section.Iy), fmt(section.Iz), fmt(section.ky), fmt(section.kz)]);
  const loadRows = [
    ...model.nodalLoads.map((load) => ['Nodal', nodeLabel(model.nodes.find((node) => node.id === load.nodeId)), loadCaseName(model, load.loadCaseId), `Fx=${fmt(load.fx)}, Fy=${fmt(load.fy)}, Fz=${fmt(load.fz)}, Mx=${fmt(load.mx)}, My=${fmt(load.my)}, Mz=${fmt(load.mz)}`]),
    ...model.memberLoads.map((load) => ['Member', memberLabel(model.members.find((member) => member.id === load.memberId)), loadCaseName(model, load.loadCaseId), memberLoadSummary(load)]),
  ];
  const governing = resolvedResult?.governingTargets;
  const resultSections = result ? [
    sectionHtml('Displacements', htmlTable(['Node', ...DOF_LABELS], model.nodes.map((node, nodeIndex) => [nodeLabel(node), ...DOF_LABELS.map((_, dof) => fmt(result.displacements[nodeIndex * 6 + dof]))]))),
    sectionHtml('Reactions', htmlTable(['Node', ...REACTION_LABELS], model.nodes.map((node, nodeIndex) => [nodeLabel(node), ...REACTION_LABELS.map((_, dof) => fmt(result.reactions[nodeIndex * 6 + dof]))]))),
    sectionHtml('Member End Forces', htmlTable(['Member', ...END_FORCE_LABELS], model.members.map((member) => [memberLabel(member), ...END_FORCE_LABELS.map((_, index) => fmt(result.elementEndForces[member.id]?.[index]))]))),
    governing ? sectionHtml('Envelope Governing Targets — Displacements', htmlTable(['Node', ...DOF_LABELS], model.nodes.map((node, nodeIndex) => [nodeLabel(node), ...DOF_LABELS.map((_, dof) => governing.displacements[nodeIndex * 6 + dof] ?? '')]))) : '',
    governing ? sectionHtml('Envelope Governing Targets — Reactions', htmlTable(['Node', ...REACTION_LABELS], model.nodes.map((node, nodeIndex) => [nodeLabel(node), ...REACTION_LABELS.map((_, dof) => governing.reactions[nodeIndex * 6 + dof] ?? '')]))) : '',
    governing ? sectionHtml('Envelope Governing Targets — Member End Forces', htmlTable(['Member', ...END_FORCE_LABELS], model.members.map((member) => [memberLabel(member), ...END_FORCE_LABELS.map((_, index) => governing.elementEndForces[member.id]?.[index] ?? '')]))) : '',
    result.warnings.length ? sectionHtml('Warnings', `<ul>${result.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>`) : '',
  ].join('') : sectionHtml(error ? 'Analysis Error' : 'Results', `<p class="${error ? 'error' : ''}">${escapeHtml(error?.message ?? 'No analysis result is available.')}</p>`);
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<title>Frame Analysis Report</title>',
    '<style>',
    'body{font-family:Arial,sans-serif;margin:28px;color:#222;font-size:12px;line-height:1.45;}',
    'h1{font-size:23px;margin:0 0 4px;}h2{font-size:16px;border-bottom:2px solid #333;padding-bottom:3px;margin-top:22px;}h3{font-size:13px;}',
    '.meta{color:#666;margin-bottom:16px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:12px 0}.summary div{padding:7px;background:#f3f4f6;border-radius:4px}.viewport{display:block;max-width:100%;max-height:340px;margin:12px auto;border:1px solid #ddd}',
    'table{width:100%;border-collapse:collapse;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10px;margin:7px 0 14px;}th,td{border:1px solid #bbb;padding:3px 5px;text-align:right;}th{background:#eef0f3;}th:first-child,td:first-child{text-align:left}.error{color:#b00020}.report-section{break-inside:avoid-page;}',
    '@page{size:A4 landscape;margin:12mm}@media print{body{margin:0}.report-section{page-break-inside:avoid;}h2{break-after:avoid;}}',
    '</style>',
    '</head>',
    '<body>',
    `<h1>${escapeHtml(model.title || 'Frame Analysis Report')}</h1>`,
    `<div class="meta">Generated: ${escapeHtml(generatedAt.toISOString())} · Analysis target: ${escapeHtml(reportTargetLabel(input))} · Units: ${escapeHtml(`${model.units.force}, ${model.units.length}, ${model.units.moment}`)}</div>`,
    `<div class="summary"><div><strong>${model.nodes.length}</strong><br>Nodes</div><div><strong>${model.members.length}</strong><br>Members</div><div><strong>${model.nodalLoads.length + model.memberLoads.length}</strong><br>Loads</div></div>`,
    viewportImageDataUrl ? `<img class="viewport" alt="3D model viewport" src="${escapeHtml(viewportImageDataUrl)}">` : '',
    sectionHtml('Input — Nodes', htmlTable(['Node', 'X', 'Y', 'Z', 'ux', 'uy', 'uz', 'rx', 'ry', 'rz'], nodeRows)),
    sectionHtml('Input — Members', htmlTable(['Member', 'i', 'j', 'Section', 'Code angle'], memberRows)),
    sectionHtml('Input — Materials', htmlTable(['Name', 'E', 'G', 'nu', 'alpha', 'density'], materialRows)),
    sectionHtml('Input — Sections', htmlTable(['Name', 'Material', 'A', 'Ix', 'Iy', 'Iz', 'ky', 'kz'], sectionRows)),
    sectionHtml('Input — Loads', htmlTable(['Kind', 'Target', 'Case', 'Components'], loadRows)),
    sectionHtml('Input — Nodal Springs', htmlTable(['Node', 'Kux', 'Kuy', 'Kuz', 'Krx', 'Kry', 'Krz'], nodalSpringRows(model))),
    sectionHtml('Input — Gravity', htmlTable(['X', 'Y', 'Z'], [[fmt(model.gravity?.x ?? 0), fmt(model.gravity?.y ?? 0), fmt(model.gravity?.z ?? 0)]])),
    resultSections,
    '</body>',
    '</html>',
  ].join('');
}

function sectionHtml(title: string, body: string): string {
  return `<section class="report-section"><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function htmlTable(headers: string[], rows: string[][]): string {
  return `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function loadCaseName(model: ProjectModel, loadCaseId: string | undefined): string {
  return model.loadCases?.find((loadCase) => loadCase.id === loadCaseId)?.name ?? loadCaseId ?? '';
}

function memberLoadSummary(load: ProjectModel['memberLoads'][number]): string {
  if (load.type === 'cmq') {
    return `CMQ iQ=(${fmt(load.iQx)},${fmt(load.iQy)},${fmt(load.iQz)}) iM=(${fmt(load.iMy)},${fmt(load.iMz)}) jQ=(${fmt(load.jQx)},${fmt(load.jQy)},${fmt(load.jQz)}) jM=(${fmt(load.jMy)},${fmt(load.jMz)}) mid=(${fmt(load.moy)},${fmt(load.moz)})`;
  }
  if (load.type === 'point') {
    return `Point ${load.direction}=${fmt(load.value)} at a=${fmt(load.a)}`;
  }
  if (load.type === 'temperature') {
    return `Temperature deltaT=${fmt(load.value)}`;
  }
  if (load.type === 'selfWeight') {
    return `Self-weight factor=${fmt(load.value)} (${load.direction})`;
  }
  return `UDL ${load.direction}=${fmt(load.value)}`;
}

function nodalSpringRows(model: ProjectModel): string[][] {
  return (model.nodeSprings ?? []).map((spring) => [
    nodeLabel(model.nodes.find((node) => node.id === spring.nodeId)),
    fmt(spring.ux), fmt(spring.uy), fmt(spring.uz),
    fmt(spring.rx), fmt(spring.ry), fmt(spring.rz),
  ]);
}

function reportTargetLabel(input: ReportInput): string {
  const view = input.resultView;
  if (!view) return getActiveLoadTargetName(input.model);
  if (view.kind === 'envelope') {
    return view.bound === 'min'
      ? 'Minimum component-wise envelope'
      : 'Maximum component-wise envelope';
  }
  const targetType = view.target.type === 'loadCase' ? 'Load case' : 'Load combination';
  return `${targetType}: ${view.target.name}`;
}

function resolveReportResult(input: ReportInput): ResolvedReportResult | null {
  const view = input.resultView;
  if (view?.kind === 'envelope') {
    const values = view.bound === 'min' ? 'min' : 'max';
    const targetIds = view.bound === 'min' ? 'minTargetIds' : 'maxTargetIds';
    const targetName = (targetId: string | undefined): string => {
      if (!targetId) return '';
      return view.targetNames[targetId] ?? targetId;
    };
    return {
      result: {
        displacements: view.envelope.displacements[values],
        reactions: view.envelope.reactions[values],
        elementEndForces: Object.fromEntries(
          Object.entries(view.envelope.elementEndForces).map(([memberId, component]) => [
            memberId,
            component[values],
          ]),
        ),
        diagrams: {},
        warnings: [],
      },
      governingTargets: {
        displacements: view.envelope.displacements[targetIds].map(targetName),
        reactions: view.envelope.reactions[targetIds].map(targetName),
        elementEndForces: Object.fromEntries(
          Object.entries(view.envelope.elementEndForces).map(([memberId, component]) => [
            memberId,
            component[targetIds].map(targetName),
          ]),
        ),
      },
    };
  }
  if (!input.result) return null;
  return { result: input.result, governingTargets: null };
}

export function assertReportExportable(input: ReportInput): void {
  if (input.isResultStale && resolveReportResult(input)) throw new StaleAnalysisResultError();
}

function markdownTable(headers: string[], rows: string[][]): string {
  return [
    `| ${headers.map(markdownCell).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(markdownCell).join(' | ')} |`),
  ].join('\n');
}

function markdownCell(value: string): string {
  return value.split('\\').join('\\\\').split('|').join('\\|');
}

function csvRow(row: string[]): string {
  return row.map(csvCell).join(',');
}

function csvCell(value: string): string {
  if (!/[",\n]/.test(value)) return value;
  return `"${value.split('"').join('""')}"`;
}

function escapeHtml(value: string): string {
  return value
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;');
}

function fmt(value: number | undefined): string {
  if (value === undefined) return '';
  if (Math.abs(value) < 1e-10) return '0';
  return formatEngineering(value, { significantDigits: 7, fixedDecimals: 6, zeroTolerance: 1e-10 });
}
