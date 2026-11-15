import { shortRunId } from "@halonicjs/app";
import { summarize } from "@halonicjs/events";
import { EmptyState, SkeletonBar } from "@halonicjs/studio-kit";
import type { RunsSource, SourcedRun } from "../api.ts";
import { loadFailureReason } from "../load-failure.ts";
import { runPageWords } from "../run-words.ts";
import { EveryStep, type RunLogRead } from "./every-step.tsx";
import { everyStep } from "./every-step-model.ts";
import { Receipt } from "./receipt.tsx";
import {
  approvalLines,
  messageLines,
  modelLines,
  readLines,
  summaryLine,
} from "./receipt-model.ts";
import { DamagedLogBanner, PageBanner } from "./run-page.tsx";

/** The props of `RunCardReceipt`. */
export interface RunCardReceiptProps {
  readonly source: Pick<RunsSource, "workflow" | "currency">;
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
}

/**
 * The run page's receipt at card width (checklist part 1, 1.1 and 1.12; UX 3.7): the banner when
 * the run needs attention, the summary line and sections, then Every step with **Show the run
 * log**, made of the run page's own pieces. A skeleton named "Loading run 01jd8q" stands while the
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
}: RunCardReceiptProps) {
  const log = read.events;
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
        description={loadFailureReason(read.failure)}
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
    currency: source.currency(),
    now: now ?? new Date(),
  };
  const entries = everyStep(log, summarize(log) ?? summary, context.workflow, context.now);
  return (
    <>
      <PageBanner
        run={run}
        context={context}
        log={log}
        entries={entries}
        reviewInInbox={reviewInInbox}
        openRun={openRun}
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
