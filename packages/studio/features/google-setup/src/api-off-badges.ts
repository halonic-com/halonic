import { connectionStateTable } from "@halonicjs/studio-feature-library/api";
import type { CurrentApiOff, GoogleApi } from "@halonicjs/studio-feature-runs/api";
import type { BadgeState } from "@halonicjs/studio-shell";
import { trustBadgePriority } from "@halonicjs/studio-shell";

/** The name of each API on the chip and in its tooltip. */
const apiNames: Record<GoogleApi, string> = { gmail: "Gmail", drive: "Drive" };

/** Below the sign-in badge, which sits at `trustBadgePriority - 200`: secret, sign-in, API off. */
const apiOffPriority = trustBadgePriority - 300;

/**
 * The header chip for one switched-off Google API: "Gmail API off" or "Drive API off", with the
 * tone the library gives `api-off`. It has no cause list and no Inbox row; pressing it opens the
 * newest failed run's page through `open`, where **Switch it on** is.
 *
 * @example
 * apiOffBadge(off, (hub, id) => context.openItem?.({ kind: "run", hub, id })).label; // "Gmail API off"
 */
export function apiOffBadge(
  off: CurrentApiOff,
  open: (hubId: string, runId: string, opener: HTMLElement | null) => void,
): BadgeState {
  const { tone } = connectionStateTable["api-off"];
  const where = off.project === undefined ? "your Google project" : `project ${off.project}`;
  return {
    id: `google-api-off-${off.api}`,
    label: `${apiNames[off.api]} API off`,
    tone,
    priority: apiOffPriority,
    action: "Open run",
    tooltip: `Google's ${apiNames[off.api]} API is off in ${where}.`,
    onSelect: (opener) => open(off.run.hubId, off.run.id, opener),
  };
}
