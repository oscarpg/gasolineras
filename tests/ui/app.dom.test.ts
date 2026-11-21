// @vitest-environment happy-dom
/**
 * The whole UI on the real index.html markup, with fake services and a fake Leaflet:
 * start-up, drawer, results panel, every preferences section, language switch,
 * error box and price chart.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import { DEFAULT_PREFERENCES, type Preferences } from '../../src/domain/preferences';
import type { LatLng, Station } from '../../src/domain/types';
import type { GeocodeResult } from '../../src/services/geocoding';
import type { MitecoService } from '../../src/services/miteco';
import { createInitialState, type AppState } from '../../src/state/appState';
import { createEffects } from '../../src/state/effects';
import { createStore, type Store } from '../../src/state/store';
import { startApp } from '../../src/ui/app';
import { prices, station } from '../state/fixtures';
import { fakeLeaflet, flush } from './fakes';

const BODY = /<body>([\s\S]*)<\/body>/.exec(indexHtml)![1]!;
const MADRID: LatLng = [40.42, -3.7];
const BRANDS = ['REPSOL', 'CEPSA', 'BP'];

const stations: Station[] = Array.from({ length: 25 }, (_, i) =>
  station(`s${i}`, {
    code: `${1000 + i}`,
    name: `${BRANDS[i % 3]} ${i}`,
    lat: 40.42 + i * 0.001,
    lon: -3.7,
    prices: prices({ GASOLINA_95: 1.5 + i / 1000, GASOLEO_A: 1.4 + i / 1000 }),
  }),
);

interface Setup {
  prefs?: Partial<Preferences>;
  search?: () => Promise<GeocodeResult | null>;
}

let ctx: Awaited<ReturnType<typeof boot>>;

async function boot({ prefs = {}, search = async () => null }: Setup = {}) {
  document.body.innerHTML = BODY;
  document.documentElement.lang = 'es';
  const miteco: MitecoService = {
    hasCachedProvince: () => true,
    getProvinceStations: async () => stations,
    getHistoryDay: async () => ({ '1000': { GASOLINA_95: 1.55 } }),
  };
  const store: Store<AppState> = createStore(createInitialState({ ...DEFAULT_PREFERENCES, ...prefs }));
  const effects = createEffects({ store, miteco });
  const leaflet = fakeLeaflet();
  startApp({
    store,
    effects,
    miteco,
    geocoder: { search, reverseProvince: async () => '28' },
    router: { route: async (a, b) => [a, b] },
    gps: { isAvailable: () => true, getCurrentPosition: async () => MADRID },
    leaflet: leaflet.L,
    browserLanguages: ['es-ES'],
  });
  for (let i = 0; i < 5; i++) await flush();
  return { store, leaflet };
}

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const $$ = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];
const click = (selector: string) => $(selector).click();
const key = (el: EventTarget, k: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
const change = (selector: string, value: string, type = 'change') => {
  const el = $<HTMLInputElement>(selector);
  el.value = value;
  el.dispatchEvent(new Event(type, { bubbles: true }));
};
const check = (el: HTMLInputElement, checked: boolean) => {
  el.checked = checked;
  el.dispatchEvent(new Event('change', { bubbles: true }));
};

describe('startApp (DOM)', () => {
  beforeEach(async () => {
    ctx = await boot();
  });

  it('starts: locates, loads the province and lists the 20 cheapest stations', () => {
    expect($$('.station-card')).toHaveLength(20);
    expect($('.station-card').textContent).toContain('REPSOL 0');
    expect($('#status').textContent).toContain('25 gasolineras');
    expect($$('#brand-list input[data-brand]')).toHaveLength(3);
    expect(ctx.store.getState().userPosition).toEqual(MADRID);
    expect($('#status-error').hidden).toBe(true);
  });

  it('drawer: opens as a modal dialog, Escape closes it and focus returns', () => {
    const opener = $('#open-preferences');
    opener.focus();
    opener.click();
    expect($('#preferences-drawer').classList.contains('is-open')).toBe(true);
    expect(opener.getAttribute('aria-expanded')).toBe('true');
    expect($('#preferences-drawer').inert).toBe(false);
    expect(['topbar', 'map', 'results-panel'].every((id) => document.getElementById(id)!.inert)).toBe(true);
    expect(document.activeElement?.id).toBe('close-preferences');

    key(document, 'Escape');
    expect($('#preferences-drawer').classList.contains('is-open')).toBe(false);
    expect($('#preferences-drawer').inert).toBe(true);
    expect(document.activeElement?.id).toBe('open-preferences');

    opener.click();
    click('#preferences-backdrop');
    expect(opener.getAttribute('aria-expanded')).toBe('false');
  });

  it('results panel: header toggles with Enter/Space; Enter on a card focuses the station', () => {
    const header = $('#results-toggle');
    key(header, 'Enter');
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect($('#results-body').inert).toBe(true);
    key(header, ' ');
    expect(header.getAttribute('aria-expanded')).toBe('true');
    header.click();
    expect($('#results-panel').classList.contains('is-minimized')).toBe(true);

    const card = $$('.station-card')[1]!;
    card.focus();
    key(card, 'Enter');
    expect(ctx.leaflet.map.view?.zoom).toBe(15);
    expect(ctx.leaflet.log.some((l) => l.includes('CEPSA 1'))).toBe(true);
    card.click();
    expect(ctx.leaflet.log.filter((l) => l.includes('CEPSA 1'))).toHaveLength(2);
  });

  it('keeps keyboard focus on the same card when the list re-renders', () => {
    const card = $$('.station-card')[2]!;
    card.focus();
    change('#search-radius', '20', 'input');
    expect((document.activeElement as HTMLElement).dataset.station).toBe(card.dataset.station);
    expect($('#search-radius').getAttribute('aria-valuetext')).toBe('20 km');
    expect(ctx.store.getState().preferences.searchRadiusKm).toBe(20);
  });

  it('cars: validates, saves, sorts by total cost, switches and deletes', () => {
    click('#save-car');
    expect($('.toast').textContent).toContain('Completa');

    $<HTMLInputElement>('#car-name').value = 'León';
    $<HTMLSelectElement>('#car-fuel').value = 'GASOLINA_95';
    $<HTMLInputElement>('#car-tank').value = '50';
    $<HTMLInputElement>('#car-consumption').value = '6';
    click('#save-car');
    expect($('#car-list').textContent).toContain('León');
    expect($<HTMLInputElement>('#sort-by-cost').disabled).toBe(false);
    expect($('.station-card').textContent).toContain('Depósito');

    check($<HTMLInputElement>('#sort-by-cost'), true);
    expect(ctx.store.getState().preferences.sortByTotalCost).toBe(true);
    expect($('#status').textContent).toContain('coste total');

    $<HTMLInputElement>('#car-name').value = 'Furgo';
    $<HTMLSelectElement>('#car-fuel').value = 'GASOLEO_A';
    $<HTMLInputElement>('#car-tank').value = '70';
    $<HTMLInputElement>('#car-consumption').value = '8';
    click('#save-car');
    click('[data-action="use-car"]');
    expect(ctx.store.getState().preferences.fuel).toBe('GASOLINA_95');
    click('[data-action="delete-car"]');
    click('[data-action="delete-car"]');
    expect($('#car-list').textContent).toContain('No hay coches');
  });

  it('discounts: adds and removes a brand discount', () => {
    expect($$('#discount-brand option').map((o) => o.getAttribute('value'))).toContain('CEPSA');
    change('#discount-brand', 'CEPSA');
    $<HTMLInputElement>('#discount-value').value = '5';
    click('#add-discount');
    expect($('#discount-list').textContent).toContain('CEPSA');
    expect($$('.station-card .badge').length).toBeGreaterThan(0);

    $<HTMLInputElement>('#discount-value').value = '0';
    click('#add-discount'); // invalid amount: ignored
    expect(Object.keys(ctx.store.getState().preferences.discounts)).toEqual(['CEPSA']);

    click('[data-action="delete-discount"]');
    expect($('#discount-list').textContent).toContain('Sin descuentos');
  });

  it('filters: fuel, custom age option and brand checkboxes', () => {
    change('#fuel', 'GASOLEO_A');
    expect(ctx.store.getState().preferences.fuel).toBe('GASOLEO_A');
    expect($('#status').textContent).toContain('Diésel');

    change('#age-filter', 'atMostCustom');
    expect($('#custom-days-row').hidden).toBe(false);
    change('#custom-days', '5');
    expect(ctx.store.getState().preferences.ageFilterCustomDays).toBe(5);
    change('#age-filter', 'all');
    expect($('#custom-days-row').hidden).toBe(true);

    const repsol = $$('#brand-list input[data-brand]').find(
      (i) => i.dataset.brand === 'REPSOL',
    ) as HTMLInputElement;
    check(repsol, true);
    expect($$('.station-card').every((c) => c.textContent!.includes('REPSOL'))).toBe(true);
    check($<HTMLInputElement>('#all-brands'), true);
    expect(ctx.store.getState().preferences.brands).toEqual([]);
  });

  it('route: calculates and clears the route from the drawer', async () => {
    ctx = await boot({ search: async () => ({ latLng: [40.3, -3.73], provinceCode: '28' }) });
    click('#open-preferences');
    $<HTMLInputElement>('#destination').value = 'Getafe';
    click('#calculate-route');
    for (let i = 0; i < 3; i++) await flush();
    expect(ctx.store.getState().route).toHaveLength(2);
    expect($('#preferences-drawer').classList.contains('is-open')).toBe(false); // closes on success
    expect($('#status').textContent).toContain('en ruta');
    check($<HTMLInputElement>('#route-only'), true);
    change('#route-detour', '5', 'input');
    expect(ctx.store.getState().preferences.routeDetourKm).toBe(5);
    click('#clear-route');
    expect(ctx.store.getState().route).toBeNull();
  });

  it('language: switching to English translates static text, aria-labels and the list', () => {
    change('#language', 'en');
    expect(document.documentElement.lang).toBe('en');
    expect($('#results-title').textContent).toContain('Cheapest');
    expect($('#close-preferences').getAttribute('aria-label')).toBe('Close');
    expect($('#discount-value').getAttribute('placeholder')).toBe('e.g. 5');
    expect($('#status').textContent).toContain('25 stations');
    expect(ctx.store.getState().preferences.locale).toBe('en');
    change('#language', '');
    expect(document.documentElement.lang).toBe('es');
  });

  it('error box: address not found shows an error without Retry, ✕ dismisses it', async () => {
    click('#open-preferences');
    $<HTMLInputElement>('#address').value = 'nowhere';
    click('#set-address');
    for (let i = 0; i < 3; i++) await flush();
    expect($('#status-error').hidden).toBe(false);
    expect($('#status-error').textContent).toContain('no encontrada');
    expect($('#status-error [data-action="retry"]')).toBeNull();
    expect($('#preferences-drawer').classList.contains('is-open')).toBe(true);
    click('#status-error [data-action="dismiss"]');
    expect($('#status-error').hidden).toBe(true);
  });

  it('GPS buttons and "refresh prices" run without errors', async () => {
    click('#quick-gps');
    click('#open-preferences');
    click('#use-gps');
    expect($('#preferences-drawer').classList.contains('is-open')).toBe(false);
    click('#refresh-prices');
    for (let i = 0; i < 5; i++) await flush();
    expect($$('.station-card')).toHaveLength(20);
    expect($('#status-error').hidden).toBe(true);
  });

  it('price chart: the popup button loads history and draws the chart', async () => {
    click('.station-card');
    const opened = ctx.leaflet.markers.filter((m) => m.open).pop()!;
    // Leaflet would put the popup HTML in the page; do the same.
    const popup = document.createElement('div');
    popup.innerHTML = opened.html;
    document.body.appendChild(popup);
    popup.querySelector<HTMLElement>('[data-action="price-history"]')!.click();
    for (let i = 0; i < 3; i++) await flush();
    expect(popup.querySelector('.price-chart-slot svg')).not.toBeNull();
  });
});
