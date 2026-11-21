import { describe, expect, it } from 'vitest';
import { AGE_FILTER_OPTION_IDS } from '../../src/domain/ageFilter';
import { AppError } from '../../src/domain/errors';
import { createI18n, resolveLocale, type MessageKey } from '../../src/i18n';
import { en } from '../../src/i18n/en';
import { es } from '../../src/i18n/es';
import { errorText, stalenessText, statusSummary } from '../../src/ui/format';
import { setI18n } from '../../src/ui/i18nContext';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('catalogues', () => {
  it('English has exactly the Spanish keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });

  it('every translation uses the same placeholders as Spanish', () => {
    for (const key of Object.keys(es) as MessageKey[]) {
      expect([key, ...placeholders(en[key])]).toEqual([key, ...placeholders(es[key])]);
    }
  });

  it('has no empty texts', () => {
    expect(Object.values(es).filter((v) => !v.trim())).toEqual([]);
    expect(Object.values(en).filter((v) => !v.trim())).toEqual([]);
  });

  it('has a label for every age-filter option', () => {
    for (const id of AGE_FILTER_OPTION_IDS) expect(`filters.ageOption.${id}` in es).toBe(true);
  });
});

describe('createI18n', () => {
  const tEs = createI18n('es');
  const tEn = createI18n('en');

  it('interpolates parameters and leaves unknown ones visible', () => {
    expect(tEs.t('message.downloadingProvince', { code: '28' })).toBe(
      'Descargando datos de la provincia (28)…',
    );
    expect(tEn.t('message.downloadingProvince')).toBe('Downloading data for province {code}…');
  });

  it('chooses plural forms', () => {
    expect(tEs.plural('status.count', 1)).toBe('1 gasolinera');
    expect(tEs.plural('status.count', 27)).toBe('27 gasolineras');
    expect(tEn.plural('status.count', 1)).toBe('1 station');
    expect(tEn.plural('status.count', 0)).toBe('0 stations');
  });

  it('formats numbers in each language’s style', () => {
    expect(tEs.number(1.459, 3)).toBe('1,459');
    expect(tEn.number(1.459, 3)).toBe('1.459');
    expect(tEs.number(76.8, 2)).toBe('76,80');
    expect(tEs.decimal(6.2)).toBe('6,2');
    expect(tEs.decimal(50)).toBe('50');
  });

  it('formats MITECO dates (both formats) day-first in both languages', () => {
    expect(tEs.date('16-11-2026')).toBe('16/11/2026');
    expect(tEs.date('21/11/2026 9:05:12')).toBe('21/11/2026');
    expect(tEn.date('05-01-2026')).toBe('05/01/2026');
    expect(tEs.date('not a date')).toBe('not a date');
    expect(tEs.dayMonth(new Date(2026, 10, 15))).toBe('15/11');
  });
});

describe('resolveLocale', () => {
  it('prefers the user’s choice, then the browser, then Spanish', () => {
    expect(resolveLocale('en', ['es-ES'])).toBe('en');
    expect(resolveLocale(null, ['fr-FR', 'en-US', 'es'])).toBe('en');
    expect(resolveLocale(null, ['ES-es'])).toBe('es');
    expect(resolveLocale(null, ['de', 'fr'])).toBe('es');
    expect(resolveLocale(null, [])).toBe('es');
  });
});

describe('UI text in both languages', () => {
  const summary = {
    count: 27,
    fuel: 'GASOLINA_95' as const,
    carName: 'León',
    ageOption: 'atMostCustom' as const,
    customDays: 6,
    checkingHistory: true,
    sortedByTotalCost: true,
    hasRoute: false,
    radiusKm: 15,
  };

  it('status line', () => {
    setI18n(createI18n('es'));
    expect(statusSummary(summary)).toBe(
      '27 gasolineras · Gasolina 95 · León · ≤ 6d sin act. · ⏳ comprobando histórico… · orden: coste total · máx. 15 km',
    );
    setI18n(createI18n('en'));
    expect(
      statusSummary({ ...summary, ageOption: 'all', checkingHistory: false, carName: null, hasRoute: true }),
    ).toBe('27 stations · Petrol 95 · sort: total cost · on route');
    setI18n(createI18n('es'));
  });

  it('staleness', () => {
    setI18n(createI18n('en'));
    expect(stalenessText('21/11/2026', null)).toBe('📅 MITECO bulletin: 21/11/2026 (checking history…)');
    expect(stalenessText('', { days: 1, since: '20-11-2026', windowDays: 4 })).toBe(
      '🕒 Unchanged for 1 day (since 20/11/2026)',
    );
    expect(stalenessText('', { days: 4, since: '17-11-2026', windowDays: 4 })).toBe(
      '⚠️ Unchanged for 3+ days (≤ 17/11/2026)',
    );
    setI18n(createI18n('es'));
    expect(stalenessText('', { days: 2, since: '19-11-2026', windowDays: 4 })).toBe(
      '🕒 2 días sin actualizar (desde 19/11/2026)',
    );
  });

  it('errors are shown in the user’s language', () => {
    setI18n(createI18n('en'));
    expect(errorText(new AppError('http', { status: 429 }))).toBe('the server returned an error (HTTP 429)');
    expect(errorText(new AppError('download-failed'))).toBe('Could not download the station data.');
    expect(errorText(new Error('plain'))).toBe('plain');
    setI18n(createI18n('es'));
    expect(errorText(new AppError('geolocation-denied'))).toBe('permiso de ubicación denegado');
  });
});
