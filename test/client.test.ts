import { describe, expect, it } from "vitest";
import { SpigetClient, SpigetNotFoundError } from "../src/index.js";
import { b64, json, mockClient, pageHeaders } from "./helpers.js";

describe("SpigetClient", () => {
  it("requires a user agent", () => {
    expect(() => new SpigetClient({ userAgent: "  " })).toThrow(TypeError);
  });

  it("sends the user agent and builds list queries", async () => {
    const { client, calls } = mockClient(() => json([], { headers: pageHeaders(2, 5, 3, 15) }));

    await client.resources.list({ size: 3, page: 2, sort: "-downloads", fields: ["id", "name"] });

    const [{ url, init }] = calls as [(typeof calls)[number]];
    expect(url.pathname).toBe("/v2/resources");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      size: "3",
      page: "2",
      sort: "-downloads",
      fields: "id,name",
    });
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe(
      "test-suite/1.0 spiget-sdk",
    );
  });

  it("respects a custom base URL", async () => {
    const { client, calls } = mockClient(() => json({ id: 1, name: "Spigot" }), {
      baseUrl: "https://mirror.example.com/api/v2/",
    });
    await client.categories.get(1);
    expect(calls[0]?.url.toString()).toBe("https://mirror.example.com/api/v2/categories/1");
  });

  it("decodes base64 fields on resources, updates and reviews", async () => {
    const { client } = mockClient((url) => {
      if (url.pathname.endsWith("/resources/1"))
        return json({
          id: 1,
          description: b64("<b>Hi ✨</b>"),
          links: { [b64("Discord")]: "https://discord.gg/x", discussion: "threads/x.1/" },
        });
      if (url.pathname.endsWith("/updates/latest"))
        return json({ id: 2, description: b64("Changelog") });
      return json([{ id: 3, message: b64("Great"), responseMessage: b64("Thanks!") }]);
    });

    const resource = await client.resources.get(1);
    expect(resource.description).toBe("<b>Hi ✨</b>");
    expect(resource.links).toEqual({
      Discord: "https://discord.gg/x",
      discussion: "threads/x.1/",
    });
    expect((await client.resources.latestUpdate(1)).description).toBe("Changelog");
    const { items } = await client.resources.reviews(1);
    expect(items[0]).toMatchObject({ message: "Great", responseMessage: "Thanks!" });
  });

  it("leaves fields encoded when decode is false", async () => {
    const encoded = b64("<p>raw</p>");
    const { client } = mockClient(() => json({ id: 1, description: encoded, links: {} }), {
      decode: false,
    });
    expect((await client.resources.get(1)).description).toBe(encoded);
  });

  it("throws SpigetNotFoundError with the API message", async () => {
    const { client } = mockClient(() => ({ status: 404, body: { error: "resource not found" } }));
    const error = await client.resources.get(42).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SpigetNotFoundError);
    expect(error).toMatchObject({
      status: 404,
      message: "Spiget responded with HTTP 404: resource not found",
    });
  });

  it("returns an empty page when a search has no matches", async () => {
    const { client, calls } = mockClient(() => ({ status: 404, body: [] }));
    const page = await client.search.resources("nothing here", { field: "tag" });
    expect(page).toMatchObject({ items: [], total: 0, pageCount: 0 });
    expect(calls[0]?.url.pathname).toBe("/v2/search/resources/nothing%20here");
    expect(calls[0]?.url.searchParams.get("field")).toBe("tag");
  });

  it("checks resources for versions and handles no matches", async () => {
    const { client, calls } = mockClient((url) =>
      url.pathname.includes("1.21")
        ? json({ check: ["1.20", "1.21"], method: "all", match: [{ id: 5, name: "A" }] })
        : { status: 404, body: { check: ["0.1"], method: "any", match: [] } },
    );

    const found = await client.resources.forVersions(["1.20", "1.21"], {
      method: "all",
      fields: ["id", "name"],
    });
    expect(found.match).toEqual([{ id: 5, name: "A" }]);
    expect(calls[0]?.url.pathname).toBe("/v2/resources/for/1.20%2C1.21");
    expect(calls[0]?.url.searchParams.get("method")).toBe("all");

    expect(await client.resources.forVersions("0.1")).toEqual({
      check: ["0.1"],
      method: "any",
      match: [],
    });
  });

  it("builds download URLs and returns the download response", async () => {
    const { client, calls } = mockClient(() => ({ status: 200, body: "jar-bytes" }));
    expect(client.resources.downloadUrl(1997)).toBe(
      "https://api.spiget.org/v2/resources/1997/download",
    );
    expect(client.resources.downloadUrl(1997, 602511)).toBe(
      "https://api.spiget.org/v2/resources/1997/versions/602511/download",
    );

    const response = await client.resources.download(1997, { version: "latest" });
    expect(await response.json()).toBe("jar-bytes");
    expect(calls[0]?.url.pathname).toBe("/v2/resources/1997/versions/latest/download");
  });

  it("registers webhooks with JSON-encoded events", async () => {
    const { client, calls } = mockClient(() =>
      json({ id: "abc", url: "https://x.dev/hook", events: ["new-resource"], secret: "s" }),
    );

    const hook = await client.webhooks.register("https://x.dev/hook", ["new-resource"]);
    expect(hook.secret).toBe("s");

    const { init } = calls[0] as (typeof calls)[number];
    expect(init.method).toBe("POST");
    const body = init.body as URLSearchParams;
    expect(body.get("url")).toBe("https://x.dev/hook");
    expect(body.get("events")).toBe('["new-resource"]');
  });

  it("deletes webhooks", async () => {
    const { client, calls } = mockClient(() => json({ success: true }));
    await client.webhooks.delete("id/1", "sec ret");
    expect(calls[0]?.init.method).toBe("DELETE");
    expect(calls[0]?.url.pathname).toBe("/v2/webhook/delete/id%2F1/sec%20ret");
  });
});
