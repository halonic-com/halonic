// The run page's header and its one banner, worked out from the run's
// summary (checklist part 1, 1.5, 1.6 and 1.8; mc 15.2 revision 94). The
// page only draws what these return.

import { moneyAmount, runWait, shortRunId } from "@halonicjs/app";
import type { PendingApproval, RunSummary } from "@halonicjs/events";
import { escapeHidden } from "@halonicjs/std";
import type { ProviderKind, RunWorkflow, SourcedRun } from "../api.ts";
import { currentStepName, type RunChip, runRow } from "../list/run-row.ts";
import { lineSeparator, runPageWords } from "../run-words.ts";
import { clockTime, dayAndMonth, dayWords, dueWords, tookWords } from "../time-words.ts";
import { type BudgetStop, budgetResetsOn, budgetStopOf } from "./budget-stop.ts";

/** The top of the run page. */
export interface RunHeader {
  /** "Run 01jd8q", the page's `h1` and the tab's name. */
  readonly title: string;
  /** "Run · Support reply". */
  readonly kindLabel: string;
  readonly chip: RunChip;
  /** "today 10:40 · took 2 min 10 s", or "today 10:40 · updates live" while the run is live. */
  readonly line: string;
  /** The catch-up sentence, for a run that started late (mc 15.2 Catch-up); under `line`. */
  readonly catchUpLine?: string;
}

/** What the run page shows where a banner goes; `undefined` when the run needs no attention. */
export type RunBanner =
  | {
      /**
       * The kit Callout: `warning` when the run needs you, `attention` when it stopped at its
       * budget, `info` for a wait that isn't yours.
       */
      readonly kind: "callout";
      readonly tone: "info" | "warning" | "attention" | "danger";
      /** The hidden title that names the banner's region. */
      readonly name: string;
      /** A title the banner shows, for the budget stop only. */
      readonly title?: string;
      readonly lines: readonly string[];
      readonly action?: BannerAction;
      /** The buttons that mend the cause, before **Run again**; the page leaves out one it can't do. */
      readonly fixes?: readonly BannerFix[];
      /**
       * What **Copy details** puts on the clipboard, after **Run again**: the engine's own message,
       * which never shows on screen (microcopy 22 F13). Absent: no Copy details.
       */
      readonly details?: string;
    }
  /** A cancelled run's plain note, without a Callout's colour: nothing needs fixing. */
  | { readonly kind: "note"; readonly text: string };

/** The banner's one button. */
export type BannerAction =
  | { readonly kind: "review-in-inbox" }
  | { readonly kind: "open-run"; readonly runId: string; readonly label: string };

/**
 * A button that mends a failed run's cause: copy the command that does it, go to Models, or open
 * a page outside Studio (`address` is already checked: see `googleConsoleAddress`).
 */
export type BannerFix =
  | { readonly kind: "copy-command"; readonly command: string }
  | { readonly kind: "open-models" }
  | {
      readonly kind: "open-external";
      readonly label: string;
      readonly address: string;
      readonly opens: string;
    };

/** What the page needs besides the run. */
export interface RunPageContext {
  readonly workflow: RunWorkflow | undefined;
  /** The name of what another run of the workspace ran, for a child run; `undefined` when it isn't loaded. */
  readonly workflowOfRun: (runId: string) => string | undefined;
  /** Whether a model provider runs on this computer or elsewhere; `undefined` when it isn't in the workspace. */
  readonly providerKind: (providerId: string) => ProviderKind | undefined;
  /** An agent's name as its file says; `undefined` when the workspace has no such agent. */
  readonly agentName?: (agentId: string) => string | undefined;
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
  // The header doesn't say what started the run yet, so it needs no routine.
  const row = runRow(run, { ...context, routine: undefined });
  const { summary } = run;
  const started = startedWords(new Date(summary.startedAt), context.now);
  const end =
    summary.endedAt === null
      ? runPageWords.updatesLive
      : runPageWords.took(tookWords(Date.parse(summary.endedAt) - Date.parse(summary.startedAt)));
  const catchUp = catchUpLine(summary, context.now);
  return {
    title: runPageWords.title(row.shortId),
    kindLabel: runPageWords.kindLabel(row.workflow),
    chip: row.chip,
    line: [started, end].join(lineSeparator),
    ...(catchUp === undefined ? {} : { catchUpLine: catchUp }),
  };
}

