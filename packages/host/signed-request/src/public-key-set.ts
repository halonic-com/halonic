// The public halves of Halonic Cloud's keys, as Cloud publishes them and a
// deployment pins them. Each key has one job: a session key signs customers'
// session tokens, a command key signs Cloud's requests to a deployment. A key
// is only ever looked up for its own job, so one can't stand in for the other.
//
// Rotation: a new key is added to the set before anything is signed with it,
// and an old one stays in the set until what it signed has expired.

import { err, isPlainObject, ok, type Result } from "@halonicjs/std";
import { headerPatterns } from "./format.ts";
import { importPublicKey } from "./keys.ts";

/** What a key in the set is for. */
export type KeyUse = "session" | "command";

const keyUses: readonly KeyUse[] = ["session", "command"];

/** One public key as it is written in the set. */
export interface PublishedKey {
  readonly id: string;
  readonly use: KeyUse;
  /** The 32 raw bytes of the public half, in base64url. */
  readonly publicKey: string;
}

/** The set as JSON: `{ "keys": [{ "id", "use", "publicKey" }, …] }`. */
export interface PublishedKeySet {
  readonly keys: readonly PublishedKey[];
}

/** A key set that has been read, with each key ready to verify. */
export interface PublicKeySet {
  /**
   * Finds a key by id, for one job only.
   *
   * @returns the key, or `undefined` when the set has no key with that id for that job
   */
  find(id: string, use: KeyUse): CryptoKey | undefined;
  /** The ids in the set, for one job. */
  ids(use: KeyUse): readonly string[];
}

/** Why a key set was refused, with the position of the key at fault where there is one. */
export interface KeySetRefusal {
  readonly reason: "not_a_key_set" | "bad_entry" | "duplicate_id" | "bad_public_key";
  readonly index?: number;
}

/**
 * Reads a published key set. Every key must be valid and every id unique;
 * one bad key refuses the whole set, so a typo never goes unnoticed.
 *
 * @param value - the parsed JSON
 * @returns the set, or why it was refused
 */
export async function readPublicKeySet(
  value: unknown,
): Promise<Result<PublicKeySet, KeySetRefusal>> {
  if (!isPlainObject(value) || !Array.isArray(value["keys"])) {
    return err({ reason: "not_a_key_set" });
  }
  const byId = new Map<string, { use: KeyUse; key: CryptoKey }>();
  for (const [index, entry] of value["keys"].entries()) {
    if (!isPublishedKey(entry)) {
      return err({ reason: "bad_entry", index });
    }
    if (byId.has(entry.id)) {
      return err({ reason: "duplicate_id", index });
    }
    const key = await importPublicKey(entry.publicKey);
    if (!key.ok) {
      return err({ reason: "bad_public_key", index });
    }
    byId.set(entry.id, { use: entry.use, key: key.value });
  }
  return ok({
    find: (id, use) => {
      const found = byId.get(id);
      return found?.use === use ? found.key : undefined;
    },
    ids: (use) => [...byId].filter(([, found]) => found.use === use).map(([id]) => id),
  });
}

function isPublishedKey(entry: unknown): entry is PublishedKey {
  return (
    isPlainObject(entry) &&
    typeof entry["id"] === "string" &&
    headerPatterns.keyId.test(entry["id"]) &&
    keyUses.includes(entry["use"] as KeyUse) &&
    typeof entry["publicKey"] === "string"
  );
}
