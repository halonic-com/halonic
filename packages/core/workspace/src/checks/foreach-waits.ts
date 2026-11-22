import type { WorkflowState } from "@halonicjs/format";
import type { WorkspaceIssue } from "../load-workspace.ts";
import type { CheckContext } from "./check-context.ts";

/**
 * A for-each step whose workflow has a wait step, reported at the step's
 * `workflow` (requirement `workspace.foreach-child-waits`). An item's run
 * can't wait: the engine fails the run when one does and cancels the other
 * items' runs, so the check says it before any run starts. Only the
 * workflows of the step's own hub count, as for the step's other names; a
 * workflow the hub doesn't have is the workflow checks' unknown workflow.
 * A wait step in a workflow the item's workflow runs with a `workflow`
 * step, at any depth, makes the item's run wait too
 * (`workspace.foreach-nested-waits`).
 */
export function checkForEachWaits(context: CheckContext): WorkspaceIssue[] {
  const issues: WorkspaceIssue[] = [];
  for (const workflow of context.filesOf("workflow")) {
    if (context.hubFailed(workflow.hub)) {
      continue;
    }
    const hubStates = new Map(
      context
        .filesOf("workflow", workflow.hub)
        .map((other) => [other.value.id, other.value.states]),
    );
    for (const [id, state] of Object.entries(workflow.value.states)) {
      const runs = state.type === "foreach" ? state.workflow : undefined;
      const waits = runs === undefined ? undefined : waitIn(runs, hubStates, new Set());
      if (waits !== undefined) {
        const path = ["states", id, "workflow"];
        const message = waitsMessage(id, waits);
        issues.push(context.error(workflow.path, path, "foreach-child-waits", message));
      }
    }
  }
  return issues;
}

/** Where an item's run waits: the workflows from the item's own to the one with the wait step. */
interface ItemWait {
  /** The item's workflow first, then each workflow a `workflow` step of the one before runs. */
  readonly through: readonly [string, ...string[]];
  readonly waitStep: string;
}

/**
 * The wait a run of `workflowId` makes: its own first wait step, or else
 * the first wait of a workflow one of its `workflow` steps runs, in the
 * order of its states. `seen` stops a loop of workflows that run each other.
 */
function waitIn(
  workflowId: string,
  hubStates: ReadonlyMap<string, Readonly<Record<string, WorkflowState>>>,
  seen: Set<string>,
): ItemWait | undefined {
  const states = hubStates.get(workflowId);
  if (states === undefined || seen.has(workflowId)) {
    return undefined;
  }
  seen.add(workflowId);
  const waitStep = firstWaitStep(states);
  if (waitStep !== undefined) {
    return { through: [workflowId], waitStep };
  }
  for (const state of Object.values(states)) {
    const runs = state.type === "workflow" ? state.workflow : undefined;
    const inner = runs === undefined ? undefined : waitIn(runs, hubStates, seen);
    if (inner !== undefined) {
      return { through: [workflowId, ...inner.through], waitStep: inner.waitStep };
    }
  }
  return undefined;
}

/**
 * The error's message: the item's workflow and its wait step; for a wait
 * further down, each workflow on the way, and the fix names the one that
 * has the wait step.
 */
function waitsMessage(stepId: string, { through, waitStep }: ItemWait): string {
  const [runs, ...further] = through;
  const hasWaitStep = `has the wait step "${waitStep}"`;
  // "review-one" runs "sign-off", which runs "ask", which has the wait step "approve"
  const waits =
    further.length === 0
      ? `"${runs}" ${hasWaitStep}`
      : `"${runs}" runs ${further.map((id) => `"${id}"`).join(", which runs ")}, which ${hasWaitStep}`;
  const last = further.at(-1) ?? runs;
  return `For-each step "${stepId}" runs "${runs}" for each item, but ${waits}, and an item's run can't wait, so the run fails there. Move the wait step after "${stepId}", or take it out of "${last}".`;
}

/** The id of a workflow's first wait step, in the order of its states; `undefined` when it has none. */
function firstWaitStep(states: Readonly<Record<string, WorkflowState>>): string | undefined {
  return Object.entries(states).find(([, state]) => state.type === "wait")?.[0];
}
