import { decodeResource, decodeReview, decodeUpdate } from "./decode.js";
import { SpigetNotFoundError } from "./errors.js";
import type { HttpClient, QueryValue } from "./http.js";
import { emptyPage, type Page, PageRequest, toPage } from "./pagination.js";
import type {
  ApiStatus,
  Author,
  Category,
  Resource,
  ResourceReview,
  ResourceUpdate,
  ResourceVersion,
  VersionMatch,
  WebhookEvent,
  WebhookRegistration,
  WebhookStatus,
} from "./types.js";

/** Field name to sort by, optionally prefixed with `+` (ascending) or `-` (descending). */
export type SortOrder<T> = `${"+" | "-" | ""}${keyof T & string}`;

/** Options accepted by every request. */
export interface RequestOptions {
  /** Cancels the request. */
  signal?: AbortSignal;
}

/** Options accepted by every list method. */
export interface ListOptions<T, K extends keyof T = keyof T> extends RequestOptions {
  /** Items per page. Spiget's default is 10. */
  size?: number;
  /** 1-based page to start at. */
  page?: number;
  /** Sort order, e.g. `"-downloads"` or `"+name"`. */
  sort?: SortOrder<T>;
  /**
   * Only return these fields. The result type narrows to match.
   * @example `{ fields: ["id", "name", "downloads"] }`
   */
  fields?: readonly K[];
}

/** Options for {@link ResourcesApi.forVersions}. */
export interface ForVersionsOptions<K extends keyof Resource = keyof Resource>
  extends ListOptions<Resource, K> {
  /** `"any"` (default) matches resources tested on at least one version, `"all"` on every one. */
  method?: "any" | "all";
}

/** Options for search methods. */
export interface SearchOptions<T, F extends string, K extends keyof T = keyof T>
  extends ListOptions<T, K> {
  /** Field to search in. Defaults to `"name"`. */
  field?: F;
}

/** A version id, or `"latest"`. */
export type VersionId = number | "latest";

/** @internal */
export interface ApiContext {
  http: HttpClient;
  decode: boolean;
}

type Picked<T, K extends keyof T> = Pick<T, K>;

function listQuery<T, K extends keyof T>(
  options: ListOptions<T, K>,
  page: number,
): Record<string, QueryValue> {
  return {
    size: options.size,
    page,
    sort: options.sort,
    fields: options.fields as readonly string[] | undefined,
  };
}

function paginate<T, K extends keyof T>(
  ctx: ApiContext,
  path: string,
  options: ListOptions<T, K> & { query?: Record<string, QueryValue> },
  transform?: (item: Picked<T, K>) => Picked<T, K>,
): PageRequest<Picked<T, K>> {
  const decode = ctx.decode ? transform : undefined;
  return new PageRequest(async (page): Promise<Page<Picked<T, K>>> => {
    try {
      const { data, headers } = await ctx.http.json<Picked<T, K>[]>(path, {
        query: { ...listQuery(options, page), ...options.query },
        signal: options.signal,
      });
      return toPage(decode ? data.map(decode) : data, headers, page);
    } catch (error) {
      // Spiget answers an empty listing with `404 []`.
      if (error instanceof SpigetNotFoundError) return emptyPage(page, options.size ?? 10);
      throw error;
    }
  }, options.page ?? 1);
}

async function get<T>(
  ctx: ApiContext,
  path: string,
  options: RequestOptions,
  transform?: (item: T) => T,
): Promise<T> {
  const { data } = await ctx.http.json<T>(path, { signal: options.signal });
  return ctx.decode && transform ? transform(data) : data;
}

/** Endpoints under `/resources`. Reached through `spiget.resources`. */
export class ResourcesApi {
  readonly #ctx: ApiContext;

  /** @internal */
  constructor(ctx: ApiContext) {
    this.#ctx = ctx;
  }

