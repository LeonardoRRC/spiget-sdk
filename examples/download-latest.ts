/**
 * Finds a plugin by name and downloads its latest version.
 *
 *   npm run build && node examples/download-latest.ts protocollib
 */
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";
import { SpigetClient, SpigetError } from "spiget-sdk";

const spiget = new SpigetClient({ userAgent: "spiget-sdk-example/1.0" });
const query = process.argv[2] ?? "protocollib";

const { items } = await spiget.search.resources(query, {
  size: 1,
  sort: "-downloads",
  fields: ["id", "name", "premium", "external", "file"],
});
const resource = items[0];

if (!resource) {
  console.error(`No resource matches "${query}"`);
  process.exit(1);
}
if (resource.premium) {
  console.error(`${resource.name} is premium and cannot be downloaded through Spiget`);
  process.exit(1);
}

const version = await spiget.resources.latestVersion(resource.id);
console.log(`Downloading ${resource.name} ${version.name}...`);

try {
  const response = await spiget.resources.download(resource.id);
  if (!response.body || !response.headers.get("content-type")?.includes("octet-stream")) {
    console.error(`Not a direct file. Download it manually: ${response.url}`);
    process.exit(1);
  }
  const file = `${resource.name.replace(/[^\w.-]+/g, "_")}-${version.name}.jar`;
  await pipeline(Readable.fromWeb(response.body as ReadableStream), createWriteStream(file));
  console.log(`Saved ${file}`);
} catch (error) {
  if (error instanceof SpigetError)
    console.error(`Spiget error (${error.status}): ${error.message}`);
  throw error;
}
