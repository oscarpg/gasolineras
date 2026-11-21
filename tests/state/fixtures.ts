import { DEFAULT_PREFERENCES, type Preferences } from '../../src/domain/preferences';
import type { BrandedStation, FuelPrices, Station } from '../../src/domain/types';
import { createInitialState, type AppState } from '../../src/state/appState';

export const prices = (p: Partial<FuelPrices>): FuelPrices => ({
  GASOLEO_A: null,
  GASOLEO_PREMIUM: null,
  GASOLINA_95: null,
  GASOLINA_98: null,
  GLP: null,
  GNC: null,
  GNL: null,
  ...p,
});

export function station(id: string, overrides: Partial<Station> = {}): Station {
  return {
    id,
    code: id,
    provinceCode: '28',
    bulletinDate: '21/11/2026',
    name: 'REPSOL',
    address: `Calle ${id}`,
    lat: 40.4,
    lon: -3.7,
    openingHours: '24H',
    prices: prices({ GASOLINA_95: 1.5 }),
    ...overrides,
  };
}

export const branded = (id: string, overrides: Partial<BrandedStation> = {}): BrandedStation => ({
  ...station(id),
  brand: 'REPSOL',
  ...overrides,
});

export const state = (prefs: Partial<Preferences> = {}, extra: Partial<AppState> = {}): AppState => ({
  ...createInitialState({ ...DEFAULT_PREFERENCES, ...prefs }),
  ...extra,
});

export const LEON = {
  id: 'c1',
  name: 'León',
  fuel: 'GASOLINA_95' as const,
  tankLitres: 50,
  consumptionL100km: 6,
};
export const VAN = {
  id: 'c2',
  name: 'Van',
  fuel: 'GASOLEO_A' as const,
  tankLitres: 70,
  consumptionL100km: 8.5,
};
