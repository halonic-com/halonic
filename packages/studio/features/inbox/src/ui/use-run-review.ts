import type { RunsList } from "@halonicjs/studio-feature-runs/api";
import { useEffect } from "react";
import type { Inbox } from "../inbox.ts";
import { oldestOfRun } from "../inbox-items.ts";

/**
 * Opens what a run waits on when its **Review in Inbox** asked for it (`RunsList.reviewInInbox`):
 * the item it has waited on longest, now and on each later ask. With nothing of the run waiting
 * any more, the Inbox opens as it would anyway.
 */
export function useRunReview(inbox: Inbox, list: RunsList | undefined): void {
  useEffect(() => {
    if (list === undefined) return;
    const take = () => {
      const runId = list.takeReview();
      if (runId === undefined) return;
      const item = oldestOfRun(inbox.state.items, runId);
      if (item !== undefined) inbox.requestOpen(item.key);
    };
    take();
    return list.subscribe(take);
  }, [inbox, list]);
}
