// The run page's header and its one banner, worked out from the run's
// summary (checklist part 1, 1.5, 1.6 and 1.8; mc 15.2 revision 94). The
// page only draws what these return.

import { runWait, shortRunId } from "@halonicjs/app";
import type { RunSummary } from "@halonicjs/events";
import type { RunWorkflow, SourcedRun } from "../api.ts";
import { currentStepName, type RunChip, runRow } from "../list/run-row.ts";
import { lineSeparator, runPageWords } from "../run-words.ts";
import { clockTime, dayWords, dueWords, tookWords } from "../time-words.ts";

/** The top of the run page. */
export interface RunHeader {
  /** "Run 01jd8q", the page's `h1` and the tab's name. */
  readonly title: string;
  /** "Run · Support reply". */
  readonly kindLabel: string;
  readonly chip: RunChip;
  /** "today 10:40 · took 2 min 10 s", or "today 10:40 · updates live" while the run is live. */
  readonly line: string;
}

/** What the run page shows where a banner goes; `undefined` when the run needs no attention. */
export type RunBanner =
  | {
      /** The kit Callout: `warning` when the run needs you, `info` for a wait that isn't yours. */
      readonly kind: "callout";
      readonly tone: "info" | "warning" | "danger";
      /** The hidden title that names the banner's region. */
      readonly name: string;
      /** A title the banner shows, for the budget stop only. */
      readonly title?: string;
      readonly lines: readonly string[];
      readonly action?: BannerAction;
    }
  /** A cancelled run's plain note, without a Callout's colour: nothing needs fixing. */
  | { readonly kind: "note"; readonly text: string };

/** The banner's one button. */
export type BannerAction =
  | { readonly kind: "review-in-inbox" }
  | { readonly kind: "open-run"; readonly runId: string; readonly label: string };

/** What the page needs besides the run. */
export interface RunPageContext {
  readonly workflow: RunWorkflow | undefined;
  /** The name of what another run of the workspace ran, for a child run; `undefined` when it isn't loaded. */
  readonly workflowOfRun: (runId: string) => string | undefined;
  readonly currency: string;
  readonly now: Date;
}

/**
 * The header of one run.
 *
 * @example
 * runHeader(run, context);
 * // { title: "Run 01jd8q", kindLabel: "Run · Support reply", line: "today 10:40 · updates live", … }
 */
export function runHeader(run: SourcedRun, context: RunPageContext): RunHeader {
  const row = runRow(run, context);
  const { summary } = run;
  const started = startedWords(new Date(summary.startedAt), context.now);
  const end =
    summary.endedAt === null
      ? runPageWords.updatesLive
      : runPageWords.took(tookWords(Date.parse(summary.endedAt) - Date.parse(summary.startedAt)));
  return {
    title: runPageWords.title(row.shortId),
    kindLabel: runPageWords.kindLabel(row.workflow),
    chip: row.chip,
    line: [started, end].join(lineSeparator),
  };
}

/**
 * The banner of one run: what it waits for while it waits, why it failed or
 * stopped once it has, nothing while it runs or after it finished.
 */
export function runBanner(run: SourcedRun, context: RunPageContext): RunBanner | undefined {
  const { summary } = run;
  const workflow = context.workflow?.name ?? summary.workflowId;
  const step = currentStepName(summary, context.workflow);
  if (summary.status === "failed") {
    return endedBanner(summary, workflow, step);
  }
  const wait = runWait(summary);
  switch (wait.kind) {
    case "approvals":
      return needsYou(
        wait.count === 1 ? runPageWords.approval(step) : runPageWords.approvals(wait.count),
      );
    case "step":
      return needsYou(
        wait.title === null
          ? runPageWords.waitStepNoDescription(step)
          : runPageWords.waitStep(wait.title),
      );
    case "child-run":
      return childRunBanner(wait.runId, context);
    case "timer":
      return waiting(runPageWords.timer(dueWords(new Date(wait.at), context.now)));
    case "none":
      return undefined;
  }
}

/** A failed run: the budget stop, the cancelled note, or R24's general banner. */
function endedBanner(summary: RunSummary, workflow: string, step: string): RunBanner {
  const message = summary.error?.trim() ?? "";
  if (summary.reason === "cancelled") {
    return {
      kind: "note",
      text:
        summary.statesVisited.length === 0
          ? runPageWords.cancelledBeforeStart(workflow)
          : runPageWords.cancelledIn(workflow, step),
    };
  }
  if (summary.reason === "budget") {
    return {
      kind: "callout",
      tone: "warning",
      name: runPageWords.budgetName,
      title: runPageWords.budgetTitle,
      lines: [runPageWords.budget(workflow, step, message), runPageWords.budgetChecks],
    };
  }
  return {
    kind: "callout",
    tone: "danger",
    name: runPageWords.failedName,
    lines: [runPageWords.failed(workflow, step, message)],
  };
}

function needsYou(text: string): RunBanner {
  return {
    kind: "callout",
    tone: "warning",
    name: runPageWords.waitingForYouName,
    lines: [text],
    action: { kind: "review-in-inbox" },
  };
}

function waiting(text: string, action?: BannerAction): RunBanner {
  return {
    kind: "callout",
    tone: "info",
    name: runPageWords.waitingName,
    lines: [text],
    ...(action === undefined ? {} : { action }),
  };
}

/** "Waiting for child run 7k2m9p (Verify)." with Open run; without the name until the child is loaded. */
function childRunBanner(runId: string, context: RunPageContext): RunBanner {
  const shortId = shortRunId(runId);
  const name = context.workflowOfRun(runId);
  const text =
    name === undefined ? runPageWords.childRunOnly(shortId) : runPageWords.childRun(shortId, name);
  return waiting(text, { kind: "open-run", runId, label: runPageWords.openRun(shortId) });
}

/** When the run started: "today 10:40", "yesterday 10:40", or "Fri 6 Nov 10:40". */
function startedWords(started: Date, now: Date): string {
  const day = dayWords(started, now);
  const time = clockTime(started);
  if (day === "Today") {
    return runPageWords.startedToday(time);
  }
  if (day === "Yesterday") {
    return runPageWords.startedYesterday(time);
  }
  return `${day} ${time}`;
}
