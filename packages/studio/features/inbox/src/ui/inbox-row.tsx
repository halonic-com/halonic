import { type ListRow, StatusChip } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import type { InboxItem, SetupItem } from "../inbox-items.ts";
import { approvalTitle } from "../plain/approval-text.ts";
import { markedName } from "../plain/hidden-characters.ts";
import { isLate, movesOnMeta, waitingFor } from "../plain/waiting-time.ts";

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
  const row = { id: item.key, title: itemTitle(item), meta: `${waiting}${movesOn}` };
  // Amber says "have a look": a day or more of waiting (the waiting time stays muted).
  return isLate(new Date(item.since), now)
    ? { ...row, trailing: <StatusChip tone="attention">Late</StatusChip> }
    : row;
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

/**
 * "2 waiting · 1 late" after the heading, read "Needs you, 2 waiting, 1 late". "Waiting" is the
 * user's turn, so violet; "late" is amber with a dot. No count when it is 0, never "0 late".
 */
export function countDetail(waiting: number, late = 0): { detail?: ReactNode } {
  if (waiting === 0) return {};
  return {
    detail: (
      <>
        <span className="text-warning">{waiting} waiting</span>
        {late === 0 ? null : (
          <>
            <span aria-hidden="true"> · </span>
            <span className="sr-only">, </span>
            <span className="text-attention">
              <span
                aria-hidden="true"
                className="me-1 inline-block size-1.5 rounded-full bg-attention-fill"
              />
              {late} late
            </span>
          </>
        )}
      </>
    ),
  };
}

/** How many of the items have waited a day or more. */
export function lateCount(items: readonly InboxItem[], now: Date): number {
  return items.filter((item) => item.kind !== "setup" && isLate(new Date(item.since), now)).length;
}
