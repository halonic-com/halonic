import { type RefObject, useEffect, useState } from "react";
import type { InboxItem } from "../inbox-items.ts";
import { itemTitle } from "./inbox-row.tsx";

/** What {@link useSentRequestCard} gives the Inbox page. */
export interface SentRequestCard {
  /** Tells the hook that the request which started this run was just sent. */
  readonly watch: (runId: string) => void;
}

/**
 * The one card that opens by itself (flow-inbox 3.3, requirement `inbox.request-card`): when the
 * card for a request you just sent arrives, it opens and takes focus only if focus is still in
 * the request form. Otherwise only its row appears and the announcer says "New in Needs you:
 * *title*", so a slow model that answers minutes later never takes your place.
 *
 * @param sheetOpen Whether a phone's request sheet is open; it counts as the request form.
 * @param announce Says a line where a screen reader hears it; without it nothing is said.
 */
export function useSentRequestCard(options: {
  readonly items: readonly InboxItem[];
  readonly openItem: (item: InboxItem) => void;
  readonly sheetOpen?: RefObject<boolean> | undefined;
  readonly announce?: ((line: string) => void) | undefined;
}): SentRequestCard {
  const { items, openItem, sheetOpen, announce } = options;
  const [sent, setSent] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const arrived = items.find((item) => item.kind !== "setup" && sent.has(item.runId));
    if (arrived === undefined || arrived.kind === "setup") return;
    setSent((was) => new Set([...was].filter((runId) => runId !== arrived.runId)));
    if (sheetOpen?.current || focusIsInRequestForm()) openItem(arrived);
    else announce?.(`New in Needs you: ${itemTitle(arrived)}`);
  }, [items, sent, openItem, sheetOpen, announce]);
  return { watch: (runId) => setSent((was) => new Set(was).add(runId)) };
}

function focusIsInRequestForm(): boolean {
  return document.activeElement?.closest("form[data-request-form]") != null;
}
