import { vi } from "vitest";
import { SpigetClient, type SpigetClientOptions } from "../src/index.js";

export interface MockRoute {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export type Handler = (url: URL, init: RequestInit) => MockRoute | Promise<MockRoute>;

export function json(body: unknown, init: Omit<MockRoute, "body"> = {}): MockRoute {
  return { status: 200, ...init, body };
}

export function pageHeaders(index: number, count: number, size: number, total?: number) {
  return {
    "X-Page-Index": String(index),
    "X-Page-Count": String(count),
    "X-Page-Size": String(size),
    ...(total === undefined ? {} : { "X-Total": String(total) }),
  };
}

/** A client whose fetch is answered by `handler`. `calls` records every request. */
export function mockClient(handler: Handler, options: Partial<SpigetClientOptions> = {}) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    const route = await handler(url, init);
    return new Response(route.body === undefined ? null : JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: { "Content-Type": "application/json", ...route.headers },
    });
  });
  const client = new SpigetClient({
    userAgent: "test-suite/1.0",
    retries: 0,
    ...options,
    fetch: fetch as typeof globalThis.fetch,
  });
  return { client, calls, fetch };
}

export const b64 = (text: string): string => Buffer.from(text, "utf8").toString("base64");
