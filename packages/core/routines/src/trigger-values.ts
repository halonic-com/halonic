import type { Routine, RoutineTrigger } from "@halonicjs/format";
import { KindedError } from "@halonicjs/std";
import { type TriggerKind, triggerKind } from "./trigger-kind.ts";

/** Every placeholder in a text, as `render` of `@halonicjs/workflow` finds them. */
const PLACEHOLDER = /\{\{\s*([\w.-]+)\s*\}\}/g;

/** The trigger values a routine of each kind gets, besides `at` and `lastRun`, which all get. */
const KIND_OF_VALUE: Readonly<Record<string, TriggerKind>> = {
  message: "mail",
  body: "webhook",
  headers: "webhook",
  signal: "signal",
};

/** A `{{…}}` in a routine's input or prompt that its start would fill in with nothing. */
export interface TriggerValueProblem {
  /** Where in the routine file: `["run", "input", "day"]` or `["run", "prompt"]`. */
  readonly path: readonly (string | number)[];
  /** What is wrong and what to use instead. */
  readonly message: string;
}

/**
 * A routine start stopped by a placeholder its trigger has no value for. It is
 * `invalid_input`, so a surface shows the message, the same one
 * `halonic validate` gives under the code `unknown-trigger-value`
 * (HAL-14883).
 */
export class UnknownTriggerValueError extends KindedError {
  /** The validate code for the same problem. */
  readonly code = "unknown-trigger-value";

  constructor(problem: TriggerValueProblem) {
    super("invalid_input", problem.message);
  }
}

/**
 * The placeholders in a routine's input texts and prompt that aren't a value
 * its trigger has (HAL-14298). Every trigger has `{{trigger.at}}` and
 * `{{trigger.lastRun}}`; a mail trigger also `{{trigger.message}}`, a
 * webhook `{{trigger.body}}` and `{{trigger.headers.<name>}}` for the
 * headers it lists, and a signal `{{trigger.signal}}`. Any other name would
 * start the run with an empty text, or without the input key at all.
 *
 * @example
 * triggerValueProblems(routine); // input { day: "{{trigger.date}}" } on a schedule:
 * // [{ path: ["run", "input", "day"], message: "{{trigger.date}} isn't a trigger value. Use {{trigger.at}} or {{trigger.lastRun}}." }]
 */
export function triggerValueProblems(routine: Routine): TriggerValueProblem[] {
  const run = routine.run;
  const texts: { path: string[]; text: unknown }[] =
    "workflow" in run
      ? Object.entries(run.input).map(([key, text]) => ({ path: ["run", "input", key], text }))
      : [{ path: ["run", "prompt"], text: run.prompt }];
  return texts.flatMap(({ path, text }) => {
    if (typeof text !== "string") {
      return [];
    }
    return [...text.matchAll(PLACEHOLDER)].flatMap((match) => {
      const message = valueProblem(match[1] ?? "", routine.trigger);
      return message === null ? [] : [{ path, message }];
    });
  });
}

/** Why a placeholder's path isn't one of the trigger's values, or `null` when it is. */
function valueProblem(path: string, trigger: RoutineTrigger): string | null {
  const [root, name, ...rest] = path.split(".");
  const written = `{{${path}}}`;
  const use = `Use ${listed(valuesOf(trigger))}.`;
  if (root !== "trigger" || name === undefined) {
    return `${written} isn't a trigger value. ${use}`;
  }
  if (name === "at" || name === "lastRun") {
    return rest.length === 0 ? null : `${written} isn't a trigger value. ${use}`;
  }
  const kind = KIND_OF_VALUE[name];
  if (kind === undefined) {
    return `${written} isn't a trigger value. ${use}`;
  }
  if (kind !== triggerKind(trigger)) {
    return `${written} is only set for a routine on ${kind === "mail" ? "mail" : `a ${kind}`}. ${use}`;
  }
  if ("webhook" in trigger && name === "headers") {
    const header = rest[0];
    if (rest.length !== 1 || header === undefined || !trigger.webhook.headers.includes(header)) {
      return `${written} isn't a header this webhook passes on. Add its lowercase name to trigger.webhook.headers, then use {{trigger.headers.<name>}}.`;
    }
  }
  return null;
}

/** The values a routine on this trigger can use, as placeholders. */
function valuesOf(trigger: RoutineTrigger): string[] {
  const values = ["{{trigger.at}}", "{{trigger.lastRun}}"];
  if ("mail" in trigger) {
    values.push("{{trigger.message}}");
  } else if ("webhook" in trigger) {
    values.push("{{trigger.body}}", "{{trigger.headers.<name>}}");
  } else if ("signal" in trigger) {
    values.push("{{trigger.signal}}");
  }
  return values;
}

/** `a or b`, `a, b or c`. */
function listed(values: readonly string[]): string {
  return values.length < 2
    ? values.join("")
    : `${values.slice(0, -1).join(", ")} or ${values.at(-1)}`;
}
