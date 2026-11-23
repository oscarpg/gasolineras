import { textColorFor } from '../../domain/colorScale';
import type { StationRow } from '../../domain/filters';
import type { BrandedStation, Car } from '../../domain/types';
import { html, raw, type SafeHtml } from '../dom';
import { discountLabel, euros, km, pricePerLitre, stalenessText, stationName } from '../format';
import { i18n } from '../i18nContext';
import { directionsUrl } from '../stationActions';

export interface CardContext {
  car: Car | null;
  hasRoute: boolean;
  sortedByTotalCost: boolean;
}

/**
 * The heart that adds or removes a favourite (cards and popups). Handled by event
 * delegation through `data-action="favourite"` and `data-station`.
 */
export function favouriteButtonHtml(station: BrandedStation, isFavourite: boolean): SafeHtml {
  const { t } = i18n();
  const label = t(isFavourite ? 'favourites.remove' : 'favourites.add', { name: stationName(station.name) });
  return html`<button type="button" class="btn-icon btn-favourite" data-action="favourite" data-station="${station.id}" aria-pressed="${String(isFavourite)}" aria-label="${label}" title="${label}"><span aria-hidden="true">${isFavourite ? '♥' : '♡'}</span></button>`;
}

/** A compact link that opens directions to the station in a maps app. */
export function directionsLinkHtml(station: BrandedStation): SafeHtml {
  const label = i18n().t('station.directionsTo', { name: stationName(station.name) });
  return html`<a class="btn-icon btn-directions-icon" href="${directionsUrl(station.lat, station.lon)}" target="_blank" rel="noopener" aria-label="${label}" title="${label}"><span aria-hidden="true">🧭</span></a>`;
}

/**
 * What a screen reader says for a card, as one sentence:
 * "{position}. {name}, {price}, {distance}[, favourite]".
 */
export function stationCardLabel(
  row: StationRow,
  index: number,
  { car, hasRoute, sortedByTotalCost }: CardContext,
  isFavourite: boolean,
): string {
  const { t } = i18n();
  const amount =
    car && sortedByTotalCost && row.cost.totalCost != null
      ? t('unit.euros', { value: euros(row.cost.totalCost) })
      : pricePerLitre(row.finalPrice);
  const distance = hasRoute
    ? row.routeDetourKm !== null && t('card.labelDetour', { km: km(row.routeDetourKm) })
    : row.distanceFromUserKm !== null && t('card.labelDistance', { km: km(row.distanceFromUserKm) });
  return [
    `${index + 1}. ${stationName(row.station.name)}`,
    amount,
    distance,
    isFavourite && t('card.labelFavourite'),
  ]
    .filter(Boolean)
    .join(', ');
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
  const color = textColorFor(row.color);
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
