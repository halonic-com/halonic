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
 */
export function checkForEachWaits(context: CheckContext): WorkspaceIssue[] {
  const issues: WorkspaceIssue[] = [];
  for (const workflow of context.filesOf("workflow")) {
    if (context.hubFailed(workflow.hub)) {
      continue;
    }
    const waitSteps = new Map(
      context
        .filesOf("workflow", workflow.hub)
        .map((other) => [other.value.id, firstWaitStep(other.value.states)]),
    );
    for (const [id, state] of Object.entries(workflow.value.states)) {
      const runs = state.type === "foreach" ? state.workflow : undefined;
      const waitStep = runs === undefined ? undefined : waitSteps.get(runs);
      if (runs !== undefined && waitStep !== undefined) {
        const message = `For-each step "${id}" runs "${runs}" for each item, but "${runs}" has the wait step "${waitStep}", and an item's run can't wait, so the run fails there. Move the wait step after "${id}", or take it out of "${runs}".`;
        const path = ["states", id, "workflow"];
        issues.push(context.error(workflow.path, path, "foreach-child-waits", message));
      }
    }
  }
  return issues;
}

/** The id of a workflow's first wait step, in the order of its states; `undefined` when it has none. */
function firstWaitStep(states: Readonly<Record<string, WorkflowState>>): string | undefined {
  return Object.entries(states).find(([, state]) => state.type === "wait")?.[0];
}
