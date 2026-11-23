// The engine role's words for where trust stands, as the engine server's
// trust gate answers them. The same sentences `halonic serve` uses: none
// names a command, so they read the same in Studio.
import type { TrustGateSentences } from "@halonicjs/adapter-workspace-engine-node";

/** The engine role's sentence for each trust state, safe to show: no file, path or fingerprint. */
export const engineTrustSentences: TrustGateSentences = {
  trusted: () => "This workspace is trusted on this computer.",
  "not-needed": () => "This workspace needs no trust: it reaches only the test model.",
  new: () => "This workspace isn't trusted on this computer yet.",
  changed: () => "This workspace changed since it was trusted on this computer.",
  unreadable: () => "The trust record on this computer can't be read.",
  refused: () => "A file in this workspace names something that can't be trusted.",
};
