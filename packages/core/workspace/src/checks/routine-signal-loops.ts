import type { WorkflowState } from "@halonicjs/format";
import type { WorkspaceIssue } from "../load-workspace.ts";
import type { CheckContext } from "./check-context.ts";

type States = Readonly<Record<string, WorkflowState>>;

/**
 * A routine on a signal whose workflow sends that same signal, reported as a
 * warning at `trigger.signal.name` (requirement `workspace.routine-signal-loops`):
 * each run would start the routine again, until the loop guard refuses
 * (`routines.signal-loop`). A warning, not an error, because the signal's
 * data may differ from run to run; a routine with a `when` is left out, since
 * that is how a user stops the loop. The check looks at the workflow's own
 * steps and one level into the workflows its `workflow` and `foreach` steps
 * run, in the same hub, as their signals start routines too.
 */
export function checkRoutineSignalLoops(context: CheckContext): WorkspaceIssue[] {
  const issues: WorkspaceIssue[] = [];
  for (const routine of context.filesOf("routine")) {
    const { trigger, run } = routine.value;
    if (context.hubFailed(routine.hub) || !("signal" in trigger) || !("workflow" in run)) {
      continue;
    }
    if (trigger.signal.when !== undefined) {
      continue;
    }
    const hub = routine.hub ?? run.hub ?? null;
    const hubStates = new Map(
      context.filesOf("workflow", hub).map((file) => [file.value.id, file.value.states]),
    );
    if (!sentSignals(run.workflow, hubStates).has(trigger.signal.name)) {
      continue;
    }
    const message = `Routine "${routine.value.id}": workflow "${run.workflow}" sends signal "${trigger.signal.name}", which starts this routine again. Add a "when" that stops the loop.`;
    const path = ["trigger", "signal", "name"];
    issues.push(context.issue("warning", routine.path, path, "routine-starts-itself", message));
  }
  return issues;
}

/** The names of the signals a run of `workflowId` sends: its own steps', and its child workflows'. */
function sentSignals(workflowId: string, hubStates: ReadonlyMap<string, States>): Set<string> {
  const states = Object.values(hubStates.get(workflowId) ?? {});
  const children = states.flatMap((state) => childWorkflow(state) ?? []);
  const childStates = children.flatMap((id) => Object.values(hubStates.get(id) ?? {}));
  return new Set([...states, ...childStates].flatMap((state) => state.signal?.name ?? []));
}

/** The workflow a `workflow` or `foreach` step runs as a child run. */
function childWorkflow(state: WorkflowState): string | undefined {
  return state.type === "workflow" || state.type === "foreach" ? state.workflow : undefined;
}
