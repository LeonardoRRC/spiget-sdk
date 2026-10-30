import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SpigetClient,
  SpigetError,
  SpigetRateLimitError,
  SpigetTimeoutError,
} from "../src/index.js";
import { json, mockClient } from "./helpers.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("retries", () => {
  it("retries rate limits, honouring Retry-After", async () => {
    vi.useFakeTimers();
    let attempt = 0;
    const { client, fetch } = mockClient(
      () =>
        ++attempt === 1
          ? { status: 429, body: { error: "slow down" }, headers: { "Retry-After": "2" } }
          : json({ id: 1, name: "Spigot" }),
      { retries: 2 },
    );

    const result = client.categories.get(1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual({ id: 1, name: "Spigot" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("throws SpigetRateLimitError when retries run out", async () => {
    const { client, fetch } = mockClient(
      () => ({
        status: 429,
        body: { error: "slow down" },
        headers: { "Retry-After": "0" },
      }),
      { retries: 1 },
    );

    const error = await client.categories.get(1).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SpigetRateLimitError);
    expect(error).toMatchObject({ status: 429, retryAfter: 0 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retries gateway errors with backoff", async () => {
    vi.useFakeTimers();
    let attempt = 0;
    const { client, fetch } = mockClient(
      () => (++attempt < 3 ? { status: 503 } : json({ id: 1, name: "ok" })),
      { retries: 2 },
    );
    const result = client.categories.get(1);
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual({ id: 1, name: "ok" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry other client errors", async () => {
    const { client, fetch } = mockClient(
      () => ({ status: 400, body: { error: "invalid field" } }),
      {
        retries: 3,
      },
    );
    await expect(client.search.authors("x")).rejects.toThrow("HTTP 400: invalid field");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("wraps network failures after retrying", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const client = new SpigetClient({ userAgent: "t", retries: 1, fetch });
    const result = client.status().catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    const error = await result;
    expect(error).toBeInstanceOf(SpigetError);
    expect((error as SpigetError).cause).toBeInstanceOf(TypeError);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("cancellation", () => {
  const hangingFetch = vi.fn(
    (_: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      }),
  );

  it("times out slow requests", async () => {
    const client = new SpigetClient({
      userAgent: "t",
      timeout: 20,
      retries: 3,
      fetch: hangingFetch,
    });
    await expect(client.status()).rejects.toBeInstanceOf(SpigetTimeoutError);
  });

  it("aborts with the caller's signal without retrying", async () => {
    hangingFetch.mockClear();
    const client = new SpigetClient({ userAgent: "t", retries: 3, fetch: hangingFetch });
    const controller = new AbortController();
    const result = client.status({ signal: controller.signal });
    controller.abort(new Error("stop"));
    await expect(result).rejects.toThrow("stop");
    expect(hangingFetch).toHaveBeenCalledTimes(1);
  });
});
