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

/** One problem the static checks found, with the state it is in when it is in one. */
export interface WorkflowIssue {
  severity: Severity;
  code: WorkflowIssueCode;
  message: string;
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
  state?: string,
): WorkflowIssue {
  return state === undefined ? { severity, code, message } : { severity, code, message, state };
}
