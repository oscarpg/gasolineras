import { describe, expect, it } from 'vitest';
import { normalizeBrand } from '../../src/domain/brands';

describe('normalizeBrand', () => {
  it('finds a known brand anywhere in the sign, as a whole word', () => {
    expect(normalizeBrand('E.S. REPSOL ALCALÁ')).toBe('REPSOL');
    expect(normalizeBrand('area de servicio cepsa km 23')).toBe('CEPSA');
    expect(normalizeBrand('BP OIL ESPAÑA')).toBe('BP');
    expect(normalizeBrand('ENI IBERIA')).toBe('ENI');
  });

  it('does not match a brand that is only part of a longer word', () => {
    // "BP" inside "BPXYZ" must not count as BP
    expect(normalizeBrand('BPXYZ CARBURANTES')).toBe('BPXYZ CARBURANTES');
  });

  it('ignores accents and case', () => {
    expect(normalizeBrand('bonÀrea agrupa')).toBe('BONAREA');
    expect(normalizeBrand('Petroprix Móstoles')).toBe('PETROPRIX');
  });

  it('maps alias spellings to one canonical name', () => {
    expect(normalizeBrand('BONÀREA')).toBe('BONAREA');
    expect(normalizeBrand('BONAREA')).toBe('BONAREA');
  });

  it('respects brand priority when several match', () => {
    // REPSOL comes before CAMPSA in KNOWN_BRANDS
    expect(normalizeBrand('CAMPSA - REPSOL')).toBe('REPSOL');
  });

  it('strips generic prefixes and keeps the text before a separator for unknown brands', () => {
    expect(normalizeBrand('GASOLINERA LOS PINOS - CARRETERA N-II')).toBe('LOS PINOS');
    expect(normalizeBrand('ESTACION DE SERVICIO EL CRUCE / KM 4')).toBe('EL CRUCE');
    expect(normalizeBrand('E.S. VALDEMORO , S.L.')).toBe('VALDEMORO');
  });

  it('returns "SIN MARCA" for empty input', () => {
    expect(normalizeBrand('')).toBe('SIN MARCA');
    expect(normalizeBrand('   ')).toBe('SIN MARCA');
    expect(normalizeBrand()).toBe('SIN MARCA');
  });
});
