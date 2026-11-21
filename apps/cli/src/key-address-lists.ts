// The stored keys' lists of addresses, read for the trust check, so it can
// say before trust is given that a provider's key isn't allowed to go where
// the provider sends it (HAL-15346). Only names and addresses are read,
// never a key's value.

import type { TrustCheck } from "@halonicjs/app";
import type { KeyOrigins } from "@halonicjs/ports";
import type { ProviderTrustContent } from "@halonicjs/workspace";
import { type KeyAddressLists, providerKeyName } from "./output/trust-check-rows.ts";

/**
 * The list of each key the check's providers name, for the keys that have
 * one. A key whose list can't be read is left out: the check then says
 * nothing about it, and a run with it fails with the model check's own error.
 *
 * @param keyOrigins - the profile's lists; left out, no list is read
 */
export async function keyAddressLists(
  check: TrustCheck,
  keyOrigins: KeyOrigins | undefined,
): Promise<KeyAddressLists> {
  const lists = new Map<string, readonly string[]>();
  if (keyOrigins === undefined) {
    return lists;
  }
  const names = new Set(checkedProviders(check).map(providerKeyName));
  for (const name of names) {
    if (name === undefined) continue;
    const allowed = await keyOrigins.allowedOrigins(name).catch(() => undefined);
    if (allowed !== undefined) {
      lists.set(name, allowed);
    }
  }
  return lists;
}

/** The providers the check shows: every one of a new workspace, or the new and changed ones of a changed one. */
function checkedProviders(check: TrustCheck): readonly ProviderTrustContent[] {
  switch (check.status) {
    case "new":
    case "unreadable":
      return check.content.providers ?? [];
    case "changed":
      return [
        ...check.changes.providers.added,
        ...check.changes.providers.changed.map((row) => row.after),
      ];
    default:
      return [];
  }
}
