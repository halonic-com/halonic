import { type ListRow, StatusChip } from "@halonicjs/studio-kit";
import type { InboxItem, SetupItem } from "../inbox-items.ts";
import { approvalTitle } from "../plain/approval-text.ts";
import { markedName } from "../plain/hidden-characters.ts";
import { movesOnMeta, waitingFor } from "../plain/waiting-time.ts";

/** An item's title, as its row and its card show it. */
export function itemTitle(item: InboxItem): string {
  return item.kind === "approval" ? approvalTitle(item) : markedName(item.title);
}

/**
 * A row (flow-inbox 3.2), the same in the Inbox and on Home's Needs you: the card's title, then
 * since when it waits and, for a wait step with a timer, when it moves on: "Waiting 6 h · moves on
 * Mon 14:00". A setup item has its own row.
 */
export function rowFor(item: InboxItem, now: Date): ListRow {
  if (item.kind === "setup") return setupRow(item);
  const waiting = waitingFor(new Date(item.since), now);
  const movesOn =
    item.kind === "wait" && item.movesOnAt !== null
      ? ` · ${movesOnMeta(new Date(item.movesOnAt))}`
      : "";
  return { id: item.key, title: itemTitle(item), meta: `${waiting}${movesOn}` };
}

/**
 * A setup item's row (UX checklist section 1): its title, its progress line and a **Setup** chip.
 * It has no Approve or Reject: you set an account up in its item, you don't answer it.
 */
function setupRow(item: SetupItem): ListRow {
  return {
    id: item.key,
    title: itemTitle(item),
    meta: markedName(item.progress),
    trailing: <StatusChip tone="neutral">Setup</StatusChip>,
  };
}

/** "2 waiting" after the heading, read "Needs you, 2 waiting"; no count when nothing waits. */
export function countDetail(waiting: number): { detail?: string } {
  return waiting === 0 ? {} : { detail: `${waiting} waiting` };
}
