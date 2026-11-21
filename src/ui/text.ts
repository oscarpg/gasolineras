/**
 * Every user-visible string the UI builds, in one place.
 * Phase 5b replaces these with i18n keys (Spanish + English) and Intl formatting.
 */
import { FUELS } from '../config/fuels';
import type { AgeFilterPreset } from '../domain/ageFilter';
import type { Discount, FuelType, PriceStaleness } from '../domain/types';
import type { HistoryStatus } from '../state/appState';

export const fuelLabel = (fuel: FuelType): string => FUELS[fuel].label;

/** "-5 cts/l" or "-3%"; empty for no discount. */
export function discountLabel(discount: Discount | null | undefined): string {
  if (!discount || !discount.value) return '';
  return discount.type === 'PCT' ? `-${discount.value}%` : `-${discount.value} cts/l`;
}

/** How long a price has gone unchanged, e.g. "🕒 2 días sin actualizar (desde 19-11-2026)". */
export function stalenessText(bulletinDate: string, info: PriceStaleness | null): string {
  if (!info) {
    return bulletinDate
      ? `📅 Boletín MITECO: ${bulletinDate} (comprobando histórico…)`
      : '📅 Comprobando histórico…';
  }
  const limit = info.windowDays - 1 || 3;
  if (info.days === 0) return `🟢 Actualizado hoy (${info.since})`;
  if (info.days === 1) return `🕒 1 día sin actualizar (desde ${info.since})`;
  if (info.days <= limit) return `🕒 ${info.days} días sin actualizar (desde ${info.since})`;
  return `⚠️ +${limit} días sin actualizar (≤ ${info.since})`;
}

const AGE_SUMMARY: Record<AgeFilterPreset, (days: number) => string> = {
  TODAS: () => '',
  '0': () => ' · act. hoy',
  '1': () => ' · ≤ 1d sin act.',
  '2': () => ' · ≤ 2d sin act.',
  '3': () => ' · ≤ 3d sin act.',
  MAX_X: (d) => ` · ≤ ${d}d sin act.`,
  EXACTO_1: () => ' · 1d sin act.',
  EXACTO_2: () => ' · 2d sin act.',
  MAS_3: () => ' · > 3d sin act.',
  MAS_X: (d) => ` · > ${d}d sin act.`,
};

export interface StatusSummary {
  count: number;
  fuel: FuelType;
  carName: string | null;
  agePreset: AgeFilterPreset;
  customDays: number;
  checkingHistory: boolean;
  sortedByTotalCost: boolean;
  hasRoute: boolean;
  radiusKm: number;
}

/** The results panel's status line. */
export function statusSummary(s: StatusSummary): string {
  return (
    `${s.count} gasolineras · ${fuelLabel(s.fuel)}` +
    (s.carName ? ` · ${s.carName}` : '') +
    AGE_SUMMARY[s.agePreset](s.customDays) +
    (s.checkingHistory ? ' · ⏳ comprobando histórico…' : '') +
    (s.sortedByTotalCost ? ' · orden: coste total' : ' · orden: €/l') +
    (s.hasRoute ? ' · en ruta' : ` · máx. ${s.radiusKm} km`)
  );
}

export function historyStatusText(h: NonNullable<HistoryStatus>): string {
  if (h.status === 'loading') return `⏳ Comprobando histórico de precios (${h.days} días)…`;
  if (h.status === 'done') return `✅ Histórico comprobado (${h.days} días hacia atrás).`;
  return '⚠️ No se pudo comprobar todo el histórico.';
}

export const TEXT = {
  sortByCostNoCar: 'Selecciona un coche para ordenar por coste total (depósito + viaje)',
  sortByCostWithCar: (car: string) => `Ordenar por coste total con ${car} (depósito + ida y vuelta)`,
  noCars: 'No hay coches configurados.',
  carIncomplete: 'Completa el nombre, tamaño de depósito (L) y consumo (l/100km).',
  noDiscounts: 'Sin descuentos configurados.',
  chooseBrand: 'Selecciona una marca…',
  noStations: 'Sin gasolineras',
  noResults: 'Ninguna gasolinera cumple el filtro.',
  locating: 'Obteniendo tu ubicación…',
  locatingGps: 'Obteniendo ubicación GPS…',
  gpsError: (message: string) => `Error GPS: ${message}. Usa Preferencias para buscar dirección.`,
  noLocationYet: 'Abre Preferencias (⚙️) o pulsa 📍 para indicar tu ubicación.',
  noGeolocation: 'Abre Preferencias (⚙️) para buscar una dirección.',
  findingProvince: 'Determinando provincia…',
  provinceUnknown: 'No se pudo determinar la provincia correspondiente.',
  downloadingProvince: (code: string) => `Descargando datos de la provincia (${code})…`,
  provinceError: (message: string) => `Error cargando provincia: ${message}`,
  searchingAddress: 'Buscando dirección…',
  addressNotFound: 'Dirección no encontrada',
  genericError: (message: string) => `Error: ${message}`,
  originFirst: 'Indica primero tu ubicación de origen',
  calculatingRoute: 'Calculando ruta…',
  destinationNotFound: 'Destino no encontrado',
  routeNotFound: 'No se pudo calcular la ruta',
  routeError: (message: string) => `Error de ruta: ${message}`,
  yourLocation: 'Tu ubicación / Origen',
  loadingChart: 'Cargando histórico de 7 días…',
  noHistory: 'Sin datos históricos disponibles.',
  historyError: 'Error al cargar histórico.',
  noPriceChanges: 'Sin variaciones de precio en los días consultados.',
  today: 'Hoy',
  active: 'Activo',
  use: 'Usar',
  deleteCar: 'Eliminar coche',
  deleteDiscount: 'Eliminar descuento',
  all: 'Todas',
  priceHistoryButton: '📈 Ver evolución (7 días)',
} as const;
