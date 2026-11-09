import type { ConnectorPin } from "./connector-client.ts";

/** Version of the {@link TrustStore} port. A breaking change bumps it and comes with an ADR. */
export const trustStoreVersion = 1;

/** How a trust record came to be: the Studio prompt, `halonic trust`, a new workspace Halonic wrote, or the one-time migration. */
export type TrustOrigin = "prompt" | "cli" | "created" | "migration";

/**
 * What Halonic keeps when a person trusts a source (a workspace, or a hub
 * or skill folder outside it).
 *
 * @example
 * const record: TrustRecord = {
 *   location: "/workspaces/acme",
 *   fingerprint: "hfp1:9f86d081884c7d65…",
 *   content: { programs: [{ connector: "mail", command: "npx", args: ["-y", "@acme/mail-mcp"] }] },
 *   grantedAt: "2026-11-08T10:00:00.000Z",
 *   appVersion: "0.1.0",
 *   pins: { mail: { registry: "npm", registryUrl: "https://registry.npmjs.org", package: "@acme/mail-mcp", version: "2.3.1" } },
 *   origin: "prompt",
 * };
 */
export interface TrustRecord {
  /** The source's resolved real path. It is the record's key and isn't part of the fingerprint. */
  location: string;
  /** The fingerprint of what the prompt showed, such as "hfp1:9f86d0…". */
  fingerprint: string;
  /** The normalised content the fingerprint was computed from, as JSON, so "what changed" can be shown later. */
  content: unknown;
  /** When the person trusted it, as ISO text. */
  grantedAt: string;
  /** The version of Halonic that wrote the record. */
  appVersion: string;
  /** The pinned version of each package-runner connector (`npx`, `uvx` and so on), by connector id. */
  pins: Record<string, ConnectorPin>;
  origin: TrustOrigin;
}

/**
 * The trust records in the user's profile: the profile folder for the CLI
 * and `serve`, the app data folder for the desktop app, memory for tests
 * and the browser demo. **Never inside a workspace**, so a workspace can't
 * trust itself.
 *
 * The port only stores records. `TrustService` in `core/app` resolves the
 * location, computes the fingerprint and decides whether a source is
 * trusted. Locations are compared exactly as given: no case folding and
 * no Unicode normalisation, so `café` written as one code point and as `e`
 * plus a combining accent are two locations.
 *
 * A record that exists but can't be read makes `get` and `list` throw,
 * never return `null` or skip it: the service then treats the source as
 * untrusted and tells the user why, instead of asking again as if it were
 * new. The error names the record's location, and `revoke` still deletes
 * that record, so the user can recover with `halonic trust --remove`.
 */
export interface TrustStore {
  /** The record for a location, or `null` when there is none. */
  get(location: string): Promise<TrustRecord | null>;
  /** Saves a record, replacing any record for the same location. */
  grant(record: TrustRecord): Promise<void>;
  /**
   * Deletes the record for a location, even one that can't be read.
   * Revoking one that isn't there is not an error.
   */
  revoke(location: string): Promise<void>;
  /**
   * Every record, sorted by location in UTF-16 code-unit order (as `<`
   * compares strings, not `localeCompare`), for `halonic trust --list` and
   * the trusted-sources list.
   *
   * @throws when any record can't be read, naming its location
   */
  list(): Promise<TrustRecord[]>;
}
