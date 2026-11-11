import { contentDigest, type Sha256 } from "@halonicjs/std";
import type { DigestWatch } from "./digest-watch.ts";
import type { OwnChange } from "./known-files.ts";

/**
 * Runs one of the store's own changes to `path`, which leaves `content`
 * there (`null` for a remove), so none of `watches` reports it: each is told
 * before `apply` starts and after it is over.
 *
 * `apply` gives whether it changed the file. `false` means it found the file
 * changed from outside and left it alone, so the watches still report that
 * change. When `apply` throws, the change may have landed or not, so the
 * watches read the file back; the error goes on to the caller.
 */
export async function runOwnChange(
  watches: ReadonlySet<DigestWatch>,
  path: string,
  content: string | null,
  digest: Sha256,
  apply: () => Promise<boolean>,
): Promise<boolean> {
  // The watches open now: one opened later reads the workspace after the change starts.
  const told = [...watches];
  if (told.length > 0) {
    const change: OwnChange = content === null ? "absent" : await contentDigest(content, digest);
    for (const watch of told) {
      watch.beginOwnChange(path, change);
    }
  }
  let outcome: "applied" | "left-alone" | "failed" = "failed";
  try {
    outcome = (await apply()) ? "applied" : "left-alone";
  } finally {
    for (const watch of told) {
      await (outcome === "left-alone"
        ? watch.dropOwnChange(path)
        : watch.endOwnChange(path, outcome === "applied"));
    }
  }
  return outcome === "applied";
}
