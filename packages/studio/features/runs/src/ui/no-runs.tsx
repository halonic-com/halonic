import { EmptyState } from "@halonicjs/studio-kit";
import type { RunnableWorkflow } from "../api.ts";
import { emptyListWords } from "../run-words.ts";
import { runCommand } from "../start-words.ts";
import { NoWorkflowSentence, type PressRun, PressRunSentence } from "./press-run-line.tsx";

/** What decides how "No runs yet" says to start one: the sample's Inbox, **Run**, or the command line. */
export interface NoRunsWays extends PressRun {
  readonly isSample: boolean;
  readonly canRun: boolean;
}

/**
 * No runs at all (R1), with no filters above it: there's nothing to filter. The line names a
 * workflow to run, or says there is none (HAL-10128): open it and press **Run** where its page has
 * Run (HAL-12371), else the command line. In the Acme sample it says to start one from the Inbox,
 * as Home does (HAL-12225).
 */
export function NoRuns(
  props: NoRunsWays & { readonly workflows: readonly RunnableWorkflow[] | undefined },
) {
  return <EmptyState title={emptyListWords.noRunsTitle} description={<NoRunsLine {...props} />} />;
}

/** The line under "No runs yet": the Inbox in the sample, else where to add a workflow or which one to run. */
function NoRunsLine({
  workflows,
  isSample,
  canRun,
  openWorkflow,
}: NoRunsWays & { readonly workflows: readonly RunnableWorkflow[] | undefined }) {
  if (isSample) return emptyListWords.noRunsSample;
  if (canRun) {
    if (workflows?.length === 0) return <NoWorkflowSentence />;
    return (
      <>
        <PressRunSentence
          workflows={workflows}
          {...(openWorkflow === undefined ? {} : { openWorkflow })}
        />{" "}
        {emptyListWords.noRunsFromCommandLine}
      </>
    );
  }
  if (workflows?.length === 0) return emptyListWords.noRunsNoWorkflow;
  return (
    <>
      {emptyListWords.noRunsBody}
      <code className="font-mono text-code">{runCommand(workflows)}</code>
      {emptyListWords.noRunsBodyEnd}
    </>
  );
}
