import type { FileProblem } from "@halonicjs/format";

/** An `error` stops the workflow from running; a `warning` only points something out. */
export type Severity = "error" | "warning";

/** What a {@link WorkflowIssue} is about. */
export type WorkflowIssueCode =
  | "missing-initial"
  | "unknown-target"
  | "unreachable"
  | "dead-end"
  | "final-has-transitions"
  | "unknown-agent"
  | "unknown-workflow"
  | "workflow-without-target"
  | "self-subflow"
  | "timer-outside-wait"
  | "parallel-without-branches"
  | "foreach-without-items"
  | "foreach-without-work"
  | "task-without-agent"
  | "wait-without-events"
  | "no-final"
  | "unguarded-shadow"
  | "unknown-gets";

/** The keys and list indexes to a value in a workflow file; `[]` for the whole file. */
export type WorkflowPath = FileProblem["path"];

/**
 * One problem the static checks found: the key path in the workflow file of
 * what it is about, and the state it is in when it is in one.
 */
export interface WorkflowIssue {
  severity: Severity;
  code: WorkflowIssueCode;
  message: string;
  /** Such as `["states", "start", "on", 0, "to"]` for a transition to an unknown state. */
  path: WorkflowPath;
  state?: string;
}

/** What the caller knows beyond the workflow itself. A list left out is not checked. */
export interface ValidateOptions {
  /** The agent ids that exist; when given, the agents states use are checked. */
  agents?: readonly string[];
  /** The workflow ids of the hub; when given, the workflows states run are checked. */
  workflows?: readonly string[];
}

/** A {@link WorkflowIssue}, with `state` only when it is in one. */
export function issue(
  severity: Severity,
  code: WorkflowIssueCode,
  message: string,
  path: WorkflowPath,
  state?: string,
): WorkflowIssue {
  const found = { severity, code, message, path };
  return state === undefined ? found : { ...found, state };
}

/** The key path of a state, or of a key in it: `stateKey("start", "on", 0)`. */
export function stateKey(id: string, ...keys: (string | number)[]): WorkflowPath {
  return ["states", id, ...keys];
}
