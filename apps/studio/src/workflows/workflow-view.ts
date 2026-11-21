import type { Workflow } from "@halonicjs/format";
import type {
  WorkflowArrow,
  WorkflowStep,
  WorkflowStepProgram,
} from "@halonicjs/studio-feature-workflows/api";

/**
 * The workflow's steps as the page draws and edits them, in the file's order. `programOf` gives the
 * program a step's agent runs in, when it needs the sandbox.
 */
export function stepsOf(
  workflow: Workflow,
  programOf: (stepId: string) => WorkflowStepProgram | undefined,
): WorkflowStep[] {
  return Object.entries(workflow.states).map(([stepId, state]) => ({
    id: stepId,
    type: state.type,
    title: stepTitle(state.description),
    agent: state.agent,
    description: state.description,
    prompt: typeof state.input === "string" ? state.input : undefined,
    promptIsData: state.input !== undefined && typeof state.input !== "string",
    output: state.output,
    program: programOf(stepId),
  }));
}

/** Every step's arrows, step by step in the file's order, each step's in the order its file lists them. */
export function arrowsOf(workflow: Workflow): WorkflowArrow[] {
  return Object.entries(workflow.states).flatMap(([from, state]) =>
    state.on.map((arrow) => ({
      from,
      to: arrow.to,
      label: arrow.label,
      event: arrow.event === "done" ? undefined : arrow.event,
      after: arrow.after,
      condition: arrow.when,
    })),
  );
}

/**
 * A step's own words for it: the first line of its description, as the run page and the CLI name
 * it. `undefined` when there is none, or when the line still holds a `{{ }}` placeholder that only
 * a run can fill in.
 */
function stepTitle(description: string | undefined): string | undefined {
  const line = description?.split("\n")[0]?.trim();
  return line === undefined || line === "" || line.includes("{{") ? undefined : line;
}
