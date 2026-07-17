import { describe, expect, it } from 'vitest';
import sampleText from '../../../public/samples/FrameModel_Sample.json?raw';
import { analyzeFrame } from '../../core/analysis/analyzeFrame';
import { buildIndexedModel } from '../../core/model/indexing';
import { resolveAnalysisLoadModel } from '../../core/model/loadCases';
import { validateModel } from '../../core/model/validation';
import { importJsonTextAuto } from '../../io/jsonImporter';

describe('bundled sample integration', () => {
  it('imports and analyzes the bundled sample without validation errors', () => {
    const imported = importJsonTextAuto(sampleText);
    const analysisModel = resolveAnalysisLoadModel(imported.model);

    expect(imported.summary.nodes).toBeGreaterThan(0);
    expect(imported.summary.members).toBeGreaterThan(0);
    expect(analysisModel.sections.every((section) => section.Iy > 0 && section.Iz > 0)).toBe(true);
    expect(validateModel(analysisModel)).toEqual([]);

    const result = analyzeFrame({ model: buildIndexedModel(analysisModel) });
    expect(result.displacements.every(Number.isFinite)).toBe(true);
    expect(result.elementEndForces.size).toBe(analysisModel.members.length);
  });
});
