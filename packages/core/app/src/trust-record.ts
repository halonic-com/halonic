// The trust record handling that workspace and plugin trust share: reading
// a record so that one that can't be read is never mistaken for none, the
// record a person's trust saves, and the grant a record gives.

import type {
  Clock,
  ConnectorPin,
  Digest,
  TrustGrant,
  TrustOrigin,
  TrustRecord,
  TrustStore,
} from "@halonicjs/ports";

/** What `TrustService` needs from the host. */
export interface TrustServiceOptions {
  /** The trust records in the user's profile. */
  readonly store: TrustStore;
  /** Hashes the trust content. */
  readonly digest: Digest;
  /** Gives the time a person trusted a workspace or plugin. */
  readonly clock: Clock;
  /** The version of Halonic, written into each record. */
  readonly appVersion: string;
}

/** How a person trusted a workspace or plugin. A migration doesn't go through the service. */
export type PersonTrustOrigin = Exclude<TrustOrigin, "migration">;

/** Why a person's trust wasn't saved. */
export interface TrustRefusal {
  readonly kind: "fingerprint-changed";
  /** The current full fingerprint, to show the person again. */
  readonly fingerprint: string;
}

/** The record the store holds for a location: none, one, or one it can't read. */
export type StoredTrust =
  | { readonly status: "none" }
  | { readonly status: "found"; readonly record: TrustRecord }
  | {
      readonly status: "unreadable";
      /** The store's error. It names the record's location, so the host can say which file. */
      readonly error: unknown;
    };

/** Reads the record for `location`, turning a store error into `unreadable` rather than throwing. */
export async function readTrustRecord(store: TrustStore, location: string): Promise<StoredTrust> {
  let record: TrustRecord | null;
  try {
    record = await store.get(location);
  } catch (error) {
    return { status: "unreadable", error };
  }
  return record === null ? { status: "none" } : { status: "found", record };
}

/** What a person trusted: where, the fingerprint they were shown and its content, and any pins. */
export interface PersonTrust {
  readonly location: string;
  readonly fingerprint: string;
  readonly content: unknown;
  readonly pins: Record<string, ConnectorPin>;
  readonly origin: PersonTrustOrigin;
}

/** Saves a person's trust as a record, dated now and marked with this version of Halonic. */
export async function savePersonTrust(
  options: TrustServiceOptions,
  trust: PersonTrust,
): Promise<TrustGrant> {
  const record: TrustRecord = {
    ...trust,
    grantedAt: options.clock.now().toISOString(),
    appVersion: options.appVersion,
  };
  await options.store.grant(record);
  return grantOf(record);
}

/** The grant a record gives: its location and fingerprint. */
export function grantOf(record: TrustRecord): TrustGrant {
  return { location: record.location, fingerprint: record.fingerprint };
}
