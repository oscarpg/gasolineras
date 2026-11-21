import type { StationRow } from '../../domain/filters';
import type { Car } from '../../domain/types';
import { html, raw, type SafeHtml } from '../dom';
import { discountLabel, euros, km, pricePerLitre, stalenessText, stationName } from '../format';
import { i18n } from '../i18nContext';

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
  const { t } = i18n();
  const s = row.station;
  const c = row.cost;
  const color = row.color;
  const hasDiscount = row.finalPrice < row.basePrice;

  const distance = hasRoute
    ? t('card.detour', { km: km(row.routeDetourKm!) })
    : row.distanceFromUserKm !== null
      ? t('card.distance', { km: km(row.distanceFromUserKm) })
      : '';

  const struck = hasDiscount
    ? html`<div class="price-struck u-ml-0">${pricePerLitre(row.basePrice)}</div>`
    : '';

  let carLine: SafeHtml = raw('');
  let right = html`
        <div class="station-card-amount" style="color:${color}">${pricePerLitre(row.finalPrice)}</div>
        ${struck}
      `;

  if (car && c.totalCost != null) {
    const total = t('unit.euros', { value: euros(c.totalCost) });
    carLine = html`
          <div class="station-card-car">
            ${t('card.costLine', { tank: euros(c.tankCost!), trip: euros(c.tripCost!) })} <b>${total}</b>
          </div>
        `;
    right = sortedByTotalCost
      ? html`
            <div class="station-card-amount" style="color:${color}">${total}</div>
            <div class="station-card-subamount">${pricePerLitre(row.finalPrice)}</div>
            ${struck}
          `
      : html`
            <div class="station-card-amount" style="color:${color}">${pricePerLitre(row.finalPrice)}</div>
            ${struck}
            <div class="station-card-subamount">${t('card.total', { cost: euros(c.totalCost) })}</div>
          `;
  }

  return html`
        <div class="station-card-info">
          <div class="station-card-name">
            ${index + 1}. ${stationName(s.name)}
            ${hasDiscount ? html`<span class="badge">${discountLabel(row.discount)}</span>` : ''}
          </div>
          <div class="station-card-meta">${distance}${s.address}</div>
          ${carLine}
          <div class="station-card-meta">${stalenessText(s.bulletinDate, row.staleness)}</div>
        </div>
        <div class="station-card-prices">
          ${right}
        </div>
      `;
}
