/**
 * Translation and formatting. Platform-free (only `Intl`), so it can be reused
 * by a mobile app.
 */
import { parseMitecoDate } from '../domain/dates';
import type { Locale } from '../domain/preferences';
import { en } from './en';
import { es, type MessageKey } from './es';

export type { Locale, MessageKey };

export const SUPPORTED_LOCALES: readonly Locale[] = ['es', 'en'];
export const DEFAULT_LOCALE: Locale = 'es';

/** Locale passed to Intl formatters: Spain's conventions for Spanish, British (day/month) for English. */
const INTL_LOCALE: Record<Locale, string> = { es: 'es-ES', en: 'en-GB' };

const CATALOGS: Record<Locale, Record<MessageKey, string>> = { es, en };

export type MessageParams = Record<string, string | number>;

/** Keys that come in `.one` / `.other` pairs, without the suffix. */
export type PluralKey = { [K in MessageKey]: K extends `${infer Base}.one` ? Base : never }[MessageKey];

export interface I18n {
  readonly locale: Locale;
  /** Translates a key, replacing {placeholders}. */
  t(key: MessageKey, params?: MessageParams): string;
  /** Translates a plural key, choosing `.one` or `.other` for `count` ({count} is filled in). */
  plural(key: PluralKey, count: number, params?: MessageParams): string;
  /** Number with exactly `decimals` decimals in the locale's style (1,459 / 1.459). */
  number(value: number, decimals: number): string;
  /** Number with up to `maxDecimals` decimals (6,2 / 6.2; 50). */
  decimal(value: number, maxDecimals?: number): string;
  /** A MITECO date ("dd-mm-yyyy" or "dd/mm/yyyy …") as a localised date; unparsable text is returned as-is. */
  date(mitecoDate: string): string;
  /** Short day/month label, e.g. "15/11". */
  dayMonth(date: Date): string;
}

const interpolate = (template: string, params: MessageParams = {}) =>
  template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));

export function createI18n(locale: Locale): I18n {
  const messages = CATALOGS[locale];
  const intlLocale = INTL_LOCALE[locale];
  const pluralRules = new Intl.PluralRules(intlLocale);
  const fixed = new Map<number, Intl.NumberFormat>();
  const upTo = new Map<number, Intl.NumberFormat>();
  const dateFormat = new Intl.DateTimeFormat(intlLocale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const dayMonthFormat = new Intl.DateTimeFormat(intlLocale, { day: 'numeric', month: 'numeric' });

  const cached = (cache: Map<number, Intl.NumberFormat>, digits: number, min: number) => {
    let format = cache.get(digits);
    if (!format) {
      format = new Intl.NumberFormat(intlLocale, {
        minimumFractionDigits: min,
        maximumFractionDigits: digits,
      });
      cache.set(digits, format);
    }
    return format;
  };

  const t = (key: MessageKey, params?: MessageParams) => interpolate(messages[key], params);

  return {
    locale,
    t,
    plural(key, count, params) {
      const form = pluralRules.select(count) === 'one' ? 'one' : 'other';
      return t(`${key}.${form}` as MessageKey, { count, ...params });
    },
    number: (value, decimals) => cached(fixed, decimals, decimals).format(value),
    decimal: (value, maxDecimals = 2) => cached(upTo, maxDecimals, 0).format(value),
    date(mitecoDate) {
      const parsed = parseMitecoDate(mitecoDate);
      return parsed ? dateFormat.format(parsed) : mitecoDate;
    },
    dayMonth: (date) => dayMonthFormat.format(date),
  };
}

/**
 * The locale to use: the user's choice if any, otherwise the first supported
 * language the browser prefers, otherwise Spanish.
 */
export function resolveLocale(preferred: Locale | null, browserLanguages: readonly string[]): Locale {
  if (preferred) return preferred;
  for (const tag of browserLanguages) {
    const base = tag.toLowerCase().split('-')[0];
    const match = SUPPORTED_LOCALES.find((l) => l === base);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

/** Native names of the languages, shown in the language menu (never translated). */
export const LANGUAGE_NAMES: Record<Locale, string> = { es: 'Español', en: 'English' };
