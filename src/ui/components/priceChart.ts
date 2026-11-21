import { daysBefore, toMitecoDate } from '../../domain/dates';
import { significantPricePoints, type PricePoint } from '../../domain/priceHistory';
import { samePrice } from '../../domain/staleness';
import type { MitecoService } from '../../services/miteco';
import type { AppState } from '../../state/appState';
import type { Store } from '../../state/store';
import { delegate, html, setHtml, type SafeHtml } from '../dom';
import { i18n } from '../i18nContext';

const WIDTH = 240;
const HEIGHT = 115;
const PAD_X = 28;
const PAD_Y = 24;
/** Range added around a flat line so it sits mid-chart (€/l). */
const FLAT_MARGIN = 0.02;

/** SVG line chart of a 7-day series, labelling only the points where the price changed. */
export function priceChartSvg(series: readonly PricePoint[], points: readonly PricePoint[]): SafeHtml {
  const { t, number } = i18n();
  const prices = points.map((p) => p.price!);
  let min = Math.min(...prices);
  let max = Math.max(...prices);
  const flat = samePrice(max, min);
  if (flat) {
    min -= FLAT_MARGIN;
    max += FLAT_MARGIN;
  }

  const x = (idx: number) => PAD_X + (idx / (series.length - 1)) * (WIDTH - PAD_X * 2);
  const y = (price: number) => PAD_Y + (1 - (price - min) / (max - min)) * (HEIGHT - PAD_Y * 2);
  const coords = points.map((p) => ({ x: x(p.idx), y: y(p.price!), price: p.price! }));
  const polyline = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

  return html`
    <svg width="${WIDTH}" height="${HEIGHT}" class="price-chart">
      ${
        coords.length > 1
          ? html`<polyline fill="none" stroke="#1565C0" stroke-width="2" stroke-dasharray="${flat ? '4,3' : 'none'}" points="${polyline}" />`
          : ''
      }
      ${coords.map(
        (c) => html`
        <circle cx="${c.x}" cy="${c.y}" r="3.5" fill="#2E7D32" />
        <text x="${c.x}" y="${c.y - 7}" font-size="9" text-anchor="middle" fill="#222" font-weight="600">${number(c.price, 3)}</text>
      `,
      )}
      ${series.map(
        (s) => html`
        <text x="${x(s.idx)}" y="${HEIGHT - 6}" font-size="8" text-anchor="middle" fill="${s.price !== null ? '#555' : '#bbb'}">${s.label}</text>
      `,
      )}
    </svg>
    ${flat ? html`<small class="price-chart-note">${t('chart.flat')}</small>` : ''}
  `;
}

export interface PriceChartDeps {
  store: Store<AppState>;
  miteco: Pick<MitecoService, 'getHistoryDay'>;
  now?: () => Date;
}

/** Loads the last 6 days of history plus today's price and draws the chart into `container`. */
export async function showPriceChart(
  container: Element,
  { store, miteco, now = () => new Date() }: PriceChartDeps,
  station: { code: string; provinceCode: string; id: string },
): Promise<void> {
  const { t, dayMonth } = i18n();
  const fuel = store.getState().preferences.fuel;
  setHtml(container, html`<small class="u-text-muted">${t('chart.loading')}</small>`);

  try {
    const today = now();
    const days = [6, 5, 4, 3, 2, 1].map((n) => {
      const d = daysBefore(today, n);
      return { label: dayMonth(d), date: toMitecoDate(d) };
    });
    const history = await Promise.all(
      days.map((d) => miteco.getHistoryDay(station.provinceCode, d.date).catch(() => null)),
    );
    const current = store.getState().stations.find((s) => s.id === station.id);
    const series: PricePoint[] = [
      ...days.map((d, idx) => ({ idx, label: d.label, price: history[idx]?.[station.code]?.[fuel] ?? null })),
      { idx: 6, label: t('chart.today'), price: current?.prices[fuel] ?? null },
    ];

    const points = significantPricePoints(series);
    setHtml(
      container,
      points.length === 0
        ? html`<small class="u-text-danger">${t('chart.none')}</small>`
        : priceChartSvg(series, points),
    );
  } catch {
    setHtml(container, html`<small class="u-text-danger">${t('chart.error')}</small>`);
  }
}

/**
 * Handles every price-history button, including those inside Leaflet popups that
 * are created later, with one delegated listener (no global functions).
 */
export function bindPriceHistoryButtons(
  root: Pick<EventTarget, 'addEventListener'>,
  deps: PriceChartDeps,
): void {
  delegate(root, 'click', '[data-action="price-history"]', (button) => {
    const { code, province, station } = button.dataset;
    const container = button.nextElementSibling;
    if (!code || !province || !station || !container) return;
    void showPriceChart(container, deps, { code, provinceCode: province, id: station });
  });
}
