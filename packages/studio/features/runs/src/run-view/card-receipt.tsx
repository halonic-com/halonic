import { shortRunId } from "@halonicjs/app";
import { summarize } from "@halonicjs/events";
import { EmptyState, SkeletonBar } from "@halonicjs/studio-kit";
import { type EngineWords, engineWordsOf } from "@halonicjs/studio-shell";
import type { RunStartHost, RunsSource, SourcedRun } from "../api.ts";
import { FailureReason } from "../load-failure.tsx";
import { runPageWords } from "../run-words.ts";
import { EveryStep, type RunLogRead } from "./every-step.tsx";
import { everyStep } from "./every-step-model.ts";
import { PageBanner } from "./page-banner.tsx";
import { Receipt } from "./receipt.tsx";
import {
  approvalLines,
  messageLines,
  modelLines,
  readLines,
  summaryLine,
} from "./receipt-model.ts";
import { useRunAgain } from "./run-again.ts";
import { RunAgainFailed } from "./run-again-failed.tsx";
import { DamagedLogBanner } from "./run-page.tsx";

/** The props of `RunCardReceipt`. */
export interface RunCardReceiptProps {
  readonly source: Pick<
    RunsSource,
    "workflow" | "currency" | "providerKind" | "providerName" | "agentName"
  >;
  readonly run: SourcedRun;
  /** What `useRunLog` read of the run's log; the card reads it too, to know when to show its chip. */
  readonly read: RunLogRead;
  /** The workspace's runs, to name the workflow of a child run; none leaves a child run's id. */
  readonly runs?: readonly SourcedRun[];
  /** The time the lines are worded against; now when absent. */
  readonly now?: Date;
  /** Opens the Inbox, for Review in Inbox; without it the button isn't there. */
  readonly reviewInInbox?: (() => void) | undefined;
  /** Opens another run's page, for a child run; without it the button isn't there. */
  readonly openRun?: ((runId: string) => void) | undefined;
  /** Opens the run's page, for See the step and a step's row: the card has no step panel. */
  readonly onOpenStep?: (() => void) | undefined;
  /** What the card calls the engine when it isn't answering, for this window's host; the desktop app's by default. */
  readonly engine?: EngineWords;
  /**
   * Starts a run, for **Run again** on a failed banner that has no button of its own; without it,
   * or with nowhere to open the new run, the button isn't there.
   */
  readonly runStart?: RunStartHost | undefined;
  /** Opens the run **Run again** started; `openRun` when absent. */
  readonly openStartedRun?: ((runId: string) => void) | undefined;
  /** Opens the workspace page at Models, for **Open Models** on a failed banner; without it the button isn't there. */
  readonly openModels?: (() => void) | undefined;
  /** Opens the workspace page at its Budget block, for **Change budget** on a budget banner; without it the button isn't there. */
  readonly openBudget?: (() => void) | undefined;
  /** Says a line to a screen reader, for why **Run again** didn't start; absent in tests that don't listen. */
  readonly announce?: ((line: string) => void) | undefined;
}

/**
 * The run page's receipt at card width (checklist part 1, 1.1 and 1.12; UX 3.7): the banner when
 * the run needs attention, the summary line and sections, then Every step with **Show the run
 * log**, made of the run page's own pieces. A failed banner offers **Run again** and **Open
 * Models** as on the run page, where the card is given `runStart` and `openModels`. A skeleton named "Loading run 01jd8q" stands while the
 * log is read, and a log that can't be read says "Couldn't load run 01jd8q", why, and **Try again**.
 *
 * @example
 * <RunCardReceipt source={source} run={run} read={read} />
 */
export function RunCardReceipt({
  source,
  run,
  read,
  runs = [],
  now,
  reviewInInbox,
  openRun,
  onOpenStep,
  engine = engineWordsOf({}),
  runStart,
  openStartedRun,
  openModels,
  openBudget,
  announce,
}: RunCardReceiptProps) {
  const log = read.events;
  const runAgain = useRunAgain(runStart, run, log, openStartedRun ?? openRun, engine, announce);
  const { summary } = run;
  if (log === undefined) {
    const shortId = shortRunId(summary.id);
    if (read.failure === undefined) {
      return (
        <div role="status" className="flex flex-col gap-2">
          <span className="sr-only">{runPageWords.loading(shortId)}</span>
          <SkeletonBar kind="value" />
          <SkeletonBar kind="value" />
        </div>
      );
    }
    return (
      <EmptyState
        tone="error"
        align="start"
        title={runPageWords.loadFailed(shortId)}
        description={
          <FailureReason
            what={runPageWords.loadFailed(shortId)}
            error={read.failure}
            engine={engine}
          />
        }
        action={{ label: "Try again", onClick: read.retry }}
      />
    );
  }
  const context = {
    workflow: source.workflow(summary.hubId, summary.workflowId),
    workflowOfRun: (runId: string) => {
      const other = runs.find((candidate) => candidate.summary.id === runId)?.summary;
      if (other === undefined) return undefined;
      return source.workflow(other.hubId, other.workflowId)?.name ?? other.workflowId;
    },
    providerKind: (id: string) => source.providerKind(id),
    ...(source.providerName === undefined
      ? {}
      : { providerName: (id: string) => source.providerName?.(id) }),
    ...(source.agentName === undefined
      ? {}
      : { agentName: (id: string) => source.agentName?.(id) }),
    currency: source.currency(),
    now: now ?? new Date(),
  };
  const entries = everyStep(log, summarize(log) ?? summary, context.workflow, context.now);
  return (
    <>
      <RunAgainFailed runAgain={runAgain} engine={engine} />
      <PageBanner
        run={run}
        context={context}
        log={log}
        entries={entries}
        reviewInInbox={reviewInInbox}
        openRun={openRun}
        runAgain={runAgain}
        openModels={openModels}
        openBudget={openBudget}
        onSeeStep={() => onOpenStep?.()}
      />
      <DamagedLogBanner line={read.damagedLine} />
      <Receipt
        summary={summaryLine(run, log, context)}
        approvals={approvalLines(log)}
        messages={messageLines(log)}
        reads={readLines(log)}
        models={modelLines(log, summary, context.currency)}
      />
      <EveryStep
        log={log}
        entries={entries}
        openEntry={undefined}
        onOpenEntry={() => onOpenStep?.()}
      />
    </>
  );
}
