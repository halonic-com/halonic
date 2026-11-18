import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { WorkspacePageService } from "../api.ts";
import { CHANGED_BADGE, NOTHING_TO_TRUST_LINE } from "./trust-section-text.ts";
import type { WorkspaceTrustControl } from "./workspace-trust-control.ts";

/**
 * Whether the workspace holds nothing to trust (HAL-10131): its record may still read
 * `not-trusted` or `changed`, but there is nothing to review, so no **Review** and no **Open Trust**.
 */
export function holdsNothingToTrust(
  status: WorkspaceTrustControl["status"],
  needsNoTrust: boolean | undefined,
): boolean {
  return (status === "not-trusted" || status === "changed") && needsNoTrust === true;
}

/** The phone's one line for a status, in the words of the header badge; `undefined` before the first answer. */
function summaryOf(trust: WorkspaceTrustControl): string | undefined {
  const { status } = trust;
  if (holdsNothingToTrust(status, trust.needsNoTrust))
    return NOTHING_TO_TRUST_LINE.replace(/\.$/, "");
  switch (status) {
    case "trusted":
      return "Trusted";
    case "changed":
      return CHANGED_BADGE;
    case "not-trusted":
    case "list-unreadable":
      return "Not trusted yet";
    case "failed":
      return "Couldn't load workspace settings";
    case "unknown":
      return undefined;
  }
}

/**
 * Settings › Trust's line in the phone's settings list (HAL-12859): "Trusted", "Not trusted yet",
 * "Nothing to trust here" and the like. Before the first answer it waits for one; without a
 * folder to trust it has none.
 */
export function trustSummary(context: WorkspaceContext): string | undefined | Promise<string> {
  const trust = context.services.get(WorkspacePageService).trust;
  if (trust === undefined) return undefined;
  const now = summaryOf(trust);
  if (now !== undefined) return now;
  return new Promise((resolve) => {
    const stop = trust.subscribe(() => {
      const line = summaryOf(trust);
      if (line === undefined) return;
      stop();
      resolve(line);
    });
  });
}
