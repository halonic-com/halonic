import { inlineLinkClasses } from "@halonicjs/studio-kit";
import type { RunnableWorkflow } from "../api.ts";
import { pressRunWords } from "../start-words.ts";

/** What the empty lines need to point to a workflow's **Run** (HAL-12371). */
export interface PressRun {
  /** Opens a workflow's page in the active tab; without it the workflow's name is plain text. */
  readonly openWorkflow?: (workflow: RunnableWorkflow) => void;
}

/**
 * "To start one, open *Weekly report* in Workflows and press **Run**.", where a workflow's page
 * has **Run** (HAL-12371). The first workflow's name is a link that opens it; while the names
 * aren't known the sentence says "a workflow" instead.
 *
 * @example
 * <PressRunSentence workflows={state.workflows} openWorkflow={openWorkflow} />
 */
export function PressRunSentence({
  workflows,
  openWorkflow,
}: PressRun & { readonly workflows: readonly RunnableWorkflow[] | undefined }) {
  const [first] = workflows ?? [];
  return (
    <>
      {pressRunWords.open}
      {first === undefined ? (
        pressRunWords.aWorkflow
      ) : (
        <WorkflowName workflow={first} openWorkflow={openWorkflow} />
      )}
      {pressRunWords.inWorkflows}
      <RunWord />
      {pressRunWords.end}
    </>
  );
}

/** "This workspace has no workflows yet. Add one in Workflows, then press **Run** on it." */
export function NoWorkflowSentence() {
  const [before, after] = pressRunWords.noWorkflow;
  return (
    <>
      {before}
      <RunWord />
      {after}
    </>
  );
}

/** The workflow's name: a link that opens its page, or plain text where nothing can open it. */
function WorkflowName({
  workflow,
  openWorkflow,
}: {
  readonly workflow: RunnableWorkflow;
  readonly openWorkflow: PressRun["openWorkflow"] | undefined;
}) {
  if (openWorkflow === undefined) return workflow.name;
  return (
    <button type="button" className={inlineLinkClasses} onClick={() => openWorkflow(workflow)}>
      {workflow.name}
    </button>
  );
}

/** **Run**, the button's word, in the weight of a button's label. */
function RunWord() {
  return <strong className="font-medium">{pressRunWords.run}</strong>;
}
