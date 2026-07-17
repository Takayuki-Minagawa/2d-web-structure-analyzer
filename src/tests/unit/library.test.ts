import { describe, expect, it } from 'vitest';
import { MATERIAL_PRESETS, SECTION_PRESETS } from '../../core/model/library';

describe('model library presets', () => {
  it('provides usable material presets', () => {
    expect(MATERIAL_PRESETS.length).toBeGreaterThan(0);
    for (const preset of MATERIAL_PRESETS) {
      expect(preset.name).not.toBe('');
      expect(preset.E).toBeGreaterThan(0);
      expect(preset.G).toBeGreaterThan(0);
      expect(preset.nu).toBeGreaterThanOrEqual(0);
    }
  });

  it('provides usable section presets', () => {
    expect(SECTION_PRESETS.length).toBeGreaterThanOrEqual(20);
    for (const preset of SECTION_PRESETS) {
      expect(preset.name).not.toBe('');
      expect(preset.A).toBeGreaterThan(0);
      expect(preset.Ix).toBeGreaterThan(0);
      expect(preset.Iy).toBeGreaterThan(0);
      expect(preset.Iz).toBeGreaterThan(0);
      expect(preset.ky).toBeGreaterThan(0);
      expect(preset.ky).toBeLessThanOrEqual(1);
      expect(preset.kz).toBeGreaterThan(0);
      expect(preset.kz).toBeLessThanOrEqual(1);
    }
  });

  it('covers common JIS-size H, box and pipe families plus solid rectangles', () => {
    expect(SECTION_PRESETS.some((preset) => preset.name.startsWith('H-'))).toBe(true);
    expect(SECTION_PRESETS.some((preset) => preset.name.startsWith('Box-'))).toBe(true);
    expect(SECTION_PRESETS.some((preset) => preset.name.startsWith('Pipe-'))).toBe(true);
    expect(SECTION_PRESETS.some((preset) => preset.name.startsWith('Rect-'))).toBe(true);
    expect(new Set(SECTION_PRESETS.map((preset) => preset.name)).size).toBe(SECTION_PRESETS.length);
  });

  it('keeps the preset shear ratios aligned with the element local-axis convention', () => {
    const hSection = SECTION_PRESETS.find((preset) => preset.name === 'H-200x100x5.5x8');
    const rectangularTube = SECTION_PRESETS.find((preset) => preset.name === 'Box-200x100x6');

    expect(hSection).toBeDefined();
    expect(rectangularTube).toBeDefined();

    // Local z follows H. The H-section web therefore supplies ky (Iy/Vz),
    // while its flanges supply kz (Iz/Vy).
    expect(hSection!.ky * hSection!.A).toBeCloseTo((20 - 2 * 0.8) * 0.55, 12);
    expect(hSection!.kz * hSection!.A).toBeCloseTo(2 * 10 * 0.8, 12);
    expect(hSection!.ky).toBeLessThan(hSection!.kz);

    // For the 20x10 tube, the longer local-z walls must contribute to ky.
    expect(rectangularTube!.ky).toBeCloseTo(19.4 / (19.4 + 9.4), 12);
    expect(rectangularTube!.kz).toBeCloseTo(9.4 / (19.4 + 9.4), 12);
    expect(rectangularTube!.ky).toBeGreaterThan(rectangularTube!.kz);
  });
});
