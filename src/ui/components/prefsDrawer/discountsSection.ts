import { KNOWN_BRANDS } from '../../../config/brands';
import { normalizeBrand } from '../../../domain/brands';
import type { AppState } from '../../../state/appState';
import type { Store } from '../../../state/store';
import { removeDiscount, setDiscount } from '../../../state/transitions';
import { byId, delegate, html, setHtml } from '../../dom';
import { brandLabel, discountLabel } from '../../format';
import { i18n } from '../../i18nContext';

/** "Brand discounts": brand picker, amount, and the list of discounts. */
export function createDiscountsSection(store: Store<AppState>) {
  const brandSelect = byId<HTMLSelectElement>('discount-brand');
  const valueInput = byId<HTMLInputElement>('discount-value');
  const typeSelect = byId<HTMLSelectElement>('discount-type');
  const list = byId('discount-list');

  byId('add-discount').addEventListener('click', () => {
    const brand = brandSelect.value;
    const value = parseFloat(valueInput.value);
    const type = typeSelect.value === 'PCT' ? 'PCT' : 'CTS';
    if (!brand || !Number.isFinite(value) || value <= 0) return;
    valueInput.value = '';
    store.update((s) => setDiscount(s, brand, { type, value }));
  });

  delegate(list, 'click', '[data-action="delete-discount"]', (button) =>
    store.update((s) => removeDiscount(s, button.dataset.brand!)),
  );

  let last: { stations: unknown; discounts: unknown; locale: string } | null = null;

  return {
    render(state: AppState) {
      const { stations } = state;
      const { discounts } = state.preferences;
      const { t, locale } = i18n();
      if (last && last.stations === stations && last.discounts === discounts && last.locale === locale)
        return;
      last = { stations, discounts, locale };

      // Brand options: well-known brands plus every brand on the map, keeping the current choice.
      const current = brandSelect.value;
      const brands = new Set([
        ...KNOWN_BRANDS.map((b) => normalizeBrand(b)),
        ...stations.map((s) => s.brand),
      ]);
      const sorted = [...brands].sort((a, b) => a.localeCompare(b, 'es'));
      setHtml(
        brandSelect,
        html`<option value="">${t('discounts.chooseBrand')}</option>${sorted.map((b) => html`<option value="${b}">${brandLabel(b)}</option>`)}`,
      );
      if (brands.has(current)) brandSelect.value = current;

      const entries = Object.entries(discounts);
      setHtml(
        list,
        entries.length === 0
          ? html`<small class="u-text-muted">${t('discounts.none')}</small>`
          : html`${entries.map(
              ([brand, d]) => html`<div class="discount-item">
      <span><b>${brandLabel(brand)}</b>: ${discountLabel(d)}</span>
      <button class="btn-delete" data-action="delete-discount" data-brand="${brand}" title="${t('discounts.delete')}">✕</button>
    </div>`,
            )}`,
      );
    },
  };
}
