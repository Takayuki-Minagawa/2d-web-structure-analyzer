import type { Material, Section } from './types';
import {
  calculateCircularHollowSection,
  calculateHSection,
  calculateRectangleSection,
  calculateRectangularHollowSection,
  type CalculatedSectionProperties,
} from './sectionCalculators';

export type MaterialPreset = Omit<Material, 'id'>;
export type SectionPreset = Omit<Section, 'id' | 'materialId'>;

export const MATERIAL_PRESETS: MaterialPreset[] = [
  { name: 'Steel SS400', E: 20500, G: 7900, nu: 0.3, expansion: 0.000012 },
  { name: 'Concrete Fc24', E: 2400, G: 1000, nu: 0.2, expansion: 0.00001 },
  { name: 'Timber C24', E: 1100, G: 70, nu: 0.35, expansion: 0.000005 },
  { name: 'Aluminum A6061', E: 6900, G: 2600, nu: 0.33, expansion: 0.000023 },
];

function sectionPreset(name: string, properties: CalculatedSectionProperties): SectionPreset {
  return { name, ...properties };
}

const millimetresToCentimetres = (millimetres: number): number => millimetres / 10;

function hSectionPreset(
  name: string,
  H: number,
  B: number,
  tw: number,
  tf: number,
): SectionPreset {
  return sectionPreset(name, calculateHSection({
    H: millimetresToCentimetres(H),
    B: millimetresToCentimetres(B),
    tw: millimetresToCentimetres(tw),
    tf: millimetresToCentimetres(tf),
  }));
}

function boxSectionPreset(name: string, H: number, B: number, t: number): SectionPreset {
  return sectionPreset(name, calculateRectangularHollowSection({
    H: millimetresToCentimetres(H),
    B: millimetresToCentimetres(B),
    t: millimetresToCentimetres(t),
  }));
}

function pipeSectionPreset(name: string, D: number, t: number): SectionPreset {
  return sectionPreset(name, calculateCircularHollowSection({
    D: millimetresToCentimetres(D),
    t: millimetresToCentimetres(t),
  }));
}

/**
 * Common JIS rolled/tube nominal sizes. Dimensions are converted from mm to
 * the application's default cm unit and idealized geometry is calculated by
 * the same functions used by the section calculator. Rolled fillets and tube
 * corner radii are intentionally not included, so certified table values can
 * still be entered when that distinction matters.
 */
export const SECTION_PRESETS: SectionPreset[] = [
  // Backward-compatible short labels retained from the original library.
  hSectionPreset('H-200x100', 200, 100, 5.5, 8),
  hSectionPreset('H-300x150', 300, 150, 6.5, 9),
  hSectionPreset('H-100x50x5x7', 100, 50, 5, 7),
  hSectionPreset('H-150x75x5x7', 150, 75, 5, 7),
  hSectionPreset('H-200x100x5.5x8', 200, 100, 5.5, 8),
  hSectionPreset('H-250x125x6x9', 250, 125, 6, 9),
  hSectionPreset('H-300x150x6.5x9', 300, 150, 6.5, 9),
  hSectionPreset('H-350x175x7x11', 350, 175, 7, 11),
  hSectionPreset('H-400x200x8x13', 400, 200, 8, 13),
  hSectionPreset('H-200x200x8x12', 200, 200, 8, 12),
  hSectionPreset('H-250x250x9x14', 250, 250, 9, 14),
  hSectionPreset('H-300x300x10x15', 300, 300, 10, 15),
  hSectionPreset('H-400x400x13x21', 400, 400, 13, 21),
  boxSectionPreset('Box-100x100x4.5', 100, 100, 4.5),
  boxSectionPreset('Box-150x150x6', 150, 150, 6),
  boxSectionPreset('Box-200x100x6', 200, 100, 6),
  boxSectionPreset('Box-200x200x6', 200, 200, 6),
  boxSectionPreset('Box-200x200x9', 200, 200, 9),
  boxSectionPreset('Box-250x250x9', 250, 250, 9),
  boxSectionPreset('Box-300x300x12', 300, 300, 12),
  pipeSectionPreset('Pipe-101.6x3.2', 101.6, 3.2),
  pipeSectionPreset('Pipe-114.3x4.5', 114.3, 4.5),
  pipeSectionPreset('Pipe-139.8x4.5', 139.8, 4.5),
  pipeSectionPreset('Pipe-165.2x6', 165.2, 6),
  pipeSectionPreset('Pipe-216.3x8.2', 216.3, 8.2),
  pipeSectionPreset('Pipe-267.4x9.3', 267.4, 9.3),
  pipeSectionPreset('Pipe-318.5x10.3', 318.5, 10.3),
  sectionPreset('Rect-30x45', calculateRectangleSection({ H: 45, B: 30 })),
  sectionPreset('Rect-30x60', calculateRectangleSection({ H: 60, B: 30 })),
  sectionPreset('Rect-40x60', calculateRectangleSection({ H: 60, B: 40 })),
];
