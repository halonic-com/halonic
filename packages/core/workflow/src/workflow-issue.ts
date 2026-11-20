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
  | "timer-with-event"
  | "parallel-without-branches"
  | "foreach-without-items"
  | "foreach-without-work"
  | "task-without-agent"
  | "wait-without-events"
  | "wait-with-signal"
  | "no-final"
  | "unguarded-shadow"
  | "unknown-gets"
  | "unknown-template-name"
  | "not-a-choice"
  | "unread-start-field";

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
  /** The options of each agent whose reply is a choice, by agent id; when given, `when` values are checked. */
  choices?: Readonly<Record<string, readonly string[]>>;
  /**
   * The input fields the workflow is started with besides `start.field`, such
   * as its tests' input; the `input.<name>` steps read are
   * checked against them.
   */
  inputFields?: readonly string[];
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
