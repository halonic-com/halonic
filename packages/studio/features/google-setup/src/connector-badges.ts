import {
  type ConnectionState,
  connectionStateOf,
  connectionStateTable,
} from "@halonicjs/studio-feature-library/api";
import type { BadgeState } from "@halonicjs/studio-shell";
import { trustBadgePriority } from "@halonicjs/studio-shell";
import type { GoogleSetupAccount } from "./api.ts";
import { connectorFacts } from "./connector-facts.ts";

/**
 * Where each state sits among the header badges: below the trust badge, and a secret before a
 * sign-in, as the library names the one to fix first.
 */
const priorities: Partial<Record<ConnectionState, number>> = {
  "needs-new-secret": trustBadgePriority - 100,
  "needs-sign-in": trustBadgePriority - 200,
};

/**
 * The header badge for one account, or `undefined` when its connector needs nothing from you.
 * The label and tone are the library's, so the badge and the connector status view agree. The
 * badge's button reopens the account's setup item through `open`; the address is in the tooltip
 * only, so two accounts with the same state stay apart.
 *
 * @example
 * connectorBadge(account, (ref) => inbox.openSetup("google", ref))?.label; // "Needs sign-in"
 */
export function connectorBadge(
  account: GoogleSetupAccount,
  open: (accountRef: string, opener: HTMLElement | null) => void,
): BadgeState | undefined {
  const state = connectionStateOf(connectorFacts(account));
  const priority = priorities[state];
  if (priority === undefined) return undefined;
  const { label, tone } = connectionStateTable[state];
  const { accountRef } = account.record;
  return {
    id: `google-connector-${accountRef}`,
    label,
    tone,
    priority,
    action: "Fix",
    tooltip: `${label} for ${account.email}. Fix it in the Inbox.`,
    onSelect: (opener) => open(accountRef, opener),
  };
}
