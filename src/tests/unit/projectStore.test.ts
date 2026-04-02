import { beforeEach, describe, expect, it } from 'vitest';
import type { ProjectModel } from '../../core/model/types';
import { useProjectStore } from '../../state/projectStore';

describe('projectStore model normalization', () => {
  beforeEach(() => {
    useProjectStore.getState().resetModel();
  });

  it('fills in Timoshenko defaults for legacy loaded models', () => {
    const legacyModel = {
      nodes: [],
      materials: [{ id: 'mat1', name: 'Steel', E: 205000 }],
      sections: [{ id: 'sec1', name: 'Default', A: 0.01, I: 1e-4 }],
      members: [],
      nodalLoads: [],
      memberLoads: [],
      units: { force: 'kN', length: 'm', moment: 'kN·m' },
    } as unknown as ProjectModel;

    useProjectStore.getState().loadModel(legacyModel);

    const model = useProjectStore.getState().model;
    expect(model.materials[0]?.nu).toBe(0.3);
    expect(model.sections[0]?.As).toBe(0.01);
  });
});

describe('projectStore unit conversion', () => {
  beforeEach(() => {
    useProjectStore.getState().resetModel();
  });

  it('rescales shear area As with the same factor as area A', () => {
    const state = useProjectStore.getState();
    const section = state.model.sections[0]!;

    state.updateSection(section.id, {
      A: 0.01,
      I: 1e-4,
      As: 0.005,
    });

    useProjectStore.getState().updateUnits({ length: 'mm' });

    const updatedSection = useProjectStore.getState().model.sections[0]!;
    expect(updatedSection.A).toBeCloseTo(10000, 6);
    expect(updatedSection.As).toBeCloseTo(5000, 6);
    expect(updatedSection.I).toBeCloseTo(1e8, 3);
  });
});
