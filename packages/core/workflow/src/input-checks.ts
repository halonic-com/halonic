import type { Workflow, WorkflowState } from "@halonicjs/format";
import { nearName } from "./near-name.ts";
import { templatePlaces } from "./template-checks.ts";
import {
  issue,
  stateKey,
  type ValidateOptions,
  type WorkflowIssue,
  type WorkflowPath,
} from "./workflow-issue.ts";

/** One place a step reads a field of the run's input by name. */
export interface InputRead {
  /** The field: `mail` for `input.mail` and `input.mail.from`. */
  readonly field: string;
  /** As written: `input.mail` in `gets`, `{{input.mail}}` in a text. */
  readonly written: string;
  /** Where in the workflow file, such as `["states", "read", "gets", 0]`. */
  readonly path: WorkflowPath;
}

/**
 * The input fields a state reads by name: each `input.<name>` it picks in
 * `gets`, and each `{{input.<name>}}` in its templates and conditions (the
 * places `unknown-template-name` checks for `{{context.<key>}}`).
 *
 * @example
 * inputReads("read", { gets: ["input.mail"], ... }); // [{ field: "mail", written: "input.mail", ... }]
 */
export function inputReads(id: string, state: WorkflowState): InputRead[] {
  const picked = (state.gets ?? []).flatMap((path, index) => {
    const field = inputField(path);
    return field === null ? [] : [{ field, written: path, path: stateKey(id, "gets", index) }];
  });
  const templated = templatePlaces(state).flatMap((place) =>
    place.paths.flatMap((placeholder) => {
      const field = inputField(placeholder);
      const path = stateKey(id, ...place.keys);
      return field === null ? [] : [{ field, written: `{{${placeholder}}}`, path }];
    }),
  );
  return [...picked, ...templated];
}

/**
 * Whether a state hands its agent the whole run input: an agent step, or a
 * branch, with no prompt, method or `gets` of its own sends the input as
 * JSON, and so does a `{{input}}` placeholder.
 */
export function readsWholeInput(state: WorkflowState): boolean {
  const bare = (step: {
    agent?: string | undefined;
    input?: unknown;
    method?: string | undefined;
  }) =>
    step.agent !== undefined &&
    step.input === undefined &&
    step.method === undefined &&
    !state.gets?.length;
  const sendsInput = state.type === "task" && bare(state);
  const branchSendsInput = Object.values(state.branches ?? {}).some(bare);
  const whole = templatePlaces(state).some((place) => place.paths.includes("input"));
  return sendsInput || branchSendsInput || whole;
}

/** The fields a run's input lacks that the workflow's first step reads, and that step. */
export interface MissingStartFields {
  /** The first line of the step's description, or its id. */
  readonly step: string;
  readonly missing: readonly string[];
}

/**
 * The fields the workflow's first step reads by name (`gets: [input.mail]`
 * or `{{input.mail}}`) that `given`, the input's keys, lacks: the agent
 * would get `(not set)` for them. `null` when nothing is missing, or when
 * the first step sends its agent the whole input.
 *
 * @example
 * missingStartFields(announce, []); // { step: "Write the note", missing: ["topic"] }
 */
export function missingStartFields(
  workflow: Workflow,
  given: readonly string[],
): MissingStartFields | null {
  const first = workflow.states[workflow.initial];
  if (first === undefined || readsWholeInput(first)) {
    return null;
  }
  const read = unique(inputReads(workflow.initial, first).map(({ field }) => field));
  const missing = read.filter((field) => !given.includes(field));
  if (missing.length === 0) {
    return null;
  }
  return { step: first.description?.split("\n")[0]?.trim() || workflow.initial, missing };
}

/**
 * Input fields a step reads that the workflow's input doesn't have, and a
 * `start.field` that no step reads. The input's fields are `start.field` and
 * the ones in `options.inputFields` (its tests); a workflow that
 * names none isn't checked. `start.field` counts only when a step reads it,
 * so a wrong one gets one message, not one per step.
 */
export function inputIssues(workflow: Workflow, options: ValidateOptions): WorkflowIssue[] {
  const states = Object.entries(workflow.states);
  if (states.some(([, state]) => readsWholeInput(state))) {
    return [];
  }
  const reads = states.flatMap(([id, state]) =>
    inputReads(id, state).map((read) => ({ ...read, state: id })),
  );
  const readFields = unique(reads.map((read) => read.field));
  const start = workflow.start?.field;
  const startIsRead = start !== undefined && readFields.includes(start);
  const known = unique([...(options.inputFields ?? []), ...(startIsRead ? [start] : [])]);
  const issues: WorkflowIssue[] = [];
  if (start !== undefined && !startIsRead) {
    issues.push(unreadStartField(start, readFields));
  }
  if (known.length === 0) {
    return issues;
  }
  for (const read of reads.filter(({ field }) => !known.includes(field))) {
    const templated = read.written.startsWith("{{");
    const message = `"${read.state}" ${templated ? "uses" : "gets"} ${read.written}, but the workflow's input has no field ${read.field}. ${fieldHint(read.field, known)}`;
    const code = templated ? "unknown-template-name" : "unknown-gets";
    issues.push(issue("error", code, message, read.path, read.state));
  }
  return issues;
}

function unreadStartField(start: string, readFields: readonly string[]): WorkflowIssue {
  const hint =
    readFields.length === 0
      ? `Add input.${start} to the gets of the step that needs it.`
      : `The steps read ${listed(readFields.map((field) => `input.${field}`))}: use one of those names as field, or add input.${start} to a step's gets.`;
  const message = `start.field is ${start}, but no step reads input.${start}. ${hint}`;
  return issue("error", "unread-start-field", message, ["start", "field"]);
}

/** "Did you mean input.mail?" for a close name, or else the fields there are. */
function fieldHint(field: string, known: readonly string[]): string {
  const near = nearName(field, known);
  if (near !== undefined) {
    return `Did you mean input.${near}?`;
  }
  return `It has only ${listed(known)}: read one of those, or add ${field} to the input of the workflow's tests.`;
}

/** `"mail"` for `"input.mail.from"`; `null` for a path outside the input, or the whole input. */
function inputField(path: string): string | null {
  return path.startsWith("input.") ? (path.split(".")[1] ?? null) : null;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/** `a`, `a and b`, `a, b and c`. */
function listed(values: readonly string[]): string {
  return values.length < 2
    ? values.join("")
    : `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`;
}
