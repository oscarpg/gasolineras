import { describe, expect, it } from 'vitest';
import { memoryStorageAdapter } from '../../src/storage/adapter';
import {
  DEFAULT_PREFERENCES,
  LEGACY_PREFERENCES_KEY,
  PREFERENCES_KEY,
  loadPreferences,
  migrateV1,
  sanitizePreferences,
  savePreferences,
} from '../../src/storage/preferences';

/** Exactly what the original single-file app saved. */
const V1 = {
  fuel: 'GASOLEO_A',
  antiguedad: 'MAS_X',
  antiguedadDias: 5,
  searchRadius: 25,
  radius: 4.5,
  soloRuta: true,
  sortByRealCost: true,
  brands: ['REPSOL', 'CEPSA'],
  discounts: { REPSOL: { tipo: 'CTS', valor: 5 }, CEPSA: { tipo: 'PCT', valor: 3 } },
  cars: [
    { id: 'car_1', nombre: 'SEAT León', fuel: 'GASOLINA_95', deposito: 50, consumo: 6.2 },
    { id: 'car_2', nombre: 'Furgoneta', fuel: 'GASOLEO_A', deposito: 70, consumo: 8.5 },
  ],
  activeCarId: 'car_2',
};

describe('migrateV1', () => {
  it('converts every field of the original format', () => {
    expect(migrateV1(V1)).toEqual({
      schemaVersion: 4,
      fuel: 'GASOLEO_A',
      ageFilterOption: 'moreThanCustom',
      ageFilterCustomDays: 5,
      searchRadiusKm: 25,
      routeDetourKm: 4.5,
      routeOnly: true,
      sortByTotalCost: true,
      sortByDistance: false,
      brands: ['REPSOL', 'CEPSA'],
      discounts: { REPSOL: { type: 'CTS', value: 5 }, CEPSA: { type: 'PCT', value: 3 } },
      cars: [
        { id: 'car_1', name: 'SEAT León', fuel: 'GASOLINA_95', tankLitres: 50, consumptionL100km: 6.2 },
        { id: 'car_2', name: 'Furgoneta', fuel: 'GASOLEO_A', tankLitres: 70, consumptionL100km: 8.5 },
      ],
      activeCarId: 'car_2',
      locale: null,
      favourites: [],
    });
  });

  it('turns an empty v1 object into defaults', () => {
    expect(migrateV1({})).toEqual(DEFAULT_PREFERENCES);
  });
});

