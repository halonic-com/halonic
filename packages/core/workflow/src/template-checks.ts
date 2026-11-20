import type { Guard, WorkflowState } from "@halonicjs/format";
import { contextBefore, contextWrittenBy } from "./inputs.ts";
import { nearName } from "./near-name.ts";
import type { StateCheck } from "./state-checks.ts";
import { placeholderPaths } from "./template.ts";
import { issue, stateKey, type WorkflowIssue } from "./workflow-issue.ts";

// The checks of the `{{context.<key>}}` names in a state's templates and
// conditions (C337 C10–C11, HAL-14268). A misspelled name renders as empty
// text and a condition with it never holds, so the run takes the wrong
// branch or shows an empty card without saying why.

/** A key of a state whose value is a template or a condition, and the paths it reads. */
export interface TemplatePlace {
  readonly keys: readonly (string | number)[];
  readonly paths: readonly string[];
  /** A transition's `when`: it is checked after the state wrote its own keys. */
  readonly condition: boolean;
}

/** The keys of a state that are rendered as templates or checked as conditions. */
export function templatePlaces(state: WorkflowState): TemplatePlace[] {
  const template = (keys: (string | number)[], value: unknown): TemplatePlace[] =>
    value === undefined ? [] : [{ keys, paths: placeholderPaths(value), condition: false }];
  const branches = Object.entries(state.branches ?? {}).flatMap(([name, branch]) => [
    ...template(["branches", name, "input"], branch.input),
    ...template(["branches", name, "with"], branch.with),
  ]);
  const conditions = state.on.flatMap(({ when }, index) =>
    when === undefined
      ? []
      : [{ keys: ["on", index, "when"], paths: conditionPaths(when), condition: true }],
  );
  return [
    ...template(["input"], state.input),
    ...template(["description"], state.description),
    ...template(["with"], state.with),
    ...template(["items"], state.items),
    ...branches,
    ...conditions,
  ];
}

/**
 * A `{{context.<key>}}` in a template or a condition must name a key of the
 * initial context or one a state that runs earlier writes, like a picked
 * `context.<key>` (`unknown-gets`). A condition can also read what its own
 * state wrote.
 */
export const unknownTemplateNames: StateCheck = ({ workflow, id, state }) => {
  const places = templatePlaces(state);
  if (places.length === 0) {
    return [];
  }
  const before = contextBefore(workflow, id);
  const after = [...new Set([...before, ...contextWrittenBy(state)])].sort();
  return places.flatMap((place) => {
    const known = place.condition ? after : before;
    const unknown = new Set(
      place.paths
        .map((path) => contextKey(path))
        .filter((key): key is string => key !== null && !known.includes(key)),
    );
    return [...unknown].map((key) => {
      const message = `"${id}" uses {{context.${key}}}, but no earlier step writes context.${key}. ${namesHint(key, known)}`;
      return issue("error", "unknown-template-name", message, stateKey(id, ...place.keys), id);
    });
  });
};

/** What to write instead of an unknown key: the near one, or the ones there are. */
function namesHint(key: string, known: readonly string[]): string {
  const near = nearName(key, known);
  if (near !== undefined) {
    return `Did you mean context.${near}?`;
  }
  if (known.length === 0) {
    return "Write it in an earlier step first, with output.";
  }
  return `Use one an earlier step writes: ${known.map((name) => `context.${name}`).join(", ")}.`;
}

/** The paths a condition reads: its placeholders, and the paths of its `exists`. */
function conditionPaths(guard: Guard): string[] {
  return [...placeholderPaths(guard), ...existsPaths(guard)];
}

function existsPaths(guard: Guard): string[] {
  if ("exists" in guard) {
    return [guard.exists.replace(/^\{\{\s*|\s*\}\}$/g, "")];
  }
  return subGuards(guard).flatMap(existsPaths);
}

/**
 * A `when` that compares a key written by a choice agent with a text must
 * use one of the agent's options: any other text never matches, so its
 * branch can never be taken (or, with `notEquals`, is always taken).
 */
export const notAChoice: StateCheck = ({ workflow, id, state, options }) => {
  const choices = options.choices;
  if (choices === undefined) {
    return [];
  }
  return state.on.flatMap((transition, index) =>
    comparisons(transition.when).flatMap(({ key, text }): WorkflowIssue[] => {
      const writers = Object.values(workflow.states).filter((other) => other.output === key);
      const agents = [...new Set(writers.map(replyAgent))];
      const [agent] = agents;
      const allowed = agent === undefined ? undefined : choices[agent];
      if (agents.length !== 1 || allowed === undefined || allowed.includes(text.trim())) {
        return [];
      }
      const message = `"${id}" compares context.${key} with "${text}", but the agent ${agent} only answers ${orList(allowed)}. Use one of those, or add "${text}" to the options of ${agent}.`;
      return [issue("warning", "not-a-choice", message, stateKey(id, "on", index, "when"), id)];
    }),
  );
};

/**
 * The agent whose own reply a state writes; none for a state that calls a
 * method or sets its own `format`, whose reply isn't the agent's choice.
 */
function replyAgent(state: WorkflowState): string | undefined {
  return state.method === undefined && state.format === undefined ? state.agent : undefined;
}

/** One `equals` or `notEquals` of a whole `{{context.<key>}}` with a plain text. */
interface Comparison {
  readonly key: string;
  readonly text: string;
}

/** A whole `{{context.<key>}}`, with no path after the key. */
const WHOLE_CONTEXT_KEY = /^\{\{\s*context\.([\w-]+)\s*\}\}$/;

function comparisons(guard: Guard | undefined): Comparison[] {
  if (guard === undefined) {
    return [];
  }
  const pair = comparedPair(guard);
  if (pair === undefined) {
    return subGuards(guard).flatMap(comparisons);
  }
  const found: Comparison[] = [];
  for (const [side, other] of [pair, [pair[1], pair[0]]]) {
    const key = typeof side === "string" ? WHOLE_CONTEXT_KEY.exec(side)?.[1] : undefined;
    if (key !== undefined && typeof other === "string" && placeholderPaths(other).length === 0) {
      found.push({ key, text: other });
    }
  }
  return found;
}

/** The two values an `equals` or `notEquals` compares; none for any other kind. */
function comparedPair(guard: Guard): [unknown, unknown] | undefined {
  if ("equals" in guard) return guard.equals;
  if ("notEquals" in guard) return guard.notEquals;
  return undefined;
}

/** The conditions inside `not`, `all` and `any`; none for any other kind. */
function subGuards(guard: Guard): Guard[] {
  if ("not" in guard) return [guard.not];
  if ("all" in guard) return guard.all;
  if ("any" in guard) return guard.any;
  return [];
}

/** `"context.tags.0"` as `"tags"`; `null` for a path outside the context. */
export function contextKey(path: string): string | null {
  if (!path.startsWith("context.")) {
    return null;
  }
  return path.slice("context.".length).split(".")[0] ?? null;
}

/** "a", "a or b", "a, b or c". */
function orList(items: readonly string[]): string {
  return items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`;
}
