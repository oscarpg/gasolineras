import { describe, expect, it } from 'vitest';
import { distanceKm, distanceToRouteKm, distanceToSegmentKm } from '../../src/domain/geo';
import type { LatLng } from '../../src/domain/types';

const SOL: LatLng = [40.4168, -3.7038];
const ATOCHA: LatLng = [40.4065, -3.6895];

describe('distanceKm', () => {
  it('is 0 for the same point', () => {
    expect(distanceKm(SOL, SOL)).toBe(0);
  });

  it('gives about 111.32 km per degree of latitude', () => {
    expect(distanceKm([40, -3], [41, -3])).toBeCloseTo(111.32, 2);
  });

  it('scales longitude by the cosine of the latitude', () => {
    expect(distanceKm([0, 0], [0, 1])).toBeCloseTo(111.32, 2);
    expect(distanceKm([60, 0], [60, 1])).toBeCloseTo(55.66, 2);
  });

  it('matches a known short distance (Sol → Atocha ≈ 1.7 km)', () => {
    expect(distanceKm(SOL, ATOCHA)).toBeCloseTo(1.7, 1);
  });
});

describe('distanceToSegmentKm', () => {
  const a: LatLng = [40, -3];
  const b: LatLng = [40, -2];

  it('is the perpendicular distance when the point projects inside the segment', () => {
    expect(distanceToSegmentKm([40.1, -2.5], a, b)).toBeCloseTo(11.132, 3);
  });

  it('is the distance to the nearest end when the point projects outside', () => {
    const p: LatLng = [40, -4];
    expect(distanceToSegmentKm(p, a, b)).toBeCloseTo(distanceKm(p, a), 6);
  });

  it('handles a zero-length segment', () => {
    expect(distanceToSegmentKm([40.1, -3], a, a)).toBeCloseTo(11.132, 3);
  });
});

describe('distanceToRouteKm', () => {
  it('is Infinity for a missing or empty route', () => {
    expect(distanceToRouteKm(SOL, null)).toBe(Infinity);
    expect(distanceToRouteKm(SOL, [])).toBe(Infinity);
  });

  it('is the point distance for a single-point route', () => {
    expect(distanceToRouteKm(SOL, [ATOCHA])).toBeCloseTo(distanceKm(SOL, ATOCHA), 9);
  });

  it('takes the closest segment of the polyline', () => {
    const route: LatLng[] = [
      [40, -3],
      [40, -2],
      [41, -2],
    ];
    // Next to the second segment (vertical line at lon -2)
    expect(distanceToRouteKm([40.5, -2.1], route)).toBeLessThan(10);
    expect(distanceToRouteKm([40.5, -2.1], route)).toBeCloseTo(
      distanceToSegmentKm([40.5, -2.1], [40, -2], [41, -2]),
      9,
    );
  });
});
