import { SkeletonBar } from "@halonicjs/studio-kit";
import type { RunsSource, SourcedRun } from "../api.ts";
import { loadFailureReason } from "../load-failure.ts";
import { runPageWords } from "../run-words.ts";
import { useRunLog } from "./every-step.tsx";
import { Receipt } from "./receipt.tsx";
import {
  approvalLines,
  messageLines,
  modelLines,
  readLines,
  summaryLine,
} from "./receipt-model.ts";

/** The props of `RunCardReceipt`. */
export interface RunCardReceiptProps {
  readonly source: Pick<RunsSource, "log" | "workflow" | "currency">;
  readonly run: SourcedRun;
  /** The workspace's runs, to name the workflow of a child run; none leaves a child run's id. */
  readonly runs?: readonly SourcedRun[];
  /** The time the lines are worded against; now when absent. */
  readonly now?: Date;
}

/**
 * The run page's receipt at card width (checklist part 1, 1.1; UX 3.7): the same summary line and
 * sections, read from the run's log, under the card's header. A skeleton named "Loading the run"
 * stands while the log is read, and a log that can't be read says why, in one line.
 *
 * @example
 * <RunCardReceipt source={source} run={run} />
 */
export function RunCardReceipt({ source, run, runs = [], now }: RunCardReceiptProps) {
  const read = useRunLog(source, run.summary.id, run.summary.lastSeq, run);
  const log = read.events;
  if (log === undefined) {
    if (read.failure === undefined) {
      return (
        <div role="status" className="flex flex-col gap-2">
          <span className="sr-only">{runPageWords.loadingLog}</span>
          <SkeletonBar kind="value" />
          <SkeletonBar kind="value" />
        </div>
      );
    }
    return (
      <p className="text-small text-fg-muted">
        {runPageWords.logFailed}. {loadFailureReason(read.failure)}
      </p>
    );
  }
  const { summary } = run;
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
  return (
    <Receipt
      summary={summaryLine(run, log, context)}
      approvals={approvalLines(log)}
      messages={messageLines(log)}
      reads={readLines(log)}
      models={modelLines(log, summary, context.currency)}
    />
  );
}
