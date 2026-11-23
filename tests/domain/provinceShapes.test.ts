import { beforeAll, describe, expect, it } from 'vitest';
import {
  loadProvinceShapes,
  parseProvinceShapes,
  type ProvinceShapes,
} from '../../src/domain/provinceShapes';
import type { LatLng } from '../../src/domain/types';

let shapes: ProvinceShapes;
beforeAll(async () => {
  shapes = await loadProvinceShapes();
});

describe('province outlines (bundled file, shared with Android)', () => {
  it('bundles all 52 provinces', () => {
    expect(shapes.codes).toEqual(Array.from({ length: 52 }, (_, i) => String(i + 1).padStart(2, '0')));
  });

  it('loads the file once', async () => {
    expect(await loadProvinceShapes()).toBe(shapes);
  });

  it('finds the province of well-known places', () => {
    expect(shapes.provinceAt([40.4168, -3.7038])).toBe('28'); // Puerta del Sol, Madrid
    expect(shapes.provinceAt([43.3623, -8.4115])).toBe('15'); // A Coruña
    expect(shapes.provinceAt([41.3874, 2.1686])).toBe('08'); // Barcelona
    expect(shapes.provinceAt([37.3891, -5.9845])).toBe('41'); // Sevilla
    expect(shapes.provinceAt([39.5696, 2.6502])).toBe('07'); // Palma (island)
    expect(shapes.provinceAt([28.4636, -16.2518])).toBe('38'); // Santa Cruz de Tenerife
    expect(shapes.provinceAt([35.8894, -5.3213])).toBe('51'); // Ceuta
    expect(shapes.provinceAt([39.8628, -4.0273])).toBe('45'); // Toledo
  });

  it('places outside Spain have no province', () => {
    expect(shapes.provinceAt([38.7223, -9.1393])).toBeNull(); // Lisboa
    expect(shapes.provinceAt([38.5, 5.5])).toBeNull(); // open Mediterranean
    expect(shapes.provinceAt([48.8566, 2.3522])).toBeNull(); // Paris
  });

  it("the user's own province comes first, then neighbours within the radius", () => {
    // Aranjuez (Madrid) is ~5 km from Toledo province
    const near = shapes.provincesWithin([40.0333, -3.6033], 15);
    expect(near[0]).toBe('28');
    expect(near).toContain('45');
    expect(near).not.toContain('19'); // Guadalajara is ~40 km away
    expect(shapes.provincesWithin([40.4168, -3.7038], 15)).toEqual(['28']); // Madrid centre
  });

  it('a long route meets every province it crosses, in order', () => {
    // Straight line Madrid → Zaragoza (crosses Guadalajara and Soria)
    const madrid: LatLng = [40.4168, -3.7038];
    const zaragoza: LatLng = [41.6488, -0.8891];
    const route = Array.from({ length: 101 }, (_, i): LatLng => [
      madrid[0] + ((zaragoza[0] - madrid[0]) * i) / 100,
      madrid[1] + ((zaragoza[1] - madrid[1]) * i) / 100,
    ]);
    const along = shapes.provincesAlongRoute(route, 3);
    expect(along[0]).toBe('28');
    expect(along).toEqual(expect.arrayContaining(['19', '50']));
    expect(along.indexOf('19')).toBeLessThan(along.indexOf('50'));
    expect(along).not.toContain('08');
    expect(shapes.provincesAlongRoute([], 3)).toEqual([]);
  });
});

describe('parseProvinceShapes', () => {
  const square = parseProvinceShapes('# comment\n99|0,0;1,0;1,1;0,1;0,0\n');

  it('parses the text format', () => {
    expect(square.codes).toEqual(['99']);
    expect(square.provinceAt([0.5, 0.5])).toBe('99');
    expect(square.provinceAt([2, 2])).toBeNull();
  });

  it('measures the distance to the outline', () => {
    expect(square.provincesWithin([0.5, 0.5], 0)).toEqual(['99']); // inside
    expect(square.provincesWithin([0.5, 1.1], 10)).toEqual([]); // ~11 km east
    expect(square.provincesWithin([0.5, 1.1], 12)).toEqual(['99']);
  });

  it('a hole (second ring) is outside', () => {
    const ring = parseProvinceShapes('98|0,0;4,0;4,4;0,4;0,0|1,1;3,1;3,3;1,3;1,1');
    expect(ring.provinceAt([0.5, 0.5])).toBe('98');
    expect(ring.provinceAt([2, 2])).toBeNull();
  });
});
