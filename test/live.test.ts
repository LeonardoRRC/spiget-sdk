/**
 * Smoke tests against the real api.spiget.org. Run with `npm run test:live`.
 * They check the SDK still matches what Spiget returns, so they use well-known, stable ids.
 */
import { describe, expect, it } from "vitest";
import { SpigetClient, SpigetNotFoundError } from "../src/index.js";

const spiget = new SpigetClient({
  userAgent: "spiget-sdk-tests (+https://github.com/LeonardoRRC/spiget-sdk)",
});
const PROTOCOL_LIB = 1997;

describe("live Spiget API", () => {
  it("gets a resource with decoded fields", async () => {
    const resource = await spiget.resources.get(PROTOCOL_LIB);
    expect(resource.name).toBe("ProtocolLib");
    expect(resource.description).toMatch(/</);
    expect(resource.versions?.length).toBeGreaterThan(0);
  });

  it("paginates with header metadata", async () => {
    const page = await spiget.resources.list({
      size: 2,
      sort: "-downloads",
      fields: ["id", "name"],
    });
    expect(page.items).toHaveLength(2);
    expect(page.pageCount).toBeGreaterThan(1);
    expect(page.total).toBeGreaterThan(1000);
  });

  it("searches and returns empty pages for no matches", async () => {
    const { items } = await spiget.search.resources("protocollib", { size: 5 });
    expect(items.some((r) => r.id === PROTOCOL_LIB)).toBe(true);
    expect((await spiget.search.resources("zz-no-such-plugin-qq")).items).toEqual([]);
  });

  it("reads versions, updates, reviews and the author", async () => {
    const latest = await spiget.resources.latestVersion(PROTOCOL_LIB);
    expect(latest.resource).toBe(PROTOCOL_LIB);
    const { items: reviews } = await spiget.resources.reviews(PROTOCOL_LIB, { size: 1 });
    expect(reviews[0]?.message).not.toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect((await spiget.resources.author(PROTOCOL_LIB)).name).toBeTruthy();
  });

  it("throws SpigetNotFoundError for unknown ids", async () => {
    await expect(spiget.resources.get(999_999_999)).rejects.toBeInstanceOf(SpigetNotFoundError);
  });
});
