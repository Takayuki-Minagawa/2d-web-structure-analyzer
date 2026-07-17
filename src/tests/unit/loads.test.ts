import { describe, expect, it } from 'vitest';
import { computePointLoadFixedEndForces } from '../../core/analysis/loads';
import type { IndexedMember, PointMemberLoad } from '../../core/model/types';

function createMember(length = 5): IndexedMember {
  const rigid = { type: 'rigid' as const, kTheta: 0 };
  return {
    index: 0,
    id: 'm1',
    ni: 0,
    nj: 1,
    E: 200e6,
    G: 80e6,
    A: 0.01,
    Ix: 1e-5,
    Iy: 2e-5,
    Iz: 3e-5,
    // Zero shear ratios select the Euler-Bernoulli limit for closed-form checks.
    ky: 0,
    kz: 0,
    L: length,
    lambda: new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
    releases: [rigid, rigid, rigid, rigid, rigid, rigid],
  };
}

function pointLoad(
  direction: PointMemberLoad['direction'],
  a: number,
  value = -10
): PointMemberLoad {
  return { id: 'p1', memberId: 'm1', type: 'point', direction, a, value };
}

describe('computePointLoadFixedEndForces', () => {
  it('matches the fixed-ended beam formulas for a local-Y point load', () => {
    const member = createMember(5);
    const load = pointLoad('localY', 2);
    const forces = computePointLoadFixedEndForces(member, load);
    const b = member.L - load.a;
    const iShear = load.value * b * b * (3 * load.a + b) / member.L ** 3;
    const iMoment = load.value * load.a * b * b / member.L ** 2;
    const jShear = load.value * load.a * load.a * (load.a + 3 * b) / member.L ** 3;
    const jMoment = -load.value * load.a * load.a * b / member.L ** 2;

    expect(forces[1]).toBeCloseTo(iShear, 12);
    expect(forces[5]).toBeCloseTo(iMoment, 12);
    expect(forces[7]).toBeCloseTo(jShear, 12);
    expect(forces[11]).toBeCloseTo(jMoment, 12);
    expect(forces[1]! + forces[7]!).toBeCloseTo(load.value, 12);
  });

  it('applies the local-Z right-hand-rule sign reversal to end moments', () => {
    const member = createMember(5);
    const load = pointLoad('localZ', 2);
    const forces = computePointLoadFixedEndForces(member, load);
    const b = member.L - load.a;
    const iMomentMagnitude = load.value * load.a * b * b / member.L ** 2;
    const jMomentYConvention = -load.value * load.a * load.a * b / member.L ** 2;

    expect(forces[4]).toBeCloseTo(-iMomentMagnitude, 12);
    expect(forces[10]).toBeCloseTo(-jMomentYConvention, 12);
    expect(forces[2]! + forces[8]!).toBeCloseTo(load.value, 12);
  });

  it.each([-0.01, 5.01, Number.NaN])('rejects an out-of-range position a=%s', (a) => {
    expect(() => computePointLoadFixedEndForces(
      createMember(5),
      pointLoad('localY', a)
    )).toThrow(RangeError);
  });
});
