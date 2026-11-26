import { shortRunId } from "@halonicjs/app";
import { markHiddenName } from "@halonicjs/std";
import { sampleAnswersWord } from "@halonicjs/studio-feature-runs/api";
import { isLate, type ListRow, movesOnMeta, StatusChip, waitingFor } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import { type InboxItem, isRunItem, type RunItem, type SetupItem } from "../inbox-items.ts";
import { approvalTitle } from "../plain/approval-text.ts";
import { doneOutcome, proposalMeta, proposalTitle } from "../plain/proposal-text.ts";
import type { ProposalItem } from "../proposal-items.ts";
import type { RunFacts, RunFactsOf } from "./run-facts.ts";

/** An item's title, as its row and its card show it. */
export function itemTitle(item: InboxItem): string {
  if (item.kind === "approval") return approvalTitle(item);
  if (item.kind === "proposal") return proposalTitle(item);
  return markHiddenName(item.title);
}

/**
 * An item's row with its run's facts, as the Inbox page and Home's Needs you both show it, so
 * the two read the same and two runs of one workflow read apart in both (a11y check H2). The title
 * wraps rather than being cut: in the 360 px list its end, such as the item a proposal changes, is
 * what tells two rows apart (HAL-15092, Noah's decision on HAL-15073). The meta line wraps onto
 * a second line, then is cut: its end, "Waiting 1 h", is what the row is for (HAL-15126). In the
 * Inbox's own 80px rows, a `plain` List, the title takes two lines at most and the meta line one,
 * keeping its wait whole (Noah's decision on HAL-20018).
 */
export function inboxRow(item: InboxItem, now: Date, runFacts: RunFactsOf | undefined): ListRow {
  const facts = item.kind === "setup" ? undefined : runFacts?.(item.runId);
  return { ...rowFor(item, now, facts), wrapTitle: true, wrapMeta: true };
}

/**
 * A row (flow-inbox 3.2), the same in the Inbox and on Home's Needs you: the card's title, then
 * since when it waits and, for a wait step with a timer, when it moves on: "Waiting 6 h · moves on
 * Mon 14:00". With the run's facts the line starts with its workflow and the run's short id, so two
 * runs of one workflow read apart (a11y check Q1), then "Sample answers" when the test model wrote
 * the run's answers, as the card's meta line says it (`inbox.wait-context`), and a wait step says
 * it is a person's: "Support reply · Sample answers · run 891b5a · a person step · Waiting 6 h". A
 * setup item has its own row.
 */
export function rowFor(item: InboxItem, now: Date, facts?: RunFacts): ListRow {
  if (item.kind === "setup") return setupRow(item);
  if (item.kind === "proposal") return proposalRow(item, now);
  const waiting = waitingFor(new Date(item.since), now);
  const movesOn =
    item.kind === "wait" && item.movesOnAt !== null
      ? ` · ${movesOnMeta(new Date(item.movesOnAt))}`
      : "";
  const context = runItemContext(item, facts);
  const row = {
    id: item.key,
    title: itemTitle(item),
    ...lineEndingInWait(context, `${waiting}${movesOn}`),
  };
  // Amber says "have a look": a day or more of waiting (the waiting time stays muted).
  return isLate(new Date(item.since), now)
    ? { ...row, trailing: <StatusChip tone="attention">Late</StatusChip> }
    : row;
}

/**
 * A row's line that ends in how long its item has waited, with the wait as the line's `metaEnd`, so
 * a one-line row cuts only what comes before it: "Support reply · run 891b5a · a pe… · Waiting 1 h"
 * (HAL-20018). With nothing before it, the wait is the whole line.
 */
export function lineEndingInWait(before: string, wait: string): Pick<ListRow, "meta" | "metaEnd"> {
  return before === "" ? { meta: wait } : { meta: before, metaEnd: ` · ${wait}` };
}

/** A row's whole line under its title, its `metaEnd` included, as the open item's header says it. */
export function wholeLine(row: ListRow): ReactNode {
  if (row.metaEnd === undefined) return row.meta;
  if (typeof row.meta === "string") return `${row.meta}${row.metaEnd}`;
  return (
    <>
      {row.meta}
      {row.metaEnd}
    </>
  );
}

/**
 * A run item's line without its wait: "Support reply · Sample answers · run 891b5a · a person
 * step", the open item's header once it no longer waits (`inbox.header-avatar`); "" without the
 * run's facts.
 */
export function runItemContext(item: RunItem, facts: RunFacts | undefined): string {
  if (facts === undefined) return "";
  // A run at a plan limit waits for its customer, not at a person's step.
  const personStep = item.kind === "wait" && item.limit === undefined;
  return `${workflowMeta(facts.workflow, facts.sample === true)} · run ${shortRunId(item.runId)}${personStep ? " · a person step" : ""}`;
}

/**
 * The run's workflow and, on Sample answers, that model's label, as the CLI prints them: "Support
 * reply · Sample answers" (`inbox.wait-context`).
 */
export function workflowMeta(workflow: string, sample: boolean): string {
  return sample ? `${workflow} · ${sampleAnswersWord}` : workflow;
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
 * A proposal's row (HAL-11945 Q1 and Q2): its title, how and when its run ended, and a neutral
 * **Proposal** chip. Nothing has stopped, so it is never amber and never late. Once nothing is left
 * to decide, the row is muted and says what the proposal came to in place of when its run ended:
 * "Accepted 2 of 3 changes" (Q10).
 */
function proposalRow(item: ProposalItem, now: Date): ListRow {
  return {
    id: item.key,
    title: itemTitle(item),
    meta: item.decided === true ? doneOutcome(item.files) : proposalMeta(item, now),
    trailing: <StatusChip tone="neutral">Proposal</StatusChip>,
    ...(item.decided === true ? { muted: true } : {}),
  };
}

/**
 * "8 waiting · 3 new · 1 late" after the heading, read "Needs you, 8 waiting, 3 new, 1 late".
 * "Waiting" is the user's turn, so violet; "new" is the blue of the rows' unread dot
 * (`inbox.read-marks`); "late" is amber with a dot. No count when it is 0, never "0 new".
 */
export function countDetail(waiting: number, late = 0, fresh = 0): { detail?: ReactNode } {
  if (waiting === 0) return {};
  return {
    detail: (
      <>
        <span className="text-warning">{waiting} waiting</span>
        {fresh === 0 ? null : (
          <>
            <span aria-hidden="true"> · </span>
            <span className="sr-only">, </span>
            <span className="text-primary">{fresh} new</span>
          </>
        )}
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
  return items.filter((item) => isRunItem(item) && isLate(new Date(item.since), now)).length;
}
