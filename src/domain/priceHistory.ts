import { samePrice } from './staleness';

export interface PricePoint {
  /** Position on the x axis (0 = oldest). */
  idx: number;
  label: string;
  price: number | null;
}

/**
 * Picks the points worth plotting from a daily price series:
 * the first known price, every day the price changed, and the last day.
 * Days with no data are skipped.
 */
export function significantPricePoints<T extends PricePoint>(series: readonly T[]): T[] {
  const points: T[] = [];
  let lastKnown: number | null = null;

  series.forEach((item, i) => {
    if (item.price === null) return;
    const isFirst = lastKnown === null;
    const isLast = i === series.length - 1;
    const changed = !isFirst && !samePrice(item.price, lastKnown!);

    if (isFirst || changed || isLast) {
      points.push(item);
      lastKnown = item.price;
    }
  });

  return points;
}
