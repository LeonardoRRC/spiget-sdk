# spiget-sdk

[![npm](https://img.shields.io/npm/v/spiget-sdk?color=36BCF7)](https://www.npmjs.com/package/spiget-sdk)
[![CI](https://github.com/LeonardoRRC/spiget-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/LeonardoRRC/spiget-sdk/actions/workflows/ci.yml)
[![bundle size](https://img.shields.io/bundlejs/size/spiget-sdk)](https://bundlejs.com/?q=spiget-sdk)
[![license](https://img.shields.io/github/license/LeonardoRRC/spiget-sdk)](LICENSE)

A modern, fully typed, **zero-dependency** client for the [Spiget API](https://spiget.org/): search, inspect and download SpigotMC plugins from Node.js, Bun, Deno, browsers or edge runtimes.

```ts
import { SpigetClient } from "spiget-sdk";

const spiget = new SpigetClient({ userAgent: "my-plugin-manager/1.0" });

const { items } = await spiget.search.resources("worldedit", { sort: "-downloads", size: 5 });
const latest = await spiget.resources.latestVersion(items[0].id);
```

## Why

- **Typed end to end.** Every model is typed, and `fields` narrows the result type, so `fields: ["id", "name"]` gives you `{ id; name }[]`.
- **Pagination you don't think about.** `await` a list for one page, or `for await` it to walk every page lazily.
- **Decoded for you.** Spiget base64-encodes descriptions, review messages and link labels; you get plain text and HTML.
- **Resilient.** Timeouts, retries with backoff for `429` and `5xx`, `Retry-After` support and `AbortSignal` cancellation.
- **Honest errors.** `SpigetNotFoundError`, `SpigetRateLimitError` and `SpigetTimeoutError` instead of raw HTTP failures. Empty listings, which Spiget returns as `404 []`, come back as empty pages.
- **Tiny and portable.** Uses the platform `fetch`. Ships ESM and CommonJS with types.

## Install

```bash
npm install spiget-sdk
```

Requires Node.js 20+ (or any runtime with `fetch`, `AbortSignal.any` and `AbortSignal.timeout`).

## Usage

### Create a client

```ts
const spiget = new SpigetClient({
  userAgent: "my-app/1.0 (+https://example.com)", // required: Spiget asks clients to identify themselves
  timeout: 15_000, // ms per request
  retries: 2, // for network errors, 429 and 502/503/504
});
```

| Option      | Default                     | Description                                           |
| ----------- | --------------------------- | ----------------------------------------------------- |
| `userAgent` | —                           | **Required.** Identifies your app to Spiget.          |
| `baseUrl`   | `https://api.spiget.org/v2` | Point at a mirror or proxy.                           |
| `timeout`   | `15000`                     | Per-request timeout in ms.                            |
| `retries`   | `2`                         | Retries for network errors, `429` and gateway errors. |
| `decode`    | `true`                      | Decode base64 descriptions, messages and link labels. |
| `fetch`     | `globalThis.fetch`          | Custom fetch, e.g. for caching or testing.            |

### Resources

```ts
const resource = await spiget.resources.get(1997); // ProtocolLib
resource.description; // decoded HTML
resource.links; // { "Holographic Displays": "https://...", discussion: "threads/..." }

await spiget.resources.author(1997);
await spiget.resources.latestVersion(1997);
await spiget.resources.versions(1997, { sort: "-releaseDate", size: 5 });
await spiget.resources.updates(1997);
await spiget.resources.latestUpdate(1997);
await spiget.resources.reviews(1997, { size: 20 });

await spiget.resources.list({ sort: "-downloads" });
await spiget.resources.free();
await spiget.resources.premium();
await spiget.resources.newest();

// Resources tested on 1.20 *and* 1.21
const { match } = await spiget.resources.forVersions(["1.20", "1.21"], { method: "all" });
```

### Choose fields

Ask only for what you need. The response is smaller and the type follows:

```ts
const page = await spiget.resources.list({ fields: ["id", "name", "downloads"] });
page.items[0].downloads; // number
page.items[0].tag; // ✗ type error: not requested
```

### Pagination

Every list method returns a `PageRequest`:

```ts
// One page
const page = await spiget.categories.list({ size: 10, page: 1 });
page.items; // Category[]
page.pageCount; // from X-Page-Count
page.total; // from X-Total (undefined in browsers, see below)

// Every item, fetching pages as you go
for await (const resource of spiget.authors.resources(1)) {
  console.log(resource.name);
}

// Page by page
for await (const page of spiget.resources.list({ size: 100 }).pages()) {
  console.log(`page ${page.page}/${page.pageCount}`);
}

// Collect, with a cap: /resources has tens of thousands of pages
const top = await spiget.resources.list({ sort: "-downloads", size: 100 }).toArray({ limit: 250 });
```

### Search

```ts
await spiget.search.resources("essentials"); // by name
await spiget.search.resources("economy", { field: "tag" }); // by tagline
await spiget.search.authors("md_5");
```

No matches gives an empty page rather than an error.

### Download

```ts
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const response = await spiget.resources.download(1997); // follows the redirect
await pipeline(Readable.fromWeb(response.body!), createWriteStream("ProtocolLib.jar"));

spiget.resources.downloadUrl(1997); // URL only
spiget.resources.download(1997, { version: 602511 }); // a specific version
```

> [!NOTE]
> Premium resources can't be downloaded through Spiget. For external resources (`resource.external`), Spiget redirects to the author's link, which may be a web page instead of a `.jar`: check `response.headers.get("content-type")`.

See [`examples/download-latest.ts`](examples/download-latest.ts) for a complete script.

### Authors and categories

```ts
await spiget.authors.get(1); // includes icon and linked identities
await spiget.authors.resources(1, { sort: "-downloads" });
await spiget.authors.reviews(1);

await spiget.categories.list();
await spiget.categories.resources(4); // "Spigot"
```

### Webhooks

```ts
const events = await spiget.webhooks.events(); // ["new-resource", "resource-update", "new-author"]
const hook = await spiget.webhooks.register("https://example.com/spiget", ["resource-update"]);
// Save hook.id and hook.secret: the secret is needed to delete the webhook.
await spiget.webhooks.status(hook.id);
await spiget.webhooks.delete(hook.id, hook.secret);
```

### Errors

```ts
import { SpigetError, SpigetNotFoundError, SpigetRateLimitError } from "spiget-sdk";

try {
  await spiget.resources.get(123);
} catch (error) {
  if (error instanceof SpigetNotFoundError) {
    // 404
  } else if (error instanceof SpigetRateLimitError) {
    error.retryAfter; // seconds, if Spiget said
  } else if (error instanceof SpigetError) {
    error.status; // HTTP status, if any
    error.url;
  }
}
```

### Cancellation

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 1_000);
await spiget.resources.list({ signal: controller.signal });
```

### Helpers

- `spigotUrl(path)`: turns paths Spiget returns relative to spigotmc.org (`file.url`, `links.discussion`) into absolute URLs.
- `decodeBase64(value)`: the decoder the client uses, for raw data fetched with `decode: false`.

## Notes on the Spiget API

- Timestamps (`releaseDate`, `updateDate`, `date`) are Unix **seconds**: `new Date(resource.updateDate * 1000)`.
- `description`, `versions`, `updates` and `reviews` are only included when you `get()` a single resource.
- `/authors` listings only include `id` and `name` unless you pass `fields`.
- Browsers can't read the `X-Total` header because Spiget doesn't expose it to CORS requests, so `page.total` is `undefined` there. Use `pageCount`.
- Browsers ignore the `User-Agent` header; it is still required so server-side usage identifies itself.

## Migrating from `spiget-api`

| `spiget-api`             | `spiget-sdk`                                             |
| ------------------------ | -------------------------------------------------------- |
| `new SpigetAPI("agent")` | `new SpigetClient({ userAgent: "agent" })`               |
| `api.getResources()`     | `spiget.resources.list()` (returns a page: use `.items`) |
| axios errors             | `SpigetError` subclasses                                 |
| base64 fields            | decoded automatically                                    |
| manual pagination        | `for await` / `.toArray()`                               |

## Development

```bash
npm install
npm test            # unit tests with a mocked fetch
npm run test:live   # smoke tests against the real api.spiget.org
npm run lint        # Biome
npm run typecheck
npm run build       # tsdown → dist/ (ESM + CJS + .d.ts)
npm run docs        # TypeDoc → docs-site/
```

Releases use [Changesets](https://github.com/changesets/changesets): run `npm run changeset`, describe the change and commit it. The Release workflow opens a release PR, and merging it publishes to npm with provenance.

## License

[MIT](LICENSE). Not affiliated with SpigotMC or Spiget. Data comes from the public [Spiget API](https://spiget.org/).
