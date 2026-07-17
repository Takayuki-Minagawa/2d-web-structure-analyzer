import { describe, expect, it } from 'vitest';
import type { ProjectModel } from '../../core/model/types';
import {
  generateCsvReport,
  generateMarkdownReport,
  generatePrintableReportHtml,
  StaleAnalysisResultError,
} from '../../io/reportExporter';
import type { ReportInput } from '../../io/reportExporter';

function createModel(): ProjectModel {
  return {
    title: 'Report Test',
    loadCases: [{ id: 'dead', name: 'Dead' }],
    activeLoadCaseId: 'dead',
    activeLoadCombinationId: null,
    nodes: [
      { id: 'n0', x: 0, y: 0, z: 0, restraint: { ux: true, uy: true, uz: true, rx: true, ry: true, rz: true } },
    ],
    materials: [{ id: 'mat1', name: 'Steel', E: 20500, G: 7900, nu: 0.3, expansion: 0 }],
    sections: [{ id: 'sec1', name: 'Default', materialId: 'mat1', A: 1, Ix: 1, Iy: 1, Iz: 1, ky: 0, kz: 0 }],
    springs: [],
    members: [],
    couplings: [],
    nodalLoads: [],
    memberLoads: [],
    units: { force: 'kN', length: 'cm', moment: 'kN·cm' },
  };
}

describe('reportExporter', () => {
  it('generates markdown and csv reports with result tables', () => {
    const input = {
      model: createModel(),
      result: {
        displacements: [0, 1, 2, 3, 4, 5],
        reactions: [6, 7, 8, 9, 10, 11],
        elementEndForces: {},
        diagrams: {},
        warnings: ['Check model'],
      },
      error: null,
      generatedAt: new Date('2026-05-01T00:00:00.000Z'),
    };

    const markdown = generateMarkdownReport(input);
    expect(markdown).toContain('# Report Test');
    expect(markdown).toContain('Analysis target: Dead');
    expect(markdown).toContain('| n0 | 0 | 1.000000 | 2.000000');

    const csv = generateCsvReport(input);
    expect(csv).toContain('Analysis target,Dead');
    expect(csv).toContain('n0,0,1.000000,2.000000');
  });

  it('uses the explicitly selected target name instead of the active model target', () => {
    const input: ReportInput = {
      model: createModel(),
      result: {
        displacements: [0, 12, 0, 0, 0, 0],
        reactions: [0, 0, 0, 0, 0, 0],
        elementEndForces: {},
        diagrams: {},
        warnings: [],
      },
      resultView: {
        kind: 'target',
        target: { id: 'uls', name: 'ULS', type: 'loadCombination' },
      },
      error: null,
      generatedAt: new Date('2026-05-01T00:00:00.000Z'),
    };

    expect(generateMarkdownReport(input)).toContain('Analysis target: Load combination: ULS');
    expect(generateCsvReport(input)).toContain('Analysis target,Load combination: ULS');
    expect(generatePrintableReportHtml(input)).toContain('Analysis target: Load combination: ULS');
  });

  it.each([
    { bound: 'min' as const, label: 'Minimum component-wise envelope', selected: -10 },
    { bound: 'max' as const, label: 'Maximum component-wise envelope', selected: 20 },
  ])('exports the selected $bound envelope values and governing targets', ({ bound, label, selected }) => {
    const componentEnvelope = {
      min: [-10, -9, -8, -7, -6, -5],
      max: [20, 19, 18, 17, 16, 15],
      minTargetIds: ['wind-negative', 'dead', 'dead', 'dead', 'dead', 'dead'],
      maxTargetIds: ['wind-positive', 'live', 'live', 'live', 'live', 'live'],
    };
    const input: ReportInput = {
      model: createModel(),
      // This is intentionally different from both envelope bounds. Envelope
      // export must not reuse the last target result retained for the canvas.
      result: {
        displacements: [99, 99, 99, 99, 99, 99],
        reactions: [99, 99, 99, 99, 99, 99],
        elementEndForces: {},
        diagrams: {},
        warnings: ['Target-only warning'],
      },
      resultView: {
        kind: 'envelope',
        bound,
        envelope: {
          displacements: componentEnvelope,
          reactions: componentEnvelope,
          elementEndForces: {},
        },
        targetNames: {
          'wind-negative': 'Wind -X',
          'wind-positive': 'Wind +X',
          dead: 'Dead',
          live: 'Live',
        },
      },
      error: null,
      generatedAt: new Date('2026-05-01T00:00:00.000Z'),
    };

    const expectedValue = selected.toFixed(6);
    const expectedGoverning = bound === 'min' ? 'Wind -X' : 'Wind +X';
    const markdown = generateMarkdownReport(input);
    expect(markdown).toContain(`Analysis target: ${label}`);
    expect(markdown).toContain(`| n0 | ${expectedValue}`);
    expect(markdown).toContain(expectedGoverning);
    expect(markdown).not.toContain('99.000000');
    expect(markdown).not.toContain('Target-only warning');

    const csv = generateCsvReport(input);
    expect(csv).toContain(`Analysis target,${label}`);
    expect(csv).toContain(`n0,${expectedValue}`);
    expect(csv).toContain(expectedGoverning);
    expect(csv).not.toContain('99.000000');

    const html = generatePrintableReportHtml(input);
    expect(html).toContain(`Analysis target: ${label}`);
    expect(html).toContain(`<td>${expectedValue}</td>`);
    expect(html).toContain(expectedGoverning);
    expect(html).not.toContain('99.000000');
  });

  it('escapes markdown table delimiters inside cell values', () => {
    const input = {
      model: {
        ...createModel(),
        nodes: [
          { ...createModel().nodes[0]!, id: 'n|0' },
        ],
      },
      result: {
        displacements: [0, 0, 0, 0, 0, 0],
        reactions: [0, 0, 0, 0, 0, 0],
        elementEndForces: {},
        diagrams: {},
        warnings: [],
      },
      error: null,
      generatedAt: new Date('2026-05-01T00:00:00.000Z'),
    };

    expect(generateMarkdownReport(input)).toContain('n\\|0');
  });

  it('generates printable html that escapes report content', () => {
    const html = generatePrintableReportHtml({
      model: { ...createModel(), title: '<unsafe>' },
      result: null,
      error: null,
      generatedAt: new Date('2026-05-01T00:00:00.000Z'),
    });

    expect(html).toContain('&lt;unsafe&gt;');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<table>');
    expect(html).toContain('Input — Materials');
    expect(html).not.toContain('<pre>');
  });

  it('refuses to export a stale analysis result when state marks it stale', () => {
    const input = {
      model: createModel(),
      result: {
        displacements: [0, 0, 0, 0, 0, 0],
        reactions: [0, 0, 0, 0, 0, 0],
        elementEndForces: {},
        diagrams: {},
        warnings: [],
      },
      error: null,
      generatedAt: new Date('2026-05-01T00:00:00.000Z'),
      isResultStale: true,
    };

    expect(() => generateMarkdownReport(input)).toThrow(StaleAnalysisResultError);
    expect(() => generateCsvReport(input)).toThrow(StaleAnalysisResultError);
    expect(() => generatePrintableReportHtml(input)).toThrow(StaleAnalysisResultError);
  });
});