  /** Lists all resources. */
  list<K extends keyof Resource = keyof Resource>(
    options: ListOptions<Resource, K> = {},
  ): PageRequest<Pick<Resource, K>> {
    return paginate(this.#ctx, "resources", options, decodeResource);
  }

  /** Lists free resources. */
  free<K extends keyof Resource = keyof Resource>(
    options: ListOptions<Resource, K> = {},
  ): PageRequest<Pick<Resource, K>> {
    return paginate(this.#ctx, "resources/free", options, decodeResource);
  }

  /** Lists premium (paid) resources. */
  premium<K extends keyof Resource = keyof Resource>(
    options: ListOptions<Resource, K> = {},
  ): PageRequest<Pick<Resource, K>> {
    return paginate(this.#ctx, "resources/premium", options, decodeResource);
  }

  /** Lists the newest resources. */
  newest<K extends keyof Resource = keyof Resource>(
    options: ListOptions<Resource, K> = {},
  ): PageRequest<Pick<Resource, K>> {
    return paginate(this.#ctx, "resources/new", options, decodeResource);
  }

  /**
   * Lists resources tested on the given Minecraft versions.
   * Pagination applies to {@link VersionMatch.match}.
   *
   * @example
   * ```ts
   * const { match } = await spiget.resources.forVersions(["1.20", "1.21"], { method: "all" });
   * ```
   */
  async forVersions<K extends keyof Resource = keyof Resource>(
    versions: string | readonly string[],
    options: ForVersionsOptions<K> = {},
  ): Promise<VersionMatch<Pick<Resource, K>>> {
    const list = typeof versions === "string" ? [versions] : [...versions];
    const method = options.method ?? "any";
    try {
      const { data } = await this.#ctx.http.json<VersionMatch<Pick<Resource, K>>>(
        `resources/for/${encodeURIComponent(list.join(","))}`,
        {
          query: { ...listQuery(options, options.page ?? 1), method },
          signal: options.signal,
        },
      );
      if (this.#ctx.decode) data.match = data.match.map(decodeResource);
      return data;
    } catch (error) {
      if (error instanceof SpigetNotFoundError) return { check: list, method, match: [] };
      throw error;
    }
  }

  /** Gets a resource, including its description and version, update and review ids. */
  get(id: number, options: RequestOptions = {}): Promise<Resource> {
    return get(this.#ctx, `resources/${id}`, options, decodeResource);
  }

  /** Gets the author of a resource. */
  author(id: number, options: RequestOptions = {}): Promise<Author> {
    return get(this.#ctx, `resources/${id}/author`, options);
  }

  /** Lists a resource's versions. Sort by `"-releaseDate"` for newest first. */
  versions<K extends keyof ResourceVersion = keyof ResourceVersion>(
    id: number,
    options: ListOptions<ResourceVersion, K> = {},
  ): PageRequest<Pick<ResourceVersion, K>> {
    return paginate(this.#ctx, `resources/${id}/versions`, options);
  }

  /** Gets a single version, or the latest one. */
  version(id: number, version: VersionId, options: RequestOptions = {}): Promise<ResourceVersion> {
    return get(this.#ctx, `resources/${id}/versions/${version}`, options);
  }

  /** Gets the latest version. Shorthand for `version(id, "latest")`. */
  latestVersion(id: number, options: RequestOptions = {}): Promise<ResourceVersion> {
    return this.version(id, "latest", options);
  }

  /** Lists a resource's update posts. */
  updates<K extends keyof ResourceUpdate = keyof ResourceUpdate>(
    id: number,
    options: ListOptions<ResourceUpdate, K> = {},
  ): PageRequest<Pick<ResourceUpdate, K>> {
    return paginate(this.#ctx, `resources/${id}/updates`, options, decodeUpdate);
  }

  /** Gets the most recent update post. Throws {@link SpigetNotFoundError} if there are none. */
  latestUpdate(id: number, options: RequestOptions = {}): Promise<ResourceUpdate> {
    return get(this.#ctx, `resources/${id}/updates/latest`, options, decodeUpdate);
  }

  /** Lists a resource's reviews. */
  reviews<K extends keyof ResourceReview = keyof ResourceReview>(
    id: number,
    options: ListOptions<ResourceReview, K> = {},
  ): PageRequest<Pick<ResourceReview, K>> {
    return paginate(this.#ctx, `resources/${id}/reviews`, options, decodeReview);
  }

  /**
   * URL that redirects to the resource's file. Pass a version id to pin a version.
   * Premium resources cannot be downloaded through Spiget.
   */
  downloadUrl(id: number, version?: VersionId): string {
    return this.#ctx.http.url(
      version === undefined
        ? `resources/${id}/download`
        : `resources/${id}/versions/${version}/download`,
    );
  }

  /**
   * Downloads a resource and returns the final `Response`, after redirects.
   * Read it with `response.arrayBuffer()` or stream `response.body`.
   *
   * For external resources Spiget redirects to {@link ResourceFile.externalUrl}, which may be
   * a web page rather than a file: check `response.headers.get("content-type")`.
   *
   * @example
   * ```ts
   * import { Readable } from "node:stream";
   * import { createWriteStream } from "node:fs";
   * import { pipeline } from "node:stream/promises";
   *
   * const response = await spiget.resources.download(1997);
   * await pipeline(Readable.fromWeb(response.body!), createWriteStream("ProtocolLib.jar"));
   * ```
   */
  download(id: number, options: RequestOptions & { version?: VersionId } = {}): Promise<Response> {
    const path =
      options.version === undefined
        ? `resources/${id}/download`
        : `resources/${id}/versions/${options.version}/download`;
    return this.#ctx.http.raw(path, { signal: options.signal });
  }
}

/** Endpoints under `/authors`. Reached through `spiget.authors`. */
export class AuthorsApi {
  readonly #ctx: ApiContext;

  /** @internal */
  constructor(ctx: ApiContext) {
    this.#ctx = ctx;
  }

  /** Lists authors. Spiget only returns `id` and `name` unless you ask for more `fields`. */
  list<K extends keyof Author = keyof Author>(
    options: ListOptions<Author, K> = {},
  ): PageRequest<Pick<Author, K>> {
    return paginate(this.#ctx, "authors", options);
  }

  /** Gets an author, including their icon and linked identities. */
  get(id: number, options: RequestOptions = {}): Promise<Author> {
    return get(this.#ctx, `authors/${id}`, options);
  }

  /** Lists resources published by an author. */
  resources<K extends keyof Resource = keyof Resource>(
    id: number,
    options: ListOptions<Resource, K> = {},
  ): PageRequest<Pick<Resource, K>> {
    return paginate(this.#ctx, `authors/${id}/resources`, options, decodeResource);
  }

  /** Lists reviews written by an author. */
  reviews<K extends keyof ResourceReview = keyof ResourceReview>(
    id: number,
    options: ListOptions<ResourceReview, K> = {},
  ): PageRequest<Pick<ResourceReview, K>> {
    return paginate(this.#ctx, `authors/${id}/reviews`, options, decodeReview);
  }
}

/** Endpoints under `/categories`. Reached through `spiget.categories`. */
export class CategoriesApi {
  readonly #ctx: ApiContext;

  /** @internal */
  constructor(ctx: ApiContext) {
    this.#ctx = ctx;
  }

  /** Lists categories. */
  list<K extends keyof Category = keyof Category>(
    options: ListOptions<Category, K> = {},
  ): PageRequest<Pick<Category, K>> {
    return paginate(this.#ctx, "categories", options);
  }

  /** Gets a category. */
  get(id: number, options: RequestOptions = {}): Promise<Category> {
    return get(this.#ctx, `categories/${id}`, options);
  }

  /** Lists resources in a category. */
  resources<K extends keyof Resource = keyof Resource>(
    id: number,
    options: ListOptions<Resource, K> = {},
  ): PageRequest<Pick<Resource, K>> {
    return paginate(this.#ctx, `categories/${id}/resources`, options, decodeResource);
  }
}

/** Endpoints under `/search`. Reached through `spiget.search`. No matches yields an empty page. */
export class SearchApi {
  readonly #ctx: ApiContext;

  /** @internal */
  constructor(ctx: ApiContext) {
    this.#ctx = ctx;
  }

  /**
   * Searches resources by name (default) or tag. Matching is case-insensitive and partial.
   *
   * @example
   * ```ts
   * const { items } = await spiget.search.resources("worldedit", { sort: "-downloads", size: 5 });
   * ```
   */
  resources<K extends keyof Resource = keyof Resource>(
    query: string,
    options: SearchOptions<Resource, "name" | "tag", K> = {},
  ): PageRequest<Pick<Resource, K>> {
    return paginate(
      this.#ctx,
      `search/resources/${encodeURIComponent(query)}`,
      { ...options, query: { field: options.field } },
      decodeResource,
    );
  }

  /** Searches authors by name. */
  authors<K extends keyof Author = keyof Author>(
    query: string,
    options: SearchOptions<Author, "name", K> = {},
  ): PageRequest<Pick<Author, K>> {
    return paginate(this.#ctx, `search/authors/${encodeURIComponent(query)}`, {
      ...options,
      query: { field: options.field },
    });
  }
}

/**
 * Spiget webhooks notify a URL of yours when resources or authors change.
 * Reached through `spiget.webhooks`.
 */
export class WebhooksApi {
  readonly #ctx: ApiContext;

  /** @internal */
  constructor(ctx: ApiContext) {
    this.#ctx = ctx;
  }

  /** Lists the event names you can subscribe to. */
  async events(options: RequestOptions = {}): Promise<WebhookEvent[]> {
    const { data } = await this.#ctx.http.json<{ events: WebhookEvent[] }>("webhook/events", {
      signal: options.signal,
    });
    return data.events;
  }

  /** Registers a webhook. Keep the returned `secret`: it is needed to delete the webhook. */
  async register(
    url: string,
    events: readonly WebhookEvent[],
    options: RequestOptions = {},
  ): Promise<WebhookRegistration> {
    const body = new URLSearchParams({ url, events: JSON.stringify(events) });
    const { data } = await this.#ctx.http.json<WebhookRegistration>("webhook/register", {
      method: "POST",
      body,
      signal: options.signal,
    });
    return data;
  }

  /** Gets delivery status for a webhook. */
  status(id: string, options: RequestOptions = {}): Promise<WebhookStatus> {
    return get(this.#ctx, `webhook/status/${encodeURIComponent(id)}`, options);
  }

  /** Deletes a webhook. */
  async delete(id: string, secret: string, options: RequestOptions = {}): Promise<void> {
    const response = await this.#ctx.http.raw(
      `webhook/delete/${encodeURIComponent(id)}/${encodeURIComponent(secret)}`,
      { method: "DELETE", signal: options.signal },
    );
    await response.body?.cancel();
  }
}

/** @internal */
export function getStatus(ctx: ApiContext, options: RequestOptions = {}): Promise<ApiStatus> {
  return get(ctx, "status", options);
}
