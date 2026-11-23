import { FUEL_TYPES } from '../../config/fuels';
import { textColorFor } from '../../domain/colorScale';
import type { StationRow } from '../../domain/filters';
import type { Car, FuelType } from '../../domain/types';
import { favouriteButtonHtml } from '../components/stationCard';
import { html, type SafeHtml } from '../dom';
import { discountLabel, euros, fuelLabel, km, pricePerLitre, stalenessText, stationName } from '../format';
import { i18n } from '../i18nContext';
import { directionsUrl } from '../stationActions';

export interface PopupContext {
  fuel: FuelType;
  car: Car | null;
  hasRoute: boolean;
  /** Ids of the favourite stations. */
  favourites: ReadonlySet<string>;
}

/**
 * Popup content for a station marker. Every value is escaped.
 * The history, favourite and share buttons are handled by event delegation (see
 * priceChart.ts and app.ts) via their data-* attributes.
 */
export function stationPopupHtml(
  row: StationRow,
  { fuel, car, hasRoute, favourites }: PopupContext,
): SafeHtml {
  const { t, number, decimal } = i18n();
  const s = row.station;
  const c = row.cost;
  const hasDiscount = row.finalPrice < row.basePrice;
  const price = html`<span class="price" style="color:${textColorFor(row.color)}">${t('station.price', { fuel: fuelLabel(fuel), price: number(row.finalPrice, 3) })}</span>`;

  const priceBlock = hasDiscount
    ? html`${price}<span class="price-struck">${pricePerLitre(row.basePrice)}</span><span class="badge">${discountLabel(row.discount)}</span>`
    : price;

  const carBlock =
    car && c.totalCost != null
      ? html`<br><small class="popup-car">🚗 <b>${car.name}</b> (${decimal(car.tankLitres)}L):<br>• ${t('station.tankCost', { cost: euros(c.tankCost!) })}<br>• ${t('station.tripCost', { km: km(c.roundTripKm!), litres: number(c.tripLitres!, 2), cost: euros(c.tripCost!) })}<br>• <b>${t('station.totalCost', { cost: euros(c.totalCost) })}</b></small>`
      : '';

  const distance = hasRoute
    ? html`<br><small>${t('station.detour', { km: km(row.routeDetourKm!), roundTrip: km(c.roundTripKm!) })}</small>`
    : row.distanceFromUserKm !== null
      ? html`<br><small>${t('station.distance', { km: km(row.distanceFromUserKm), roundTrip: km(c.roundTripKm!) })}</small>`
      : '';

  const hours = s.openingHours ? html`<br><small>${s.openingHours}</small>` : '';

  // Every fuel the station sells (MITECO prices, before discounts), the selected one in bold.
  const sold = FUEL_TYPES.filter((f) => s.prices[f] != null);
  const fuels =
    sold.length > 1
      ? html`<table class="popup-fuels"><caption>${t('station.allPrices')}</caption><tbody>${sold.map(
          (f) =>
            html`<tr class="${f === fuel ? 'is-selected' : ''}"><th scope="row">${fuelLabel(f)}</th><td>${pricePerLitre(s.prices[f]!)}</td></tr>`,
        )}</tbody></table>`
      : '';

  const directionsLabel = t('station.directionsTo', { name: stationName(s.name) });
  const actions = html`<div class="popup-actions"><a class="btn btn-directions" href="${directionsUrl(s.lat, s.lon)}" target="_blank" rel="noopener" aria-label="${directionsLabel}">🧭 ${t('station.directions')}</a><button type="button" class="btn-icon btn-share" data-action="share" data-station="${s.id}" aria-label="${t('station.share')}" title="${t('station.share')}"><span aria-hidden="true">⤴</span></button></div>`;

  const history = s.code
    ? html`<br><button class="btn-secondary btn-history" data-action="price-history" data-code="${s.code}" data-province="${s.provinceCode}" data-station="${s.id}">${t('chart.button')}</button><div class="price-chart-slot"></div>`
    : '';

  const title = html`<div class="popup-title"><b>${stationName(s.name)}</b>${favouriteButtonHtml(s, favourites.has(s.id))}</div>`;

  return html`${title}<small>${s.address}</small><br>${priceBlock}${carBlock}<br><small>${stalenessText(s.bulletinDate, row.staleness)}</small>${distance}${hours}${fuels}${actions}${history}`;
}
