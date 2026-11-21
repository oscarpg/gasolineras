import { CORS_RELAYS } from '../config/endpoints';
import { AppError } from '../domain/errors';

/** A non-2xx response. Shown to the user as `errors.http` with the status. */
export class HttpError extends AppError {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super('http', { status }, `HTTP ${status}`);
    this.name = 'HttpError';
  }
}

export interface RequestOptions extends RequestInit {
  /** Resolve with the body even when the status is not 2xx (some APIs explain errors in the body). */
  allowHttpErrors?: boolean;
}

export interface HttpClient {
  getText(url: string, options?: RequestOptions): Promise<string>;
  getJson<T = unknown>(url: string, options?: RequestOptions): Promise<T>;
}

export interface HttpClientOptions {
  fetchFn?: typeof fetch;
  /** Abort requests that haven't responded after this long. */
  timeoutMs?: number;
}

/** `fetch` wrapper with a timeout and errors for non-2xx responses. */
export function createHttpClient({ fetchFn, timeoutMs = 30_000 }: HttpClientOptions = {}): HttpClient {
  const doFetch =
    fetchFn ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));

  async function request(url: string, { allowHttpErrors, ...init }: RequestOptions = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await doFetch(url, { ...init, signal: controller.signal });
      if (!response.ok && !allowHttpErrors) throw new HttpError(response.status, url);
      return response;
    } catch (error) {
      if (controller.signal.aborted) throw new AppError('timeout', {}, `Timeout after ${timeoutMs} ms`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    getText: async (url, options) => (await request(url, options)).text(),
    async getJson<T>(url: string, options?: RequestOptions): Promise<T> {
      const response = await request(url, options);
      const body = await response.text();
      try {
        return JSON.parse(body) as T;
      } catch (error) {
        // With allowHttpErrors, an error page that isn't JSON (a 502 from a proxy, say) is still an HTTP error.
        if (!response.ok) throw new HttpError(response.status, url);
        throw error;
      }
    },
  };
}

/** One way of downloading a URL's body as text. */
export type DownloadAttempt = (url: string) => Promise<string>;

/**
 * Ways to download a URL from a server that may block browser requests (CORS):
 * directly (asking for JSON, then plain), then through two public relays.
 * Temporary until there is an own proxy (refactor plan §5).
 */
export function corsFallbackAttempts(client: HttpClient): DownloadAttempt[] {
  return [
    (url) => client.getText(url, { headers: { Accept: 'application/json' } }),
    (url) => client.getText(url),
    async (url) => (await client.getJson<{ contents?: string }>(CORS_RELAYS.allOrigins(url))).contents ?? '',
    (url) => client.getText(CORS_RELAYS.codeTabs(url)),
  ];
}

/**
 * Tries each attempt in order until one returns a non-empty body that `parse` accepts.
 * A parse error also moves on to the next attempt (a relay may return an error page).
 */
export async function fetchWithFallback<T>(
  url: string,
  parse: (text: string) => T,
  attempts: readonly DownloadAttempt[],
  onAttemptFailed: (message: string) => void = (m) => console.warn('Download attempt failed:', m),
): Promise<T> {
  for (const attempt of attempts) {
    try {
      const text = (await attempt(url)).trim();
      if (!text) throw new Error('Empty response');
      return parse(text);
    } catch (error) {
      onAttemptFailed(error instanceof Error ? error.message : String(error));
    }
  }
  throw new AppError('download-failed', {}, `All download attempts failed for ${url}`);
}
