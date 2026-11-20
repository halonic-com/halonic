// The Runs list with no runs at all (R1): the title and the line under it.

import { EmptyState } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import type { RunnableWorkflow } from "../api.ts";
import { emptyListWords } from "../run-words.ts";
import { runCommand } from "../start-words.ts";
import { NoWorkflowSentence, type PressRun, PressRunSentence } from "./press-run-line.tsx";

/** What decides how "No runs yet" says to start one: the sample's Inbox, **Run**, or the command line. */
export interface NoRunsWays extends PressRun {
  readonly isSample: boolean;
  readonly canRun: boolean;
}

/** What {@link NoRuns} takes: the ways to start a run, the workspace's workflows and its folder. */
type NoRunsProps = NoRunsWays & {
  readonly workflows: readonly RunnableWorkflow[] | undefined;
  /** The workspace folder the command names (D1, HAL-12725). */
  readonly folder: string | undefined;
};

/**
 * No runs at all (R1), with no filters above it: there's nothing to filter. The line names a
 * workflow to run, or says there is none (HAL-10128): open it and press **Run** where its page has
 * Run (HAL-12371), else the command line. In the Acme sample it says to start one from the Inbox,
 * as Home does (HAL-12225). On a Windows folder without **Run**, with a workflow, the title stands
 * alone: there is no command whose run would show up here (D-A2, HAL-12847).
 */
export function NoRuns(props: NoRunsProps) {
  const line = noRunsLine(props);
  return (
    <EmptyState
      title={emptyListWords.noRunsTitle}
      {...(line === undefined ? {} : { description: line })}
    />
  );
}

/**
 * The line under "No runs yet": the Inbox in the sample, else where to add a workflow or which one
 * to run; `undefined` where there's a workflow but no way to start it here.
 */
function noRunsLine(props: NoRunsProps): ReactNode {
  if (props.isSample) return emptyListWords.noRunsSample;
  const command = runCommand(props.workflows, props.folder);
  if (props.canRun) {
    return (
      <PressRunLine
        workflows={props.workflows}
        command={command}
        {...(props.openWorkflow === undefined ? {} : { openWorkflow: props.openWorkflow })}
      />
    );
  }
  if (props.workflows?.length === 0) {
    return command === undefined
      ? emptyListWords.noRunsNoWorkflowNoCommand
      : emptyListWords.noRunsNoWorkflow;
  }
  if (command === undefined) return undefined;
  return (
    <>
      {emptyListWords.noRunsBody}
      <code className="font-mono text-code">{command}</code>
      {emptyListWords.noRunsBodyEnd}
    </>
  );
}

/**
 * The line where a workflow's page has **Run** (HAL-12371). It adds that command-line runs show up
 * here too, except on a Windows folder, where they don't (D-A2, HAL-12847).
 */
function PressRunLine({
  workflows,
  openWorkflow,
  command,
}: PressRun & {
  readonly workflows: readonly RunnableWorkflow[] | undefined;
  readonly command: string | undefined;
}) {
  if (workflows?.length === 0) return <NoWorkflowSentence />;
  const sentence = (
    <PressRunSentence
      workflows={workflows}
      {...(openWorkflow === undefined ? {} : { openWorkflow })}
    />
  );
  if (command === undefined) return sentence;
  return (
    <>
      {sentence} {emptyListWords.noRunsFromCommandLine}
    </>
  );
}
