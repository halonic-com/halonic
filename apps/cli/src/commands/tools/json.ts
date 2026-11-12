// The `--json` fields of `halonic tools` (cli-output 3.10 and 1.8). Texts
// are as the server wrote them, since JSON escapes them itself, and
// fingerprints are always in full.

import type { WaitingTool } from "@halonicjs/app";

/** One approved tool in `approve`'s `approved`. */
export function approvedEntry(waiting: WaitingTool) {
  return { name: waiting.listedName, fingerprint: waiting.fingerprint };
}

/** One tool `--all` left out, in `approve`'s `leftOut`. */
export function leftOutEntry(waiting: WaitingTool) {
  return { name: waiting.listedName, why: "keeps_changing" };
}
