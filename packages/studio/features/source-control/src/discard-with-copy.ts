import type { ChangesSource, KeptFile } from "./api.ts";
import type { DiscardOutcome } from "./changes-list-state.ts";

/**
 * Keeps a copy of `thrown`, then runs the discard. Nothing is discarded when the copy can't be
 * kept, unless `withoutCopy` says to go on without it. `undo` is what the toast's Undo runs.
 */
export async function discardWithCopy(
  source: ChangesSource,
  thrown: readonly KeptFile[],
  run: () => Promise<string | undefined>,
  undo: () => Promise<string | undefined>,
  options: { readonly withoutCopy?: boolean } = {},
): Promise<DiscardOutcome> {
  let kept = true;
  if (thrown.length > 0) {
    try {
      await source.keepCopy(thrown);
    } catch {
      if (options.withoutCopy !== true) return { kind: "noCopy" };
      kept = false;
    }
  }
  const reason = await run();
  if (reason !== undefined) return { kind: "failed", reason };
  return kept ? { kind: "undone", undo } : { kind: "discarded" };
}