describe('sanitizePreferences', () => {
  it('replaces invalid values with defaults', () => {
    const p = sanitizePreferences({
      fuel: 'KEROSENO',
      ageFilterOption: 'NOPE',
      ageFilterCustomDays: 'abc',
      searchRadiusKm: -3,
      routeDetourKm: 'x',
      routeOnly: 'yes',
      brands: ['OK', 7, null],
      locale: 'fr',
    });
    expect(p.fuel).toBe('GASOLINA_95');
    expect(p.ageFilterOption).toBe('all');
    expect(p.ageFilterCustomDays).toBe(3);
    expect(p.searchRadiusKm).toBe(15);
    expect(p.routeDetourKm).toBe(3);
    expect(p.routeOnly).toBe(false);
    expect(p.brands).toEqual(['OK']);
    expect(p.locale).toBeNull();
  });

  it('clamps numbers to the ranges the controls allow', () => {
    const p = sanitizePreferences({ ageFilterCustomDays: 40, searchRadiusKm: 500, routeDetourKm: 0.2 });
    expect(p.ageFilterCustomDays).toBe(10);
    expect(p.searchRadiusKm).toBe(50);
    expect(p.routeDetourKm).toBe(1);
  });

  it('drops invalid cars and discounts but keeps the valid ones', () => {
    const p = sanitizePreferences({
      cars: [
        { id: 'a', name: 'Ok', fuel: 'GLP', tankLitres: 40, consumptionL100km: 7 },
        { id: 'b', name: '', fuel: 'GLP', tankLitres: 40, consumptionL100km: 7 },
        { id: 'c', name: 'Bad fuel', fuel: 'XX', tankLitres: 40, consumptionL100km: 7 },
        { id: 'd', name: 'Zero tank', fuel: 'GLP', tankLitres: 0, consumptionL100km: 7 },
        'garbage',
      ],
      discounts: { A: { type: 'CTS', value: 2 }, B: { type: 'EUR', value: 2 }, C: { type: 'PCT', value: 0 } },
    });
    expect(p.cars.map((c) => c.id)).toEqual(['a']);
    expect(Object.keys(p.discounts)).toEqual(['A']);
  });

  it('upgrades v2 preferences (Spanish age-filter codes) to current options', () => {
    const v2 = { ...migrateV1(V1), schemaVersion: 2, ageFilterPreset: 'EXACTO_2' } as Record<string, unknown>;
    delete v2.ageFilterOption;
    const p = sanitizePreferences(v2);
    expect(p.schemaVersion).toBe(4);
    expect(p.ageFilterOption).toBe('exactly2');
    expect(p.cars).toHaveLength(2);
  });

  it('upgrades v3 preferences: no favourites, sorted by price', () => {
    const v3 = { ...migrateV1(V1), schemaVersion: 3 } as Record<string, unknown>;
    delete v3.favourites;
    delete v3.sortByDistance;
    const p = sanitizePreferences(v3);
    expect(p.schemaVersion).toBe(4);
    expect(p.favourites).toEqual([]);
    expect(p.sortByDistance).toBe(false);
    expect(p.cars).toHaveLength(2);
  });

  it('reads sortByDistance as a strict boolean', () => {
    expect(sanitizePreferences({ sortByDistance: true }).sortByDistance).toBe(true);
    expect(sanitizePreferences({ sortByDistance: 'yes' }).sortByDistance).toBe(false);
  });

  it('keeps valid favourites, drops invalid and duplicate ones', () => {
    const p = sanitizePreferences({
      favourites: [
        { id: 'a', provinceCode: '28', brand: 'REPSOL' },
        { id: 'b', province: '07', brand: 'CEPSA' }, // the key the Android app writes
        { id: 'c', provinceCode: '28' }, // no brand: kept, brand empty
        { id: 'a', provinceCode: '15', brand: 'X' }, // duplicate id
        { id: '', provinceCode: '28', brand: 'X' },
        { id: 'd', provinceCode: '53', brand: 'X' },
        { id: 'e', provinceCode: '00', brand: 'X' },
        { id: 'f', provinceCode: '8', brand: 'X' },
        { id: 'g', brand: 'X' },
        'junk',
      ],
    });
    expect(p.favourites).toEqual([
      { id: 'a', provinceCode: '28', brand: 'REPSOL' },
      { id: 'b', provinceCode: '07', brand: 'CEPSA' },
      { id: 'c', provinceCode: '28', brand: '' },
    ]);
    expect(sanitizePreferences({ favourites: 'nope' }).favourites).toEqual([]);
  });

  it('is idempotent', () => {
    const once = migrateV1(V1);
    expect(sanitizePreferences(once)).toEqual(once);
  });
});

describe('loadPreferences / savePreferences', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadPreferences(memoryStorageAdapter())).toEqual(DEFAULT_PREFERENCES);
  });

  it('migrates the original app’s preferences on first load, without deleting them', () => {
    const storage = memoryStorageAdapter();
    storage.setItem(LEGACY_PREFERENCES_KEY, JSON.stringify(V1));
    const prefs = loadPreferences(storage);
    expect(prefs.cars).toHaveLength(2);
    expect(prefs.discounts.REPSOL).toEqual({ type: 'CTS', value: 5 });
    expect(storage.getItem(LEGACY_PREFERENCES_KEY)).toBe(JSON.stringify(V1));
  });

  it('prefers the current format once it has been saved', () => {
    const storage = memoryStorageAdapter();
    storage.setItem(LEGACY_PREFERENCES_KEY, JSON.stringify(V1));
    savePreferences(storage, { ...migrateV1(V1), fuel: 'GLP' });
    expect(loadPreferences(storage).fuel).toBe('GLP');
  });

  it('survives corrupted JSON (the original app crashed on it)', () => {
    const storage = memoryStorageAdapter();
    storage.setItem(LEGACY_PREFERENCES_KEY, '{oops');
    expect(loadPreferences(storage)).toEqual(DEFAULT_PREFERENCES);
    storage.setItem(PREFERENCES_KEY, 'null');
    expect(loadPreferences(storage)).toEqual(DEFAULT_PREFERENCES);
  });

  it('round-trips', () => {
    const storage = memoryStorageAdapter();
    const prefs = migrateV1(V1);
    expect(savePreferences(storage, prefs)).toBe(true);
    expect(loadPreferences(storage)).toEqual(prefs);
  });

  it('reports failure instead of throwing when storage is full', () => {
    expect(savePreferences(memoryStorageAdapter(10), migrateV1(V1))).toBe(false);
  });
});
