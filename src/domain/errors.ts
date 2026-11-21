/**
 * Errors the user may see, identified by a code instead of a sentence, so the UI
 * can show them in the user's language (see i18n `errors.*` keys).
 */
export type AppErrorCode =
  | 'download-failed'
  | 'timeout'
  | 'http'
  | 'geolocation-unavailable'
  | 'geolocation-denied'
  | 'geolocation-timeout';

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    /** Extra values for the message, e.g. `{ status: 429 }`. */
    readonly params: Record<string, string | number> = {},
    /** Technical detail for logs (not shown to the user). */
    detail?: string,
  ) {
    super(detail ?? code);
    this.name = 'AppError';
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;
