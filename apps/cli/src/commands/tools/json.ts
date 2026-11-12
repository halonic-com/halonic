// The `--json` fields of `halonic tools` (cli-output 3.10 and 1.8). Texts
// are as the server wrote them, since JSON escapes them itself, and
// fingerprints are always in full.

import type { ListedToolReview, ReviewedTool, WaitingTool } from "@halonicjs/app";
import type { JsonFields } from "../../command.ts";

/**
 * `review`'s fields: the tools that are on, the waiting ones with what
 * changed, and the refused ones.
 *
 * @example
 * reviewDocument(review);
 * // { source: "notes-mcp", on: ["send"], waiting: [{ name: "lookup", state: "changed", … }], refused: [ … ] }
 */
export function reviewDocument(review: ListedToolReview): JsonFields {
  return {
    source: review.source,
    on: review.on,
    waiting: [...review.toReview, ...review.keepsChanging].map(waitingEntry),
    refused: review.refused.map((refused) => ({
      name: refused.name,
      refused: "tool",
      reason: refused.reason,
    })),
  };
}

function waitingEntry(reviewed: ReviewedTool) {
  const { waiting } = reviewed;
  return {
    name: waiting.listedName,
    state: reviewed.state,
    fingerprint: waiting.fingerprint,
    keepsChanging: waiting.keepsChanging,
    serverChanged: waiting.serverChanged,
    changes: reviewed.changes.map((change) => ({
      path: change.path,
      before: change.before,
      after: change.after,
      hidden: change.hidden,
    })),
  };
}

/** One approved tool in `approve`'s `approved`. */
export function approvedEntry(waiting: WaitingTool) {
  return { name: waiting.listedName, fingerprint: waiting.fingerprint };
}

/** One tool `--all` left out, in `approve`'s `leftOut`. */
export function leftOutEntry(waiting: WaitingTool) {
  return { name: waiting.listedName, why: "keeps_changing" };
}
