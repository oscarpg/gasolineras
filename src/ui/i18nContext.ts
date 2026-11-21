import { createI18n, DEFAULT_LOCALE, type I18n, type MessageKey } from '../i18n';

let current: I18n = createI18n(DEFAULT_LOCALE);

/** The active translator. Components call this while rendering, so a language change applies on the next render. */
export const i18n = (): I18n => current;

export function setI18n(next: I18n): void {
  current = next;
}

/**
 * Translates the static markup of index.html: elements with `data-i18n` get their
 * text replaced; `data-i18n-placeholder`, `data-i18n-title` and `data-i18n-aria-label`
 * set those attributes.
 * Also updates <html lang> and the page title.
 */
export function translateStaticText(root: ParentNode = document): void {
  const { t, locale } = current;
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]'))
    el.textContent = t(el.dataset.i18n as MessageKey);
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-placeholder]')) {
    el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder as MessageKey));
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
    el.setAttribute('title', t(el.dataset.i18nTitle as MessageKey));
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-aria-label]')) {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel as MessageKey));
  }
  document.documentElement.lang = locale;
  document.title = t('app.title');
}
