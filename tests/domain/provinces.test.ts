import { describe, expect, it } from 'vitest';
import { provinceCodeFromAddress } from '../../src/domain/provinces';

describe('provinceCodeFromAddress', () => {
  it('uses the first two digits of the postcode', () => {
    expect(provinceCodeFromAddress({ postcode: '28013' })).toBe('28');
    expect(provinceCodeFromAddress({ postcode: '08001' })).toBe('08');
  });

  it('pads short or numeric postcodes', () => {
    expect(provinceCodeFromAddress({ postcode: 8001 })).toBe('08');
    expect(provinceCodeFromAddress({ postcode: '1001' })).toBe('01');
  });

  it('ignores postcodes outside 01–52 and falls back to the name', () => {
    expect(provinceCodeFromAddress({ postcode: '99999', province: 'Sevilla' })).toBe('41');
    expect(provinceCodeFromAddress({ postcode: '00000' })).toBeNull();
  });

  it('matches province names case-insensitively, including co-official names', () => {
    expect(provinceCodeFromAddress({ province: 'Valencia / València' })).toBe('46');
    expect(provinceCodeFromAddress({ province: 'BIZKAIA' })).toBe('48');
    expect(provinceCodeFromAddress({ province: 'A Coruña' })).toBe('15');
  });

  it('falls back to the state (region) when there is no province', () => {
    expect(provinceCodeFromAddress({ state: 'Comunidad de Madrid' })).toBe('28');
    expect(provinceCodeFromAddress({ state: 'Principado de Asturias' })).toBe('33');
  });

  it('returns null when nothing matches', () => {
    expect(provinceCodeFromAddress({})).toBeNull();
    expect(provinceCodeFromAddress()).toBeNull();
    expect(provinceCodeFromAddress({ province: 'Île-de-France' })).toBeNull();
  });
});
