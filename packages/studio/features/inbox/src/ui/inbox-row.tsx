import { markHiddenName } from "@halonicjs/std";
import { type ListRow, StatusChip } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import type { InboxItem, SetupItem } from "../inbox-items.ts";
import { approvalTitle } from "../plain/approval-text.ts";
import { isLate, movesOnMeta, waitingFor } from "../plain/waiting-time.ts";
import type { RunFacts } from "./run-facts.ts";

/** An item's title, as its row and its card show it. */
export function itemTitle(item: InboxItem): string {
  return item.kind === "approval" ? approvalTitle(item) : markHiddenName(item.title);
}

/**
 * A row (flow-inbox 3.2), the same in the Inbox and on Home's Needs you: the card's title, then
 * since when it waits and, for a wait step with a timer, when it moves on: "Waiting 6 h · moves on
 * Mon 14:00". With the run's facts the line starts with its workflow, and a wait step says it is a
 * person's: "Support reply · a person step · Waiting 6 h". A setup item has its own row.
 */
export function rowFor(item: InboxItem, now: Date, facts?: RunFacts): ListRow {
  if (item.kind === "setup") return setupRow(item);
  const waiting = waitingFor(new Date(item.since), now);
  const movesOn =
    item.kind === "wait" && item.movesOnAt !== null
      ? ` · ${movesOnMeta(new Date(item.movesOnAt))}`
      : "";
  const what =
    facts === undefined
      ? ""
      : `${facts.workflow}${item.kind === "wait" ? " · a person step" : ""} · `;
  const row = { id: item.key, title: itemTitle(item), meta: `${what}${waiting}${movesOn}` };
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
    meta: markHiddenName(item.progress),
    trailing:
      item.fixed === true ? (
        <StatusChip tone="success">Fixed</StatusChip>
      ) : (
        <StatusChip tone="neutral">Setup</StatusChip>
      ),
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
                className="me-1 inline-block size-1.5 rounded-full bg-attention-fill forced-color-adjust-none forced-colors:bg-[CanvasText]"
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
