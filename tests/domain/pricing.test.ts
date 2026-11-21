import { describe, expect, it } from 'vitest';
import { costBreakdown, effectivePrice } from '../../src/domain/pricing';

describe('effectivePrice', () => {
  it('returns null when there is no base price', () => {
    expect(effectivePrice(null)).toBeNull();
    expect(effectivePrice(undefined, { type: 'CTS', value: 5 })).toBeNull();
  });

  it('returns the base price without a valid discount', () => {
    expect(effectivePrice(1.459)).toBe(1.459);
    expect(effectivePrice(1.459, null)).toBe(1.459);
    expect(effectivePrice(1.459, { type: 'CTS', value: 0 })).toBe(1.459);
    expect(effectivePrice(1.459, { type: 'PCT', value: -3 })).toBe(1.459);
  });

  it('subtracts cents per litre', () => {
    expect(effectivePrice(1.459, { type: 'CTS', value: 5 })).toBe(1.409);
    expect(effectivePrice(1.459, { type: 'CTS', value: 2.5 })).toBe(1.434);
  });

  it('subtracts a percentage, rounded to 3 decimals', () => {
    expect(effectivePrice(1.5, { type: 'PCT', value: 3 })).toBe(1.455);
    expect(effectivePrice(1.459, { type: 'PCT', value: 3 })).toBe(1.415);
  });

  it('never goes below zero', () => {
    expect(effectivePrice(0.03, { type: 'CTS', value: 5 })).toBe(0);
  });
});

describe('costBreakdown', () => {
  const car = { tankLitres: 50, consumptionL100km: 6 };

  it('without a car, only reports the round trip', () => {
    expect(costBreakdown(1.5, 4, null)).toEqual({
      roundTripKm: 8,
      tankCost: null,
      tripLitres: null,
      tripCost: null,
      totalCost: null,
    });
    expect(costBreakdown(1.5, null, null).roundTripKm).toBeNull();
  });

  it('without a price, reports nothing but the round trip', () => {
    expect(costBreakdown(null, 4, car).totalCost).toBeNull();
    expect(costBreakdown(null, 4, car).roundTripKm).toBe(8);
  });

  it('adds the cost of driving there and back to a full tank', () => {
    const r = costBreakdown(1.5, 10, car);
    expect(r.roundTripKm).toBe(20);
    expect(r.tankCost).toBeCloseTo(75, 9);
    expect(r.tripLitres).toBeCloseTo(1.2, 9);
    expect(r.tripCost).toBeCloseTo(1.8, 9);
    expect(r.totalCost).toBeCloseTo(76.8, 9);
  });

  it('treats an unknown distance as 0 km when there is a car', () => {
    const r = costBreakdown(1.5, null, car);
    expect(r.roundTripKm).toBe(0);
    expect(r.tripCost).toBe(0);
    expect(r.totalCost).toBeCloseTo(75, 9);
  });

  it('makes a cheaper but farther station lose when the trip costs more than it saves', () => {
    const near = costBreakdown(1.5, 1, car)!.totalCost!;
    const far = costBreakdown(1.48, 20, car)!.totalCost!;
    expect(far).toBeGreaterThan(near);
  });
});
