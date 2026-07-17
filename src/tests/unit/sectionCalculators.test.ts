import { describe, expect, it } from 'vitest';
import {
  calculateCircularHollowSection,
  calculateHSection,
  calculateRectangleSection,
  calculateRectangularHollowSection,
} from '../../core/model/sectionCalculators';

describe('section calculators', () => {
  it('calculates an ideal H section about the model local axes', () => {
    const result = calculateHSection({ H: 10, B: 5, tw: 0.5, tf: 1 });

    expect(result.A).toBeCloseTo(14, 12);
    expect(result.Ix).toBeCloseTo(11 / 3, 12);
    expect(result.Iy).toBeCloseTo(224.6666666667, 10);
    expect(result.Iz).toBeCloseTo(20.9166666667, 10);
    expect(result.ky).toBeCloseTo(10 / 14, 12);
    expect(result.kz).toBeCloseTo(4 / 14, 12);
  });

  it('calculates a rectangular hollow section including its closed-section J', () => {
    const result = calculateRectangularHollowSection({ H: 10, B: 8, t: 1 });

    expect(result.A).toBeCloseTo(32, 12);
    expect(result.Ix).toBeCloseTo(496.125, 12);
    expect(result.Iy).toBeCloseTo(410.6666666667, 10);
    expect(result.Iz).toBeCloseTo(282.6666666667, 10);
    expect(result.ky).toBeCloseTo(7 / 16, 12);
    expect(result.kz).toBeCloseTo(9 / 16, 12);
  });

  it('calculates a circular hollow section with J equal to its polar moment', () => {
    const result = calculateCircularHollowSection({ D: 10, t: 1 });

    expect(result.A).toBeCloseTo(9 * Math.PI, 12);
    expect(result.Iy).toBeCloseTo(92.25 * Math.PI, 12);
    expect(result.Iz).toBeCloseTo(result.Iy, 12);
    expect(result.Ix).toBeCloseTo(184.5 * Math.PI, 12);
    expect(result.ky).toBe(0.5);
    expect(result.kz).toBe(0.5);
  });

  it('calculates a solid rectangle and treats H/B swapping consistently', () => {
    const result = calculateRectangleSection({ H: 4, B: 2 });
    const swapped = calculateRectangleSection({ H: 2, B: 4 });

    expect(result.A).toBe(8);
    expect(result.Ix).toBeCloseTo(7.3241666667, 9);
    expect(result.Iy).toBeCloseTo(32 / 3, 12);
    expect(result.Iz).toBeCloseTo(8 / 3, 12);
    expect(result.ky).toBeCloseTo(5 / 6, 12);
    expect(result.kz).toBeCloseTo(5 / 6, 12);
    expect(swapped.Ix).toBeCloseTo(result.Ix, 12);
    expect(swapped.Iy).toBeCloseTo(result.Iz, 12);
    expect(swapped.Iz).toBeCloseTo(result.Iy, 12);
  });

  it('scales areas with length squared and inertias with length to the fourth', () => {
    const base = calculateHSection({ H: 10, B: 5, tw: 0.5, tf: 1 });
    const scaled = calculateHSection({ H: 30, B: 15, tw: 1.5, tf: 3 });

    expect(scaled.A).toBeCloseTo(base.A * 3 ** 2, 10);
    expect(scaled.Ix).toBeCloseTo(base.Ix * 3 ** 4, 10);
    expect(scaled.Iy).toBeCloseTo(base.Iy * 3 ** 4, 10);
    expect(scaled.Iz).toBeCloseTo(base.Iz * 3 ** 4, 10);
    expect(scaled.ky).toBeCloseTo(base.ky, 12);
    expect(scaled.kz).toBeCloseTo(base.kz, 12);
  });

  it.each([
    () => calculateHSection({ H: 10, B: 5, tw: 5, tf: 1 }),
    () => calculateHSection({ H: 10, B: 5, tw: 0.5, tf: 5 }),
    () => calculateRectangularHollowSection({ H: 10, B: 8, t: 4 }),
    () => calculateCircularHollowSection({ D: 10, t: 5 }),
    () => calculateRectangleSection({ H: 0, B: 2 }),
    () => calculateRectangleSection({ H: Number.NaN, B: 2 }),
    () => calculateRectangleSection({ H: 4, B: Number.POSITIVE_INFINITY }),
  ])('rejects nonphysical or non-finite dimensions', (calculate) => {
    expect(calculate).toThrow(RangeError);
  });
});
