/** Base class for every error thrown by the SDK. */
export class SpigetError extends Error {
  override name = "SpigetError";
  /** HTTP status code, when the error came from a response. */
  readonly status: number | undefined;
  /** The request URL. */
  readonly url: string | undefined;

  constructor(message: string, options: { status?: number; url?: string; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.status = options.status;
    this.url = options.url;
  }
}

/** The requested resource, author, category or version does not exist (HTTP 404). */
export class SpigetNotFoundError extends SpigetError {
  override name = "SpigetNotFoundError";
}

/** Spiget kept rate limiting the client after all retries were used (HTTP 429). */
export class SpigetRateLimitError extends SpigetError {
  override name = "SpigetRateLimitError";
  /** Seconds the server asked to wait, if it said. */
  readonly retryAfter: number | undefined;

  constructor(
    message: string,
    options: { url?: string; retryAfter?: number | undefined; cause?: unknown } = {},
  ) {
    super(message, { ...options, status: 429 });
    this.retryAfter = options.retryAfter;
  }
}

/** The request took longer than the configured `timeout`. */
export class SpigetTimeoutError extends SpigetError {
  override name = "SpigetTimeoutError";
}
