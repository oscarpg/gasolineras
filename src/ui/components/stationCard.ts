import type { StationRow } from '../../domain/filters';
import type { Car } from '../../domain/types';
import { html, raw, type SafeHtml } from '../dom';
import { discountLabel, stalenessText } from '../text';

export interface CardContext {
  car: Car | null;
  hasRoute: boolean;
  sortedByTotalCost: boolean;
}

/** Inner HTML of one result card (position `index` starts at 0). Every value is escaped. */
export function stationCardHtml(
  row: StationRow,
  index: number,
  { car, hasRoute, sortedByTotalCost }: CardContext,
): SafeHtml {
  const s = row.station;
  const c = row.cost;
  const color = row.color;
  const hasDiscount = row.finalPrice < row.basePrice;

  const distance = hasRoute
    ? `🛣️ Desvío ${row.routeDetourKm!.toFixed(1)} km · `
    : row.distanceFromUserKm !== null
      ? `📍 ${row.distanceFromUserKm.toFixed(1)} km · `
      : '';

  const struck = hasDiscount
    ? html`<div class="precio-tachado u-ml-0">${row.basePrice.toFixed(3)} €/l</div>`
    : '';

  let carLine: SafeHtml = raw('');
  let right = html`
        <div class="importe" style="color:${color}">${row.finalPrice.toFixed(3)} €/l</div>
        ${struck}
      `;

  if (car && c.totalCost != null) {
    carLine = html`
          <div class="meta-coche">
            🚗 Depósito: ${c.tankCost!.toFixed(2)} € + Viaje i/v: ${c.tripCost!.toFixed(2)} € = <b>${c.totalCost.toFixed(2)} €</b>
          </div>
        `;
    right = sortedByTotalCost
      ? html`
            <div class="importe" style="color:${color}">${c.totalCost.toFixed(2)} €</div>
            <div class="sub-importe">${row.finalPrice.toFixed(3)} €/l</div>
            ${struck}
          `
      : html`
            <div class="importe" style="color:${color}">${row.finalPrice.toFixed(3)} €/l</div>
            ${struck}
            <div class="sub-importe">Total: ${c.totalCost.toFixed(2)} €</div>
          `;
  }

  return html`
        <div class="info">
          <div class="nombre">
            ${index + 1}. ${s.name}
            ${hasDiscount ? html`<span class="badge-desc">${discountLabel(row.discount)}</span>` : ''}
          </div>
          <div class="meta">${distance}${s.address}</div>
          ${carLine}
          <div class="meta">${stalenessText(s.bulletinDate, row.staleness)}</div>
        </div>
        <div class="item-precios">
          ${right}
        </div>
      `;
}
