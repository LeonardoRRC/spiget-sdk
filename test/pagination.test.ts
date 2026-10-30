import { describe, expect, it } from "vitest";
import { json, mockClient, pageHeaders } from "./helpers.js";

/** Serves `total` fake categories split into pages of `size`. */
function pagedCategories(total: number, size: number) {
  const pageCount = Math.ceil(total / size);
  return mockClient((url) => {
    const page = Number(url.searchParams.get("page"));
    const start = (page - 1) * size;
    const items = Array.from({ length: Math.max(0, Math.min(size, total - start)) }, (_, i) => ({
      id: start + i + 1,
      name: `Category ${start + i + 1}`,
    }));
    return json(items, { headers: pageHeaders(page, pageCount, size, total) });
  });
}

describe("PageRequest", () => {
  it("resolves to a single page with header metadata", async () => {
    const { client, fetch } = pagedCategories(25, 10);
    const page = await client.categories.list({ size: 10 });
    expect(page).toMatchObject({ page: 1, pageSize: 10, pageCount: 3, total: 25 });
    expect(page.items).toHaveLength(10);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("iterates every item across pages", async () => {
    const { client, fetch } = pagedCategories(25, 10);
    const ids: number[] = [];
    for await (const category of client.categories.list({ size: 10 })) ids.push(category.id);
    expect(ids).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("starts iterating at the requested page", async () => {
    const { client } = pagedCategories(25, 10);
    const items = await client.categories.list({ size: 10, page: 3 }).toArray();
    expect(items.map((c) => c.id)).toEqual([21, 22, 23, 24, 25]);
  });

  it("stops fetching once toArray reaches its limit", async () => {
    const { client, fetch } = pagedCategories(1000, 10);
    const items = await client.categories.list({ size: 10 }).toArray({ limit: 15 });
    expect(items).toHaveLength(15);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("reuses the first page between await and iteration", async () => {
    const { client, fetch } = pagedCategories(5, 10);
    const request = client.categories.list({ size: 10 });
    await request;
    await request.toArray();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to sensible values without pagination headers", async () => {
    const { client } = mockClient(() => json([{ id: 1, name: "a" }]));
    expect(await client.categories.list()).toEqual({
      items: [{ id: 1, name: "a" }],
      page: 1,
      pageSize: 1,
      pageCount: 1,
      total: undefined,
    });
  });

  it("yields pages through pages()", async () => {
    const { client } = pagedCategories(25, 10);
    const sizes: number[] = [];
    for await (const page of client.categories.list({ size: 10 }).pages()) {
      sizes.push(page.items.length);
    }
    expect(sizes).toEqual([10, 10, 5]);
  });
});
