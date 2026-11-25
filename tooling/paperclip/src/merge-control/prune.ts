import { logLine, type PassContext } from "./context.ts";

/**
 * Stale state goes (board CI sweep, HAL-17912 item F): culprit holds and
 * cooldowns of pull requests no longer open, or open on another head, are
 * dropped at the start of each pass. They come from the snapshot's one list
 * of open pull requests; when that list couldn't be read, nothing is dropped,
 * so a failed read never lifts a real hold.
 */
export function pruneState(context: PassContext): void {
  const { open } = context.snapshot;
  if (open === null) {
    logLine(context, "prune", "PRUNE_SKIPPED (open pull requests not read)");
    return;
  }
  const heads = new Map(open.map((pull) => [String(pull.number), pull.head]));
  const { state } = context;
  const heldGone = Object.keys(state.failedHeads).filter(
    (key) => heads.get(key) !== state.failedHeads[key],
  );
  const cooldownGone = Object.keys(state.cooldown).filter(
    (key) => heads.get(key) !== state.cooldown[key]?.head,
  );
  for (const key of heldGone) {
    delete state.failedHeads[key];
  }
  // A hold's run goes with its hold, and so does one whose hold was lifted by hand.
  for (const key of Object.keys(state.heldRuns)) {
    if (state.failedHeads[key] !== state.heldRuns[key]?.head) {
      delete state.heldRuns[key];
    }
  }
  for (const key of cooldownGone) {
    delete state.cooldown[key];
  }
  if (heldGone.length + cooldownGone.length > 0) {
    const list = (keys: readonly string[]) => keys.map((key) => `#${key}`).join(",") || "-";
    logLine(
      context,
      "prune",
      `PRUNED failedHeads=${list(heldGone)} cooldown=${list(cooldownGone)}`,
    );
  }
}
