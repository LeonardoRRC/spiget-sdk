import {
  type ApiContext,
  AuthorsApi,
  CategoriesApi,
  getStatus,
  type RequestOptions,
  ResourcesApi,
  SearchApi,
  WebhooksApi,
} from "./api.js";
import { HttpClient } from "./http.js";
import type { ApiStatus } from "./types.js";

/** Options for {@link SpigetClient}. */
export interface SpigetClientOptions {
  /**
   * Identifies your application to Spiget, e.g. `"my-plugin-manager/1.0 (+https://example.com)"`.
   * Spiget asks every client to send one. Browsers may ignore it.
   */
  userAgent: string;
  /** Defaults to `https://api.spiget.org/v2`. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Defaults to `15000`. */
  timeout?: number;
  /** Retries for network errors, HTTP 429 and 5xx gateway errors. Defaults to `2`. */
  retries?: number;
  /**
   * Decode the base64 fields Spiget returns (descriptions, review messages, link labels).
   * Defaults to `true`.
   */
  decode?: boolean;
  /** Custom `fetch`, e.g. to add caching or a proxy. Defaults to `globalThis.fetch`. */
  fetch?: typeof globalThis.fetch;
}

/** Default Spiget API base URL. */
export const DEFAULT_BASE_URL = "https://api.spiget.org/v2";

/**
 * Client for the Spiget API.
 *
 * @example
 * ```ts
 * import { SpigetClient } from "spiget-sdk";
 *
 * const spiget = new SpigetClient({ userAgent: "my-app/1.0" });
 *
 * const protocolLib = await spiget.resources.get(1997);
 * const { items } = await spiget.search.resources("worldedit", { sort: "-downloads" });
 * ```
 */
export class SpigetClient {
  /** Resources: list, get, versions, updates, reviews and downloads. */
  readonly resources: ResourcesApi;
  /** Authors and their resources and reviews. */
  readonly authors: AuthorsApi;
  /** Resource categories. */
  readonly categories: CategoriesApi;
  /** Search resources and authors. */
  readonly search: SearchApi;
  /** Register and manage webhooks. */
  readonly webhooks: WebhooksApi;

  readonly #ctx: ApiContext;

  constructor(options: SpigetClientOptions) {
    if (!options?.userAgent?.trim()) {
      throw new TypeError("SpigetClient requires a userAgent that identifies your application");
    }
    const fetch = options.fetch ?? globalThis.fetch;
    if (typeof fetch !== "function") {
      throw new TypeError("No fetch implementation found. Use Node.js 22+ or pass `fetch`.");
    }

    this.#ctx = {
      http: new HttpClient({
        baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
        userAgent: `${options.userAgent.trim()} spiget-sdk`,
        timeout: options.timeout ?? 15_000,
        retries: options.retries ?? 2,
        fetch: (input, init) => fetch(input, init),
      }),
      decode: options.decode ?? true,
    };

    this.resources = new ResourcesApi(this.#ctx);
    this.authors = new AuthorsApi(this.#ctx);
    this.categories = new CategoriesApi(this.#ctx);
    this.search = new SearchApi(this.#ctx);
    this.webhooks = new WebhooksApi(this.#ctx);
  }

  /** API status and global counters (total resources, authors, ...). */
  status(options: RequestOptions = {}): Promise<ApiStatus> {
    return getStatus(this.#ctx, options);
  }
}
