import { describe, expect, it } from "vitest";
import type { SpigetClient } from "../src/index.js";
import { json, mockClient } from "./helpers.js";

type Call = (client: SpigetClient) => PromiseLike<unknown>;

const cases: [string, Call, string][] = [
  ["resources.free", (c) => c.resources.free(), "/v2/resources/free"],
  ["resources.premium", (c) => c.resources.premium(), "/v2/resources/premium"],
  ["resources.newest", (c) => c.resources.newest(), "/v2/resources/new"],
  ["resources.author", (c) => c.resources.author(7), "/v2/resources/7/author"],
  ["resources.versions", (c) => c.resources.versions(7), "/v2/resources/7/versions"],
  ["resources.version", (c) => c.resources.version(7, 99), "/v2/resources/7/versions/99"],
  [
    "resources.latestVersion",
    (c) => c.resources.latestVersion(7),
    "/v2/resources/7/versions/latest",
  ],
  ["resources.updates", (c) => c.resources.updates(7), "/v2/resources/7/updates"],
  ["authors.list", (c) => c.authors.list(), "/v2/authors"],
  ["authors.get", (c) => c.authors.get(1), "/v2/authors/1"],
  ["authors.resources", (c) => c.authors.resources(1), "/v2/authors/1/resources"],
  ["authors.reviews", (c) => c.authors.reviews(1), "/v2/authors/1/reviews"],
  ["categories.resources", (c) => c.categories.resources(4), "/v2/categories/4/resources"],
  ["search.authors", (c) => c.search.authors("md_5"), "/v2/search/authors/md_5"],
  ["webhooks.events", (c) => c.webhooks.events(), "/v2/webhook/events"],
  ["webhooks.status", (c) => c.webhooks.status("abc"), "/v2/webhook/status/abc"],
  ["status", (c) => c.status(), "/v2/status"],
];

describe("endpoint paths", () => {
  it.each(cases)("%s requests %s", async (_, call, path) => {
    const { client, calls } = mockClient((url) =>
      json(
        url.pathname === "/v2/webhook/events"
          ? { events: [] }
          : url.pathname.match(/\/\d+$|status|latest/)
            ? {}
            : [],
      ),
    );
    await call(client);
    expect(calls[0]?.url.pathname).toBe(path);
  });
});
