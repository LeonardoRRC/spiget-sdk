import { describe, expect, it } from "vitest";
import { decodeBase64, spigotUrl } from "../src/index.js";
import { b64 } from "./helpers.js";

describe("decodeBase64", () => {
  it("decodes UTF-8 text", () => {
    expect(decodeBase64(b64("¡Hola, Perú! 🧱"))).toBe("¡Hola, Perú! 🧱");
  });

  it("rejects strings that are not base64", () => {
    expect(decodeBase64("discussion")).toBeUndefined();
    expect(decodeBase64("additionalInformation")).toBeUndefined();
    expect(decodeBase64("")).toBeUndefined();
  });

  it("rejects base64 that is not valid UTF-8", () => {
    expect(decodeBase64(Buffer.from([0xff, 0xfe, 0xfd]).toString("base64"))).toBeUndefined();
  });
});

describe("spigotUrl", () => {
  it("resolves paths relative to spigotmc.org", () => {
    expect(spigotUrl("threads/protocollib.36230/")).toBe(
      "https://www.spigotmc.org/threads/protocollib.36230/",
    );
  });

  it("keeps absolute URLs", () => {
    expect(spigotUrl("https://github.com/x")).toBe("https://github.com/x");
  });
});
