const SPIGOT = "https://www.spigotmc.org/";

/**
 * Turns a path Spiget returns relative to spigotmc.org (such as `file.url` or a `discussion`
 * link) into an absolute URL. Absolute URLs are returned unchanged.
 *
 * @example
 * ```ts
 * spigotUrl("threads/protocollib.1997/") // "https://www.spigotmc.org/threads/protocollib.1997/"
 * ```
 */
export function spigotUrl(path: string): string {
  return new URL(path, SPIGOT).toString();
}
