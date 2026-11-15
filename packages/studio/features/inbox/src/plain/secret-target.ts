import type { InboxItem, SetupItem } from "../inbox-items.ts";

/** Where **Go to the secret field** goes: an account's setup item, or the Library for a connector to add. */
export type SecretTarget =
  | { readonly kind: "setup"; readonly provider: string; readonly account: string }
  | { readonly kind: "connectors" };

function isSetupOf(provider: string, item: InboxItem): item is SetupItem {
  return item.kind === "setup" && item.provider === provider;
}

/**
 * Where a client secret pasted in the wrong place belongs. One account opens its item; with
 * several, the first one that still needs a secret, else the first (items come most recently
 * changed first); with none, an account is still to be added in the Library (UX checklist U13).
 *
 * @example
 * secretTarget("google", inbox.state.items); // { kind: "setup", provider: "google", account }
 */
export function secretTarget(provider: string, items: readonly InboxItem[]): SecretTarget {
  const setups = items.filter((item): item is SetupItem => isSetupOf(provider, item));
  const chosen = setups.find((item) => item.needsSecret === true) ?? setups[0];
  if (chosen === undefined) return { kind: "connectors" };
  return { kind: "setup", provider: chosen.provider, account: chosen.account };
}
