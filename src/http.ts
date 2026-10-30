import {
  SpigetError,
  SpigetNotFoundError,
  SpigetRateLimitError,
  SpigetTimeoutError,
} from "./errors.js";

export type QueryValue = string | number | boolean | readonly string[] | undefined;

export interface HttpOptions {
  baseUrl: string;
  userAgent: string;
  timeout: number;
  retries: number;
  fetch: typeof globalThis.fetch;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, QueryValue>;
  body?: URLSearchParams;
  signal?: AbortSignal | undefined;
}

export interface JsonResponse<T> {
  data: T;
  headers: Headers;
}

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

export class HttpClient {
  readonly #options: HttpOptions;

  constructor(options: HttpOptions) {
    this.#options = options;
  }

  url(path: string, query?: Record<string, QueryValue>): string {
    const url = new URL(path.replace(/^\//, ""), `${this.#options.baseUrl.replace(/\/$/, "")}/`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined) continue;
      url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
    }
    return url.toString();
  }

  async json<T>(path: string, options: RequestOptions = {}): Promise<JsonResponse<T>> {
    const response = await this.raw(path, options);
    const data = (await response.json()) as T;
    return { data, headers: response.headers };
  }

  /** Performs a request with timeout and retries. Resolves only for 2xx/3xx responses. */
  async raw(path: string, options: RequestOptions = {}): Promise<Response> {
    const url = this.url(path, options.query);
    const { retries } = this.#options;

    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await this.#send(url, options);
      } catch (error) {
        if (options.signal?.aborted) throw error;
        if (error instanceof SpigetTimeoutError || attempt >= retries) {
          throw error instanceof SpigetError
            ? error
            : new SpigetError(`Request to ${url} failed`, { url, cause: error });
        }
        await sleep(backoff(attempt), options.signal);
        continue;
      }

      if (response.ok) return response;

      if (RETRYABLE_STATUS.has(response.status) && attempt < retries) {
        await response.body?.cancel();
        const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
        await sleep(
          retryAfter !== undefined ? retryAfter * 1000 : backoff(attempt),
          options.signal,
        );
        continue;
      }

      throw await toError(response, url);
    }
  }

  async #send(url: string, options: RequestOptions): Promise<Response> {
    const timeout = AbortSignal.timeout(this.#options.timeout);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    try {
      return await this.#options.fetch(url, {
        method: options.method ?? "GET",
        headers: { "User-Agent": this.#options.userAgent, Accept: "application/json" },
        body: options.body ?? null,
        redirect: "follow",
        signal,
      });
    } catch (error) {
      if (timeout.aborted && !options.signal?.aborted) {
        throw new SpigetTimeoutError(
          `Request to ${url} timed out after ${this.#options.timeout}ms`,
          { url, cause: error },
        );
      }
      throw error;
    }
  }
}

async function toError(response: Response, url: string): Promise<SpigetError> {
  let message = `Spiget responded with HTTP ${response.status}`;
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") message = `${message}: ${body.error}`;
  } catch {
    // Body was not JSON; keep the generic message.
  }
  const options = { status: response.status, url };
  if (response.status === 404) return new SpigetNotFoundError(message, options);
  if (response.status === 429) {
    return new SpigetRateLimitError(message, {
      url,
      retryAfter: parseRetryAfter(response.headers.get("retry-after")),
    });
  }
  return new SpigetError(message, options);
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, (date - Date.now()) / 1000);
}

function backoff(attempt: number): number {
  return Math.min(500 * 2 ** attempt, 8000) * (0.75 + Math.random() * 0.5);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
