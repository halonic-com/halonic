import type { UpdateState } from "./updater-status.ts";

/** What a progress bar needs: how far, as a fraction of 1, or `null` when the total isn't known. */
export function downloadFraction(state: UpdateState): number | null {
  if (state.kind !== "downloading" || state.total === null || state.total <= 0) {
    return null;
  }
  return Math.min(1, state.done / state.total);
}
