import type { Section } from './types';

/**
 * Geometric section properties expressed in the same length unit as the input.
 * `Ix` is the Saint-Venant torsional constant J used by the frame element.
 */
export type CalculatedSectionProperties = Pick<Section, 'A' | 'Ix' | 'Iy' | 'Iz' | 'ky' | 'kz'>;

export interface HSectionDimensions {
  /** Overall depth along local z. */
  H: number;
  /** Flange width along local y. */
  B: number;
  /** Web thickness. */
  tw: number;
  /** Flange thickness. */
  tf: number;
}

export interface RectangularHollowSectionDimensions {
  /** Overall depth along local z. */
  H: number;
  /** Overall width along local y. */
  B: number;
  /** Uniform wall thickness. */
  t: number;
}

export interface CircularHollowSectionDimensions {
  /** Outside diameter. */
  D: number;
  /** Uniform wall thickness. */
  t: number;
}

export interface RectangleSectionDimensions {
  /** Overall depth along local z. */
  H: number;
  /** Overall width along local y. */
  B: number;
}

function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite number greater than zero (received ${value}).`);
  }
}

function validateDimensions(dimensions: Record<string, number>): void {
  for (const [name, value] of Object.entries(dimensions)) {
    assertPositiveFinite(name, value);
  }
}

/**
 * Calculates an idealized doubly-symmetric H section (fillets are ignored).
 * The shear-area ratios use the web area for local-z shear and the flange area
 * for local-y shear. This is a transparent engineering approximation suitable
 * for elastic frame input; a manufacturer/table value may still be entered.
 */
export function calculateHSection({ H, B, tw, tf }: HSectionDimensions): CalculatedSectionProperties {
  validateDimensions({ H, B, tw, tf });
  if (tw >= B) {
    throw new RangeError(`tw must be smaller than B (received tw=${tw}, B=${B}).`);
  }
  if (2 * tf >= H) {
    throw new RangeError(`2 * tf must be smaller than H (received tf=${tf}, H=${H}).`);
  }

  const webDepth = H - 2 * tf;
  const flangeArea = 2 * B * tf;
  const webArea = webDepth * tw;
  const A = flangeArea + webArea;

  // Outer rectangle minus the two void rectangles beside the web.
  const Iy = (B * H ** 3 - (B - tw) * webDepth ** 3) / 12;
  const Iz = (2 * tf * B ** 3 + webDepth * tw ** 3) / 12;
  // Thin-walled open-section Saint-Venant torsional constant.
  const Ix = (2 * B * tf ** 3 + webDepth * tw ** 3) / 3;

  return {
    A,
    Ix,
    Iy,
    Iz,
    ky: flangeArea / A,
    kz: webArea / A,
  };
}

/**
 * Calculates a sharp-cornered rectangular hollow section.
 * J uses the uniform-thickness closed thin-wall (Bredt) expression evaluated
 * on the wall centreline. It is most accurate for ordinary structural tubes.
 */
export function calculateRectangularHollowSection(
  { H, B, t }: RectangularHollowSectionDimensions,
): CalculatedSectionProperties {
  validateDimensions({ H, B, t });
  if (2 * t >= Math.min(H, B)) {
    throw new RangeError(
      `2 * t must be smaller than both H and B (received t=${t}, H=${H}, B=${B}).`,
    );
  }

  const innerH = H - 2 * t;
  const innerB = B - 2 * t;
  const A = B * H - innerB * innerH;
  const Iy = (B * H ** 3 - innerB * innerH ** 3) / 12;
  const Iz = (H * B ** 3 - innerH * innerB ** 3) / 12;

  const midlineH = H - t;
  const midlineB = B - t;
  const enclosedMidlineArea = midlineB * midlineH;
  const midlinePerimeter = 2 * (midlineB + midlineH);
  const Ix = 4 * enclosedMidlineArea ** 2 * t / midlinePerimeter;

  return {
    A,
    Ix,
    Iy,
    Iz,
    ky: midlineB / (midlineB + midlineH),
    kz: midlineH / (midlineB + midlineH),
  };
}

/** Calculates an ideal circular hollow section. */
export function calculateCircularHollowSection(
  { D, t }: CircularHollowSectionDimensions,
): CalculatedSectionProperties {
  validateDimensions({ D, t });
  if (2 * t >= D) {
    throw new RangeError(`2 * t must be smaller than D (received t=${t}, D=${D}).`);
  }

  const d = D - 2 * t;
  const fourthPowerDifference = D ** 4 - d ** 4;
  const Iy = Math.PI * fourthPowerDifference / 64;

  return {
    A: Math.PI * (D ** 2 - d ** 2) / 4,
    Ix: 2 * Iy,
    Iy,
    Iz: Iy,
    // A thin circular tube carries transverse shear on two sides of the wall.
    ky: 0.5,
    kz: 0.5,
  };
}

/**
 * Calculates a solid rectangular section. J uses the standard series-fit
 * expression for a rectangle, with the longer side denoted by a.
 */
export function calculateRectangleSection(
  { H, B }: RectangleSectionDimensions,
): CalculatedSectionProperties {
  validateDimensions({ H, B });

  const a = Math.max(H, B);
  const b = Math.min(H, B);
  const ratio = b / a;
  const Ix = a * b ** 3 * (1 / 3 - 0.21 * ratio * (1 - ratio ** 4 / 12));

  return {
    A: B * H,
    Ix,
    Iy: B * H ** 3 / 12,
    Iz: H * B ** 3 / 12,
    ky: 5 / 6,
    kz: 5 / 6,
  };
}
