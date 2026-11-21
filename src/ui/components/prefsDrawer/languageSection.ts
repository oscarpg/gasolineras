import { LANGUAGE_NAMES, SUPPORTED_LOCALES } from '../../../i18n';
import type { AppState } from '../../../state/appState';
import type { Store } from '../../../state/store';
import { setPreferences } from '../../../state/transitions';
import { byId, html, setHtml, syncValue } from '../../dom';
import { i18n } from '../../i18nContext';

/** "Language": automatic (browser) or a fixed language. Stored in preferences.locale. */
export function createLanguageSection(store: Store<AppState>) {
  const select = byId<HTMLSelectElement>('language');
  let lastLocale: string | null = null;

  select.addEventListener('change', () => {
    const value = select.value;
    const locale = SUPPORTED_LOCALES.find((l) => l === value) ?? null;
    store.update((s) => setPreferences(s, { locale }));
  });

  return {
    render(state: AppState) {
      const { t, locale } = i18n();
      if (locale !== lastLocale) {
        lastLocale = locale;
        setHtml(
          select,
          html`<option value="">${t('language.auto')}</option>${SUPPORTED_LOCALES.map(
            (l) => html`<option value="${l}" lang="${l}">${LANGUAGE_NAMES[l]}</option>`,
          )}`,
        );
      }
      syncValue(select, state.preferences.locale ?? '');
    },
  };
}