/**
 * "Started at 08:12 to catch up. It was planned for 07:30 while Halonic was closed or asleep."
 * for a routine run with `trigger.catchUp`; each time is a clock time today, or the date and the
 * clock time on another day. The skipped count comes last, when there is one.
 */
function catchUpLine(summary: RunSummary, now: Date): string | undefined {
  const { trigger } = summary;
  if (trigger?.catchUp === undefined) {
    return undefined;
  }
  const { skipped, countIsMinimum } = trigger.catchUp;
  return [
    runPageWords.catchUpStarted(whenWords(new Date(summary.startedAt), now)),
    runPageWords.catchUpPlanned(whenWords(new Date(trigger.at), now)),
    skipped > 0 ? runPageWords.catchUpSkipped(skipped, countIsMinimum === true) : undefined,
  ]
    .filter((sentence) => sentence !== undefined)
    .join(" ");
}

/** The clock time for today; the day ("12 Nov") with it for another day. */
function whenWords(moment: Date, now: Date): { day?: string; time: string } {
  const time = clockTime(moment);
  return moment.toDateString() === now.toDateString()
    ? { time }
    : { day: dayAndMonth(moment), time };
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
      return needsYou(approvalText(wait.oldest, wait.count, context));
    case "step":
      return needsYou(
        wait.title === null
          ? runPageWords.waitStepNoDescription(step)
          : runPageWords.waitStep(escapeHidden(wait.title)),
      );
    case "child-run":
      return childRunBanner(wait.runId, context);
    case "timer":
      return waiting(runPageWords.timer(dueWords(new Date(wait.at), context.now)));
    case "none":
      return undefined;
  }
}

/** The approval banner's sentence, built from the oldest approval (mc 15.2); the Inbox card has the rest. */
function approvalText(oldest: PendingApproval, count: number, context: RunPageContext): string {
  const asker = oldest.subagent ?? oldest.agent;
  const what = runPageWords.approvalAsk(
    escapeHidden(context.agentName?.(asker) ?? asker),
    oldest.tool,
  );
  return count === 1
    ? runPageWords.approval(what, oldest.tool === "gmail_send")
    : runPageWords.approvals(count, what);
}

/**
 * A failed run: the budget stop, the cancelled note, or R24's general banner. The engine's
 * message goes only into Copy details (F13).
 */
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
    const stop = budgetStopOf(summary);
    const line =
      stop === undefined ? runPageWords.budget(workflow, step) : budgetLine(stop, workflow, step);
    return {
      kind: "callout",
      tone: "attention",
      name: runPageWords.budgetName,
      title: runPageWords.budgetTitle,
      lines: [
        line,
        ...(stop === undefined ? [] : [budgetFix(stop, summary)]),
        runPageWords.budgetChecks,
      ],
      details: [line, `Run ${summary.id}`, message].filter((part) => part !== "").join("\n"),
    };
  }
  const line = runPageWords.failed(workflow, step);
  return {
    kind: "callout",
    tone: "danger",
    name: runPageWords.failedName,
    lines: [line],
    details: [line, `Run ${summary.id}`, message].filter((part) => part !== "").join("\n"),
  };
}

/** The CLI's first line for a budget stop, in the budget's currency. */
function budgetLine(stop: BudgetStop, workflow: string, step: string): string {
  const budget = moneyAmount(stop.budget, stop.currency);
  return stop.per === "run"
    ? runPageWords.budgetPerRun(workflow, step, budget, moneyAmount(stop.spent, stop.currency))
    : runPageWords.budgetPerMonth(workflow, step, budget);
}

/** The CLI's second line: the key to raise, and for a monthly budget when it resets. */
function budgetFix(stop: BudgetStop, summary: RunSummary): string {
  return stop.per === "run"
    ? runPageWords.budgetRaisePerRun
    : runPageWords.budgetRaiseMonthly(budgetResetsOn(summary.endedAt ?? summary.startedAt));
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
export function startedWords(started: Date, now: Date): string {
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
