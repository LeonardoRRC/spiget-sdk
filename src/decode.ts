import type { Resource, ResourceReview, ResourceUpdate } from "./types.js";

const BASE64 = /^(?:[A-Za-z0-9+/]{4})+(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const utf8 = new TextDecoder("utf-8", { fatal: true });

/** Decodes a base64 UTF-8 string, returning `undefined` if it is not valid base64 text. */
export function decodeBase64(value: string): string | undefined {
  if (!BASE64.test(value)) return undefined;
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return utf8.decode(bytes);
  } catch {
    return undefined;
  }
}

function decodeField<T extends object>(obj: T, key: keyof T): void {
  const value = obj[key];
  if (typeof value === "string") {
    const decoded = decodeBase64(value);
    if (decoded !== undefined) (obj as Record<keyof T, unknown>)[key] = decoded;
  }
}

/** Spiget base64-encodes custom link labels but leaves the built-in ones as plain words. */
function decodeLinks(links: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [label, url] of Object.entries(links)) {
    out[decodeBase64(label) ?? label] = url;
  }
  return out;
}

export function decodeResource<T extends Partial<Resource>>(resource: T): T {
  decodeField(resource, "description");
  if (resource.links) resource.links = decodeLinks(resource.links);
  return resource;
}

export function decodeUpdate<T extends Partial<ResourceUpdate>>(update: T): T {
  decodeField(update, "description");
  return update;
}

export function decodeReview<T extends Partial<ResourceReview>>(review: T): T {
  decodeField(review, "message");
  decodeField(review, "responseMessage");
  return review;
}
