export interface RateLimiterOptions {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Runs tasks one at a time, at least `minIntervalMs` apart (measured between starts).
 * Used for Nominatim, whose usage policy allows at most 1 request per second.
 */
export function createRateLimiter(
  minIntervalMs: number,
  {
    now = Date.now,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }: RateLimiterOptions = {},
) {
  let queue: Promise<unknown> = Promise.resolve();
  let lastStart = -Infinity;

  return function schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(async () => {
      const wait = lastStart + minIntervalMs - now();
      if (wait > 0) await sleep(wait);
      lastStart = now();
      return task();
    });
    // A failed task must not block the ones queued after it.
    queue = run.catch(() => undefined);
    return run;
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;
