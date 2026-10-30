/** One page of results plus the pagination info Spiget sends in its `X-Page-*` headers. */
export interface Page<T> {
  items: T[];
  /** 1-based index of this page. */
  page: number;
  pageSize: number;
  pageCount: number;
  /**
   * Total number of items across all pages.
   * `undefined` in browsers, because Spiget does not expose `X-Total` to CORS requests.
   */
  total: number | undefined;
}

/**
 * The result of every list method.
 *
 * - `await` it to get a single {@link Page}.
 * - `for await` over it to iterate every item, fetching following pages on demand.
 *
 * @example
 * ```ts
 * const page = await spiget.resources.list({ size: 10 });
 *
 * for await (const resource of spiget.resources.list({ size: 100 })) {
 *   if (resource.downloads < 1_000) break;
 * }
 * ```
 */
export class PageRequest<T> implements PromiseLike<Page<T>>, AsyncIterable<T> {
  readonly #fetchPage: (page: number) => Promise<Page<T>>;
  readonly #startPage: number;
  #first: Promise<Page<T>> | undefined;

  /** @internal */
  constructor(fetchPage: (page: number) => Promise<Page<T>>, startPage = 1) {
    this.#fetchPage = fetchPage;
    this.#startPage = startPage;
  }

  #firstPage(): Promise<Page<T>> {
    this.#first ??= this.#fetchPage(this.#startPage);
    return this.#first;
  }

  // biome-ignore lint/suspicious/noThenProperty: PageRequest is intentionally awaitable.
  then<R1 = Page<T>, R2 = never>(
    onfulfilled?: ((value: Page<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return this.#firstPage().then(onfulfilled, onrejected);
  }

  /** Iterates page by page, starting at the requested page. */
  async *pages(): AsyncGenerator<Page<T>, void, undefined> {
    let page = await this.#firstPage();
    yield page;
    while (page.page < page.pageCount && page.items.length > 0) {
      page = await this.#fetchPage(page.page + 1);
      yield page;
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T, void, undefined> {
    for await (const page of this.pages()) yield* page.items;
  }

  /**
   * Collects items from every page into an array.
   * Pass `limit` to stop early: some listings span tens of thousands of pages.
   */
  async toArray(options: { limit?: number } = {}): Promise<T[]> {
    const limit = options.limit ?? Number.POSITIVE_INFINITY;
    const items: T[] = [];
    if (limit <= 0) return items;
    for await (const item of this) {
      items.push(item);
      if (items.length >= limit) break;
    }
    return items;
  }
}

/** Builds a {@link Page} from a response body and Spiget's pagination headers. */
export function toPage<T>(items: T[], headers: Headers, requestedPage: number): Page<T> {
  const header = (name: string) => {
    const value = Number(headers.get(name));
    return Number.isFinite(value) && headers.has(name) ? value : undefined;
  };
  return {
    items,
    page: header("x-page-index") ?? requestedPage,
    pageSize: header("x-page-size") ?? items.length,
    pageCount: header("x-page-count") ?? 1,
    total: header("x-total"),
  };
}

/** A page with no results, used where Spiget answers "no matches" with a 404. */
export function emptyPage<T>(page: number, pageSize: number): Page<T> {
  return { items: [], page, pageSize, pageCount: 0, total: 0 };
}
