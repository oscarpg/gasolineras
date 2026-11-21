import { FUEL_TYPES, isFuelType } from '../../../config/fuels';
import type { AppState } from '../../../state/appState';
import type { Store } from '../../../state/store';
import { deleteCar, saveCar, selectCar } from '../../../state/transitions';
import { byId, delegate, html, setHtml } from '../../dom';
import { fuelLabel } from '../../format';
import { i18n } from '../../i18nContext';
import type { Toaster } from '../../toast';

/** Fills a <select> with the fuels in the current language, keeping its selection. */
export function renderFuelOptions(select: HTMLSelectElement): void {
  const selected = select.value;
  setHtml(select, html`${FUEL_TYPES.map((f) => html`<option value="${f}">${fuelLabel(f)}</option>`)}`);
  if (selected) select.value = selected;
}

/** "My cars": add/update form and the list of saved cars. */
export function createCarsSection(store: Store<AppState>, toast: Toaster, newId = () => 'car_' + Date.now()) {
  const name = byId<HTMLInputElement>('car-name');
  const fuel = byId<HTMLSelectElement>('car-fuel');
  const tank = byId<HTMLInputElement>('car-tank');
  const consumption = byId<HTMLInputElement>('car-consumption');
  const list = byId('car-list');

  byId('save-car').addEventListener('click', () => {
    const carName = name.value.trim();
    const tankLitres = parseFloat(tank.value);
    const consumptionL100km = parseFloat(consumption.value);
    const carFuel = fuel.value;

    const valid =
      carName &&
      isFuelType(carFuel) &&
      Number.isFinite(tankLitres) &&
      tankLitres > 0 &&
      Number.isFinite(consumptionL100km) &&
      consumptionL100km > 0;
    if (!valid) {
      toast.show(i18n().t('cars.incomplete'));
      return;
    }

    name.value = '';
    tank.value = '';
    consumption.value = '';
    store.update((s) => saveCar(s, { name: carName, fuel: carFuel, tankLitres, consumptionL100km }, newId()));
  });

  delegate(list, 'click', '[data-action="use-car"]', (button) =>
    store.update((s) => selectCar(s, button.dataset.id!)),
  );
  delegate(list, 'click', '[data-action="delete-car"]', (button) =>
    store.update((s) => deleteCar(s, button.dataset.id!)),
  );

  let last: { cars: unknown; activeCarId: unknown; locale: string } | null = null;

  return {
    render(state: AppState) {
      const { cars, activeCarId } = state.preferences;
      const { t, locale, decimal } = i18n();
      if (last && last.cars === cars && last.activeCarId === activeCarId && last.locale === locale) return;
      if (!last || last.locale !== locale) renderFuelOptions(fuel);
      last = { cars, activeCarId, locale };

      if (cars.length === 0) {
        setHtml(list, html`<small class="u-text-muted">${t('cars.none')}</small>`);
        return;
      }
      setHtml(
        list,
        html`${cars.map((c) => {
          const active = c.id === activeCarId;
          const details = t('cars.details', {
            fuel: fuelLabel(c.fuel),
            tank: decimal(c.tankLitres),
            consumption: decimal(c.consumptionL100km),
          });
          return html`<div class="car-item ${active ? 'is-active' : ''}">
      <div class="car-info">
        <div><b>${c.name}</b> ${active ? html`<span class="badge">${t('cars.active')}</span>` : ''}</div>
        <div class="car-meta">
          ${details}
        </div>
      </div>
      <div class="car-actions">
        ${active ? '' : html`<button class="btn-secondary btn-mini" data-action="use-car" data-id="${c.id}">${t('cars.use')}</button>`}
        <button class="btn-delete" data-action="delete-car" data-id="${c.id}" title="${t('cars.delete')}">✕</button>
      </div>
    </div>`;
        })}`,
      );
    },
  };
}
