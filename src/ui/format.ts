/**
 * Turns domain data into localised text for the UI (uses the active translator).
 */
import { UNBRANDED } from '../config/brands';
import type { AgeFilterOption } from '../domain/ageFilter';
import { isAppError } from '../domain/errors';
import type { Discount, FuelType, PriceStaleness } from '../domain/types';
import type { MessageKey } from '../i18n';
import type { HistoryStatus } from '../state/appState';
import { i18n } from './i18nContext';

export const fuelLabel = (fuel: FuelType): string => i18n().t(`fuel.${fuel}`);

/** Brand as shown to the user ("SIN MARCA" is a data value; it's translated here). */
export const brandLabel = (brand: string): string =>
  brand === UNBRANDED ? i18n().t('station.unbranded') : brand;

export const stationName = (name: string): string => name || i18n().t('station.unnamed');

/** €/l with 3 decimals, e.g. "1,459 €/l". */
export const pricePerLitre = (value: number): string =>
  i18n().t('unit.pricePerLitre', { value: i18n().number(value, 3) });

export const euros = (value: number): string => i18n().number(value, 2);
export const km = (value: number): string => i18n().number(value, 1);

/** "-5 cts/l" or "-3%"; empty for no discount. */
export function discountLabel(discount: Discount | null | undefined): string {
  if (!discount || !discount.value) return '';
  const value = i18n().decimal(discount.value);
  return i18n().t(discount.type === 'PCT' ? 'discounts.labelPercent' : 'discounts.labelCents', { value });
}

/** How long a price has gone unchanged. */
export function stalenessText(bulletinDate: string, info: PriceStaleness | null): string {
  const { t, plural, date } = i18n();
  if (!info)
    return bulletinDate ? t('staleness.pending', { date: date(bulletinDate) }) : t('staleness.pendingNoDate');
  const params = { days: info.days, date: date(info.since) };
  // days === windowDays: every checked day had the same price, so it is at least that old.
  if (info.windowDays > 0 && info.days >= info.windowDays) {
    return info.days === 1
      ? t('staleness.yesterdayOrEarlier', params)
      : plural('staleness.atLeast', info.days, params);
  }
  if (info.days === 0) return t('staleness.today', params);
  if (info.days === 1) return t('staleness.yesterday', params);
  return plural('staleness.days', info.days, params);
}

export const AGE_OPTION_LABELS: Record<AgeFilterOption, MessageKey> = {
  all: 'filters.ageOption.all',
  updatedToday: 'filters.ageOption.updatedToday',
  atMost1: 'filters.ageOption.atMost1',
  atMost2: 'filters.ageOption.atMost2',
  atMost3: 'filters.ageOption.atMost3',
  atMostCustom: 'filters.ageOption.atMostCustom',
  exactly1: 'filters.ageOption.exactly1',
  exactly2: 'filters.ageOption.exactly2',
  moreThan3: 'filters.ageOption.moreThan3',
  moreThanCustom: 'filters.ageOption.moreThanCustom',
};

const AGE_STATUS: Record<AgeFilterOption, MessageKey | null> = {
  all: null,
  updatedToday: 'status.age.updatedToday',
  atMost1: 'status.age.atMost1',
  atMost2: 'status.age.atMost2',
  atMost3: 'status.age.atMost3',
  atMostCustom: 'status.age.atMostCustom',
  exactly1: 'status.age.exactly1',
  exactly2: 'status.age.exactly2',
  moreThan3: 'status.age.moreThan3',
  moreThanCustom: 'status.age.moreThanCustom',
};

export interface StatusSummary {
  count: number;
  fuel: FuelType;
  carName: string | null;
  ageOption: AgeFilterOption;
  customDays: number;
  checkingHistory: boolean;
  sortedByTotalCost: boolean;
  sortedByDistance: boolean;
  hasRoute: boolean;
  radiusKm: number;
  /** Favourites mode: "N favourites", and the radius or route doesn't apply. */
  favouritesOnly: boolean;
}

/** The results panel's status line, e.g. "27 gasolineras · Gasolina 95 · SEAT León · orden: €/l · máx. 15 km". */
export function statusSummary(s: StatusSummary): string {
  const { t, plural, decimal } = i18n();
  const age = AGE_STATUS[s.ageOption];
  return [
    s.favouritesOnly ? plural('favourites.summary', s.count) : plural('status.count', s.count),
    fuelLabel(s.fuel),
    s.carName,
    age && t(age, { days: s.customDays }),
    s.checkingHistory && t('status.checkingHistory'),
    t(
      s.sortedByDistance
        ? 'status.sortByDistance'
        : s.sortedByTotalCost
          ? 'status.sortByCost'
          : 'status.sortByPrice',
    ),
    s.favouritesOnly
      ? null
      : s.hasRoute
        ? t('status.onRoute')
        : t('status.maxDistance', { km: decimal(s.radiusKm) }),
  ]
    .filter(Boolean)
    .join(' · ');
}

export function historyStatusText(h: NonNullable<HistoryStatus>): string {
  const { t } = i18n();
  if (h.status === 'loading') return t('history.loading', { days: h.days });
  if (h.status === 'done') return t('history.done', { days: h.days });
  return t('history.error');
}

/** A thrown error as a sentence in the user's language. */
export function errorText(error: unknown): string {
  if (isAppError(error)) return i18n().t(`errors.${error.code}`, error.params);
  return error instanceof Error ? error.message : String(error);
}
