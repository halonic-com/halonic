import { useEffect, useRef } from "react";
import type { ProposalDecisions } from "../proposal-decisions.ts";
import type { ProposalItem } from "../proposal-items.ts";

/**
 * Settles the run proposals a window left decided but never settled, because it closed before
 * their last toast went (`InboxState.leftOver`, HAL-10916), so they move to **Done** (Q10) rather
 * than stay out of both Needs you and Done. Each is asked once; one that fails is asked again with
 * the next load that still lists it.
 *
 * @param onSettled after each, so the Inbox reads its lists again
 */
export function useSettleLeftOver(
  leftOver: readonly ProposalItem[],
  decisions: ProposalDecisions | undefined,
  onSettled: () => void,
): void {
  const asked = useRef(new Set<string>());
  const latestOnSettled = useRef(onSettled);
  latestOnSettled.current = onSettled;
  useEffect(() => {
    if (decisions === undefined) return;
    for (const { runId } of leftOver) {
      if (asked.current.has(runId)) continue;
      asked.current.add(runId);
      void decisions.settle(runId).then(
        () => latestOnSettled.current(),
        (error: unknown) => {
          asked.current.delete(runId);
          console.error("Couldn't settle the run proposal", error);
        },
      );
    }
  }, [leftOver, decisions]);
}
