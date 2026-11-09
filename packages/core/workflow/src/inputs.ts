import type { Workflow } from "@halonicjs/format";
import { getPath, render, renderText } from "./template.ts";

/** A state's `input`: one template, or a map of templates. */
export type StateInput = string | Record<string, unknown> | undefined;

/**
 * The prompt an agent state sends: its `input` text rendered, a map of
 * templates rendered and written as JSON, or, with no `input`, the run's
 * input as JSON.
 *
 * @example
 * promptFor("Reply to {{input.from}}", scope, runInput); // "Reply to support"
 * promptFor(undefined, scope, { n: 3 }); // '{"n":3}'
 */
export function promptFor(
  input: StateInput,
  scope: unknown,
  runInput: Record<string, unknown>,
): string {
  if (input === undefined) {
    return JSON.stringify(runInput);
  }
  if (typeof input === "string") {
    return renderText(input, scope);
  }
  return JSON.stringify(renderMap(input, scope));
}

/**
 * The input a `workflow` state gives its child run. A map of templates is
 * rendered value by value, so a value that is one placeholder keeps its type.
 * A text becomes `{ message: <text> }`. No `input` gives an empty input.
 */
export function childInput(input: StateInput, scope: unknown): Record<string, unknown> {
  if (input === undefined) {
    return {};
  }
  if (typeof input === "string") {
    return { message: renderText(input, scope) };
  }
  return renderMap(input, scope);
}

function renderMap(map: Record<string, unknown>, scope: unknown): Record<string, unknown> {
  return Object.fromEntries(Object.entries(map).map(([key, value]) => [key, render(value, scope)]));
}

/**
 * The context keys a state can read, sorted: the workflow's initial context,
 * and the `output` of every state that can run before it. Those are found by
 * following transitions back from the state.
 */
export function contextBefore(workflow: Workflow, stateId: string): string[] {
  const keys = new Set(Object.keys(workflow.context));
  for (const earlier of statesBefore(workflow, stateId)) {
    const output = workflow.states[earlier]?.output;
    if (output) {
      keys.add(output);
    }
  }
  return [...keys].sort();
}

/** Every state with a path of transitions to `stateId`. The state itself counts only on a loop. */
function statesBefore(workflow: Workflow, stateId: string): Set<string> {
  const comesFrom = new Map<string, string[]>();
  for (const [from, state] of Object.entries(workflow.states)) {
    for (const transition of state.on) {
      comesFrom.set(transition.to, [...(comesFrom.get(transition.to) ?? []), from]);
    }
  }
  const seen = new Set<string>();
  const queue = [...(comesFrom.get(stateId) ?? [])];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    if (seen.has(next)) {
      continue;
    }
    seen.add(next);
    queue.push(...(comesFrom.get(next) ?? []));
  }
  return seen;
}

/**
 * The prompt with a step's picked data (`gets`) after it: a `## Data`
 * section with each path as a heading, then its value, text as it is and
 * anything else as indented JSON. A value that isn't there reads `(not set)`.
 * Without `gets`, the prompt is returned unchanged.
 */
export function withGets(
  prompt: string,
  gets: readonly string[] | undefined,
  scope: unknown,
): string {
  if (!gets?.length) {
    return prompt;
  }
  const sections = gets.map((path) => `### ${path}\n${pickedText(getPath(scope, path))}`);
  return `${prompt.trim()}\n\n## Data\n\n${sections.join("\n\n")}`;
}

function pickedText(value: unknown): string {
  if (value === undefined) {
    return "(not set)";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}
