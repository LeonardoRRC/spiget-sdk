/**
 * Data models returned by the Spiget API.
 *
 * Timestamps are Unix epoch **seconds**, exactly as Spiget sends them.
 * Fields that Spiget base64-encodes (descriptions, review messages, link labels)
 * are decoded by the client unless `decode: false` is passed to {@link SpigetClient}.
 *
 * @module
 */

/** A reference to another entity by numeric id. */
export interface IdReference {
  id: number;
}

/** A reference to a resource version by id and UUID. */
export interface VersionReference {
  id: number;
  uuid: string;
}

/** Average rating and number of ratings. */
export interface Rating {
  count: number;
  average: number;
}

/** An icon. `data` is a base64-encoded PNG; `url` may be empty. */
export interface Icon {
  url: string;
  data: string;
  info?: string;
  hash?: string;
}

/** The downloadable file of a resource. */
export interface ResourceFile {
  /** File extension such as `.jar`, or `external` for externally hosted files. */
  type: string;
  size: number;
  /** Unit of {@link ResourceFile.size}, e.g. `KB` or `MB`. Empty for external files. */
  sizeUnit: string;
  /** Download path relative to `https://www.spigotmc.org/`. */
  url: string;
  /** Only set when the resource is hosted outside SpigotMC. */
  externalUrl?: string;
}

/** A SpigotMC resource (plugin, library, skript, etc.). */
export interface Resource {
  id: number;
  name: string;
  /** Short tagline shown under the resource name. */
  tag: string;
  contributors: string;
  likes: number;
  file: ResourceFile;
  /** Minecraft versions the author marked as tested, e.g. `["1.20", "1.21"]`. */
  testedVersions: string[];
  /**
   * Links from the resource page. Labels are decoded, so keys look like
   * `"Discord"` instead of `"RGlzY29yZA=="`. Values may be relative to spigotmc.org.
   */
  links: Record<string, string>;
  rating: Rating;
  releaseDate: number;
  updateDate: number;
  downloads: number;
  /** `true` when the file is hosted outside SpigotMC (see {@link ResourceFile.externalUrl}). */
  external: boolean;
  icon: Icon;
  premium: boolean;
  price: number;
  /** Only set on premium resources. */
  currency?: string;
  author: IdReference;
  category: IdReference;
  /** The latest version. */
  version: VersionReference;
  sourceCodeLink?: string;
  donationLink?: string;
  existenceStatus?: number;
  /** HTML description. Only included when fetching a single resource. */
  description?: string;
  /** Only included when fetching a single resource. */
  versions?: VersionReference[];
  /** Only included when fetching a single resource. */
  updates?: IdReference[];
  /** Only included when fetching a single resource. */
  reviews?: IdReference[];
}

/** A released version of a resource. */
export interface ResourceVersion {
  id: number;
  uuid: string;
  name: string;
  releaseDate: number;
  downloads: number;
  rating: Rating;
  resource: number;
}

/** An update post on a resource page. */
export interface ResourceUpdate {
  id: number;
  resource: number;
  title: string;
  /** HTML body of the update. */
  description: string;
  date: number;
  likes: number;
}

/** A review left on a resource. */
export interface ResourceReview {
  id: number;
  author: IdReference;
  rating: Rating;
  message: string;
  /** The resource author's reply, if any. */
  responseMessage?: string;
  /** Name of the version that was reviewed. */
  version: string;
  date: number;
  resource?: number;
}

/** A SpigotMC user who has published or reviewed resources. */
export interface Author {
  id: number;
  name: string;
  /** Not included in `/authors` listings unless requested with `fields`. */
  icon?: Icon;
  /** Linked accounts, e.g. `{ discord: "...", github: "..." }`. */
  identities?: Record<string, string>;
}

/** A resource category, e.g. "Spigot" or "Bungee - Proxy". */
export interface Category {
  id: number;
  name: string;
}

/** Result of {@link ResourcesApi.forVersions}. */
export interface VersionMatch<T> {
  /** The versions that were checked. */
  check: string[];
  method: "any" | "all";
  match: T[];
}

/** Webhook events Spiget can send. */
export type WebhookEvent = "new-resource" | "resource-update" | "new-author";

/** Returned once when a webhook is registered. Store the secret, it cannot be retrieved later. */
export interface WebhookRegistration {
  id: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
}

/** Delivery health of a registered webhook. */
export interface WebhookStatus {
  status: number;
  failedConnections: number;
}

/** API status and global counters. The `status` block is internal and loosely typed. */
export interface ApiStatus {
  status: Record<string, unknown>;
  stats: {
    resources: number;
    authors: number;
    categories: number;
    resource_updates: number;
    resource_versions: number;
    reviews?: number;
  };
}
