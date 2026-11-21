import type { StationRow } from '../../domain/filters';
import type { Car } from '../../domain/types';
import type { FuelType } from '../../domain/types';
import { html, type SafeHtml } from '../dom';
import { discountLabel, fuelLabel, stalenessText, TEXT } from '../text';

export interface PopupContext {
  fuel: FuelType;
  car: Car | null;
  hasRoute: boolean;
}

/**
 * Popup content for a station marker. Every value is escaped.
 * The history button is handled by event delegation (see priceChart.ts) via its data-* attributes.
 */
export function stationPopupHtml(row: StationRow, { fuel, car, hasRoute }: PopupContext): SafeHtml {
  const s = row.station;
  const c = row.cost;
  const hasDiscount = row.finalPrice < row.basePrice;
  const price = html`<span class="precio" style="color:${row.color}">${fuelLabel(fuel)}: ${row.finalPrice.toFixed(3)} €/l</span>`;

  const priceBlock = hasDiscount
    ? html`${price}<span class="precio-tachado">${row.basePrice.toFixed(3)} €/l</span><span class="badge-desc">${discountLabel(row.discount)}</span>`
    : price;

  const carBlock =
    car && c.totalCost != null
      ? html`<br><small class="popup-coche">🚗 <b>${car.name}</b> (${car.tankLitres}L):<br>• Depósito: ${c.tankCost!.toFixed(2)} €<br>• Desplazamiento i/v (${c.roundTripKm!.toFixed(1)} km · ${c.tripLitres!.toFixed(2)}L): +${c.tripCost!.toFixed(2)} €<br>• <b>Total real: ${c.totalCost.toFixed(2)} €</b></small>`
      : '';

  const distance = hasRoute
    ? html`<br><small>🛣️ Desvío de ruta: ${row.routeDetourKm!.toFixed(1)} km (${c.roundTripKm!.toFixed(1)} km i/v)</small>`
    : row.distanceFromUserKm !== null
      ? html`<br><small>📍 A ${row.distanceFromUserKm.toFixed(1)} km (${c.roundTripKm!.toFixed(1)} km i/v)</small>`
      : '';

  const hours = s.openingHours ? html`<br><small>${s.openingHours}</small>` : '';

  const history = s.code
    ? html`<br><button class="sec btn-historial" data-action="price-history" data-code="${s.code}" data-province="${s.provinceCode}" data-station="${s.id}">${TEXT.priceHistoryButton}</button><div id="grafica-${s.code}"></div>`
    : '';

  return html`<b>${s.name}</b><br><small>${s.address}</small><br>${priceBlock}${carBlock}<br><small>${stalenessText(s.bulletinDate, row.staleness)}</small>${distance}${hours}${history}`;
}
