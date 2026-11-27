import type { ActionKeptValue, ActionParameterValue } from "@halonicjs/events";
import { checkExpect, type ExpectChange } from "./expect-check.ts";
import type { CheckRequirement, CheckStep, StepperDefinition } from "./stepper-types.ts";

type Values<Value> = Readonly<Record<string, Value>>;

/** Whether a step may run, after the `check` steps before it. */
export type GateResult =
  | { ok: true }
  | {
      ok: false;
      /** The `check` step that stopped it. */
      check: number;
      /**
       * What stopped it: a request whose `expect` lacks a name the check
       * requires, a changed `expect` value, a broken `requires` rule, a
       * required field the check didn't read, or a check that hasn't run.
       */
      cause: "missing-expect" | "expect" | "requires" | "not-read" | "not-checked";
      /** What differs from the request's `expect`; empty when a `requires` stopped it. */
      changes: readonly ExpectChange[];
      message: string;
    };

/** What the `check` steps kept so far, by step number. */
export type KeptByStep = ReadonlyMap<number, Readonly<Record<string, ActionKeptValue>>>;

/**
 * Decides whether step `step` may run (architecture note, 6.2): for every
 * `check` step before it that has something to compare, the request's
 * `expect` must name each of its `requiredExpect` fields, the check must have
 * run, its kept values must match the request's `expect` for the fields it
 * keeps, and then each of its `requires` rules must hold, on a field it read.
 * A rule with `equalsParameter` compares with the request's `parameters`, so
 * a caller that passes none fails closed. The first refusal stops the stepper
 * in one place, before anything changes. A changed `expect` value stops it
 * with `checkExpect`'s sentence; a broken `requires` with the definition's
 * own `reason`, so the service's value never becomes Halonic's words.
 *
 * @example
 * checkStepGate(removeRunner, 2, {}, new Map([[1, { status: "online" }]]));
 * // => { ok: false, check: 1, cause: "requires", changes: [], message: "The runner is still online. Stop it first." }
 */
export function checkStepGate(
  definition: Pick<StepperDefinition, "steps">,
  step: number,
  expect: Values<ActionParameterValue>,
  kept: KeptByStep,
  parameters: Values<ActionParameterValue> = {},
): GateResult {
  for (const [index, each] of definition.steps.entries()) {
    const number = index + 1;
    if (number >= step) break;
    if (each.kind !== "check") continue;
    const seen = expectedOf(each, expect);
    const comparesSomething =
      Object.keys(seen).length > 0 ||
      (each.requires?.length ?? 0) > 0 ||
      (each.requiredExpect?.length ?? 0) > 0;
    if (!comparesSomething) continue;
    const missing = (each.requiredExpect ?? []).filter((name) => !Object.hasOwn(expect, name));
    if (missing.length > 0) {
      return {
        ok: false,
        check: number,
        cause: "missing-expect",
        changes: [],
        message: missingExpect(missing),
      };
    }
    const refusal = refusalOf(each, seen, kept.get(number), parameters);
    if (refusal !== undefined) return { ok: false, check: number, ...refusal };
  }
  return { ok: true };
}

/** The request's `expect` values this check keeps; the others belong to another check. */
function expectedOf(
  check: CheckStep,
  expect: Readonly<Record<string, ActionParameterValue>>,
): Record<string, ActionParameterValue> {
  return Object.fromEntries(Object.entries(expect).filter(([name]) => check.keep.includes(name)));
}

function refusalOf(
  check: CheckStep,
  seen: Values<ActionParameterValue>,
  current: Values<ActionKeptValue> | undefined,
  parameters: Values<ActionParameterValue>,
): Omit<Extract<GateResult, { ok: false }>, "ok" | "check"> | undefined {
  // A check that hasn't kept anything yet has checked nothing, so nothing after it runs.
  if (current === undefined) return { cause: "not-checked", changes: [], message: notCheckedYet };
  const compared = checkExpect(seen, current);
  if (!compared.ok) {
    return { cause: "expect", changes: compared.changes, message: compared.message };
  }
  // A check marked done by hand kept nothing: the rule's reason would claim a state nobody read.
  const unread = check.requires?.find((rule) => !Object.hasOwn(current, rule.name));
  if (unread !== undefined) {
    return { cause: "not-read", changes: [], message: `The check didn't read "${unread.name}".` };
  }
  const unmet = check.requires?.find((rule) => !holds(rule, current, parameters));
  return unmet === undefined
    ? undefined
    : { cause: "requires", changes: [], message: unmet.reason };
}

/** Whether a rule holds on what the check read; a missing parameter never matches. */
function holds(
  rule: CheckRequirement,
  current: Values<ActionKeptValue>,
  parameters: Values<ActionParameterValue>,
): boolean {
  if ("equals" in rule) return current[rule.name] === rule.equals;
  const given = Object.hasOwn(parameters, rule.equalsParameter)
    ? parameters[rule.equalsParameter]
    : undefined;
  return given !== undefined && current[rule.name] === given;
}

/**
 * Halonic's own sentence for a request that doesn't name what the requester
 * saw. The names come from the reviewed definition, never from the request.
 */
function missingExpect(names: readonly string[]): string {
  return `This request doesn't say what the requester saw: ${names.map((name) => `"${name}"`).join(", ")}.`;
}

const notCheckedYet = "Run the check before this step first.";
