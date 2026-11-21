import { FUEL_TYPES, isFuelType } from '../../../config/fuels';
import type { AppState } from '../../../state/appState';
import type { Store } from '../../../state/store';
import { deleteCar, saveCar, selectCar } from '../../../state/transitions';
import { byId, delegate, html, setHtml } from '../../dom';
import { fuelLabel, TEXT } from '../../text';
import type { Toaster } from '../../toast';

/** "Mis coches": add/update form and the list of saved cars. */
export function createCarsSection(store: Store<AppState>, toast: Toaster, newId = () => 'car_' + Date.now()) {
  const name = byId<HTMLInputElement>('cocheNombre');
  const fuel = byId<HTMLSelectElement>('cocheFuel');
  const tank = byId<HTMLInputElement>('cocheDeposito');
  const consumption = byId<HTMLInputElement>('cocheConsumo');
  const list = byId('listaCoches');

  for (const f of FUEL_TYPES) fuel.add(new Option(fuelLabel(f), f));

  byId('btnGuardarCoche').addEventListener('click', () => {
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
      toast.show(TEXT.carIncomplete);
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

  let last: { cars: unknown; activeCarId: unknown } | null = null;

  return {
    render(state: AppState) {
      const { cars, activeCarId } = state.preferences;
      if (last && last.cars === cars && last.activeCarId === activeCarId) return;
      last = { cars, activeCarId };

      if (cars.length === 0) {
        setHtml(list, html`<small class="u-text-muted">${TEXT.noCars}</small>`);
        return;
      }
      setHtml(
        list,
        html`${cars.map((c) => {
          const active = c.id === activeCarId;
          return html`<div class="coche-item ${active ? 'activo' : ''}">
      <div class="coche-info">
        <div><b>${c.name}</b> ${active ? html`<span class="badge-desc">${TEXT.active}</span>` : ''}</div>
        <div class="coche-meta">
          ${fuelLabel(c.fuel)} · Depósito: ${c.tankLitres} L · ${c.consumptionL100km} l/100km
        </div>
      </div>
      <div class="coche-acciones">
        ${active ? '' : html`<button class="sec btn-mini btn-usar" data-action="use-car" data-id="${c.id}">${TEXT.use}</button>`}
        <button class="btn-del" data-action="delete-car" data-id="${c.id}" title="${TEXT.deleteCar}">✕</button>
      </div>
    </div>`;
        })}`,
      );
    },
  };
}
