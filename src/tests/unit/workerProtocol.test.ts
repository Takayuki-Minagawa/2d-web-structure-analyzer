import { describe, expect, it } from 'vitest';
import sampleText from '../../../public/samples/FrameModel_Sample.json?raw';
import { importJsonTextAuto } from '../../io/jsonImporter';
import { createAnalysisResponse } from '../../worker/analysisRequestHandler';
import type { ProjectModel } from '../../core/model/types';

describe('analysis worker protocol', () => {
  it('keeps legacy array serialization for existing clients', () => {
    const model = importJsonTextAuto(sampleText).model;
    const envelope = createAnalysisResponse({ type: 'analyze', model });

    expect(envelope.response.type).toBe('analyze-success');
    if (envelope.response.type !== 'analyze-success') return;
    expect(Array.isArray(envelope.response.displacements)).toBe(true);
    expect(envelope.transferables).toEqual([]);
  });

  it('correlates v2 responses and transfers typed-array buffers', () => {
    const model = importJsonTextAuto(sampleText).model;
    const envelope = createAnalysisResponse({
      type: 'analyze',
      requestId: 'request-42',
      model,
    });

    expect(envelope.response.type).toBe('analyze-success');
    expect('requestId' in envelope.response && envelope.response.requestId).toBe('request-42');
    if (envelope.response.type !== 'analyze-success') return;
    expect(envelope.response.displacements).toBeInstanceOf(Float64Array);
    expect(envelope.response.reactions).toBeInstanceOf(Float64Array);
    expect(envelope.transferables.length).toBeGreaterThanOrEqual(2);
  });

  it('includes the request id in mapped validation errors', () => {
    const model = importJsonTextAuto(sampleText).model;
    model.sections[0] = { ...model.sections[0]!, Iy: 0 };
    const envelope = createAnalysisResponse({
      type: 'analyze',
      requestId: 'invalid-request',
      model,
    });

    expect(envelope.response.type).toBe('analyze-error');
    expect('requestId' in envelope.response && envelope.response.requestId).toBe('invalid-request');
  });

  it('preserves AnalysisException singular diagnostics in worker error mapping', () => {
    const fixed = { ux: true, uy: true, uz: true, rx: true, ry: true, rz: true };
    const model: ProjectModel = {
      title: 'Singular released member',
      nodes: [
        { id: 'n1', x: 0, y: 0, z: 0, restraint: fixed },
        {
          id: 'n2', x: 1, y: 0, z: 0,
          restraint: { ...fixed, rx: false, ry: false, rz: false },
        },
      ],
      materials: [{ id: 'mat', name: 'Test', E: 1_000, G: 400, nu: 0.25, expansion: 0 }],
      sections: [{
        id: 'sec', name: 'Test', materialId: 'mat',
        A: 1, Ix: 1, Iy: 1, Iz: 1, ky: 1, kz: 1,
      }],
      springs: [],
      members: [{
        id: 'm1', ni: 'n1', nj: 'n2', sectionId: 'sec', codeAngle: 0,
        iSprings: { x: 2, y: 2, z: 2 },
        jSprings: { x: 2, y: 2, z: 2 },
      }],
      couplings: [],
      nodalLoads: [],
      memberLoads: [],
      units: { force: 'N', length: 'm', moment: 'N m' },
    };

    const envelope = createAnalysisResponse({
      type: 'analyze', requestId: 'singular-request', model,
    });
    expect(envelope.response.type).toBe('analyze-error');
    if (envelope.response.type !== 'analyze-error') return;
    expect(envelope.response.error.type).toBe('singular');
    expect(envelope.response.error.diagnostics?.length).toBeGreaterThan(0);
  });

  it('returns all target results and envelopes through the v2 protocol', () => {
    const model = importJsonTextAuto(sampleText).model;
    const envelope = createAnalysisResponse({
      type: 'analyze-all',
      requestId: 'all-targets',
      model,
    });

    expect(envelope.response.type).toBe('analyze-all-success');
    if (envelope.response.type !== 'analyze-all-success') return;
    expect('requestId' in envelope.response && envelope.response.requestId).toBe('all-targets');
    expect(envelope.response.results.length).toBeGreaterThan(0);
    expect(envelope.response.results[0]!.displacements).toBeInstanceOf(Float64Array);
    expect(envelope.response.envelope.displacements.min).toBeInstanceOf(Float64Array);
    expect(envelope.response.factorizationCount).toBe(1);
    expect(envelope.transferables.length).toBeGreaterThan(2);
  });
});
