import type { FuelType } from '../domain/types';

export interface FuelDefinition {
  /**
   * Field name of this fuel's price in MITECO responses. Matched case-insensitively,
   * because MITECO has changed capitalisation before (e.g. "Gas Natural Comprimido").
   * Display names live in i18n (`fuel.<TYPE>`).
   */
  mitecoField: string;
}

/** Supported fuels, in the order they appear in the menus. */
export const FUELS: Readonly<Record<FuelType, FuelDefinition>> = {
  GASOLEO_A: { mitecoField: 'Precio Gasoleo A' },
  GASOLEO_PREMIUM: { mitecoField: 'Precio Gasoleo Premium' },
  GASOLINA_95: { mitecoField: 'Precio Gasolina 95 E5' },
  GASOLINA_98: { mitecoField: 'Precio Gasolina 98 E5' },
  GLP: { mitecoField: 'Precio Gases licuados del petróleo' },
  GNC: { mitecoField: 'Precio Gas Natural Comprimido' },
  GNL: { mitecoField: 'Precio Gas Natural Licuado' },
};

export const FUEL_TYPES = Object.keys(FUELS) as FuelType[];

export const DEFAULT_FUEL: FuelType = 'GASOLINA_95';

export function isFuelType(value: unknown): value is FuelType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(FUELS, value);
}
