import type { FuelType } from '../domain/types';

export interface FuelDefinition {
  /** Display label (Spanish). Moves to i18n keys in Phase 5. */
  label: string;
  /** Field name of this fuel's price in MITECO responses. */
  mitecoField: string;
}

/** Supported fuels, in the order they appear in the selects. */
export const FUELS: Readonly<Record<FuelType, FuelDefinition>> = {
  GASOLEO_A: { label: 'Diésel', mitecoField: 'Precio Gasoleo A' },
  GASOLEO_PREMIUM: { label: 'Diésel Premium', mitecoField: 'Precio Gasoleo Premium' },
  GASOLINA_95: { label: 'Gasolina 95', mitecoField: 'Precio Gasolina 95 E5' },
  GASOLINA_98: { label: 'Gasolina 98', mitecoField: 'Precio Gasolina 98 E5' },
  GLP: { label: 'Autogás (GLP)', mitecoField: 'Precio Gases licuados del petróleo' },
  GNC: { label: 'GNC', mitecoField: 'Precio Gas natural comprimido' },
  GNL: { label: 'GNL', mitecoField: 'Precio Gas natural licuado' },
};

export const FUEL_TYPES = Object.keys(FUELS) as FuelType[];

export const DEFAULT_FUEL: FuelType = 'GASOLINA_95';

export function isFuelType(value: unknown): value is FuelType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(FUELS, value);
}
