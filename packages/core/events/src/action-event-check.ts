import type {
  ActionEvent,
  ActionEventType,
  ActionOutcome,
  ActionStepFailure,
} from "./action-events.ts";

/** The longest service error message an event keeps; the rest is cut before it is written. */
export const maxActionErrorLength = 300;

/** The longest `reason` a request may give. */
export const maxActionReasonLength = 2000;

/** The longest text a kept or parameter field may hold. A writer cuts a kept text to this before it builds the event. */
export const maxActionValueLength = 1000;

const maxIdLength = 200;
const maxFlatEntries = 50;
const fieldName = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const isoUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

type FieldKind =
  | "id"
  | "reason"
  | "error"
  | "time"
  | "version"
  | "step"
  | "status"
  | "parameters"
  | "kept"
  | "requester";

/** What one field may hold. `values`: the only strings allowed, for a field that is one of a list. */
interface FieldSpec {
  kind: FieldKind | "one-of";
  values?: readonly string[];
  optional?: true;
}

/**
 * One spec for each field of an event, and no more: the compiler refuses a
 * table that misses a field of the type or names one the type doesn't have,
 * and an optional field's spec must say `optional`.
 */
type SpecsFor<E> = {
  readonly [K in Exclude<keyof E, "type">]-?: object extends Pick<E, K>
    ? FieldSpec & { optional: true }
    : FieldSpec & { optional?: never };
};

const base = { request: { kind: "id" }, at: { kind: "time" } } as const;
const step = { kind: "step" } as const;

/** Every reason a step may fail for. Other checks of action results read this list, so a new reason reaches them too. */
export const actionStepFailures: readonly ActionStepFailure[] = [
  "service-error",
  "refused",
  "unreachable",
  "malformed",
  "state-changed",
  "more-than-one",
];

/** Every way a request may end. */
export const actionOutcomes: readonly ActionOutcome[] = [
  "succeeded",
  "failed",
  "declined",
  "expired",
];

/** The highest step number a definition may have. */
export const maxActionStep = 100;

/**
 * Checks the kept fields of a successful step: plain values (or `null`) under
 * plain names, so no object, list or long text can hide in them.
 *
 * @returns the problem, never naming a value; `undefined` when the fields fit
 */
export function actionKeptProblem(value: unknown): string | undefined {
  return flatProblem(value, true);
}

/** The allow-list: every field each action event may carry. Anything else is refused. */
const schemas: { readonly [T in ActionEventType]: SpecsFor<Extract<ActionEvent, { type: T }>> } = {
  "action.requested": {
    ...base,
    definition: { kind: "id" },
    version: { kind: "version" },
    parameters: { kind: "parameters" },
    requester: { kind: "requester" },
    reason: { kind: "reason" },
    expires: { kind: "time" },
    expect: { kind: "parameters", optional: true },
  },
  "action.reviewed": {
    ...base,
    decision: { kind: "one-of", values: ["opened", "declined", "blocked"] },
    digest: { kind: "id" },
  },
  "action.signed-in": { ...base, service: { kind: "id" }, account: { kind: "id" } },
  "action.step.started": { ...base, step },
  "action.step.succeeded": {
    ...base,
    step,
    status: { kind: "status", optional: true },
    kept: { kind: "kept" },
  },
  "action.step.failed": {
    ...base,
    step,
    failure: { kind: "one-of", values: actionStepFailures },
    status: { kind: "status", optional: true },
    error: { kind: "error", optional: true },
  },
  "action.step.skipped": { ...base, step },
  "action.finished": { ...base, outcome: { kind: "one-of", values: actionOutcomes } },
};

/** The fields each kind of requester may carry. */
const requesterFields: Readonly<Record<string, readonly string[]>> = {
  agent: ["kind", "agent", "run"],
  routine: ["kind", "routine"],
  user: ["kind"],
};

/** What {@link checkActionEvent} found: the event, or every problem with it. */
export type ActionEventCheck =
  | { ok: true; event: ActionEvent }
  | { ok: false; problems: readonly string[] };

/**
 * Checks a value against the allow-list of its action event's fields
 * (requirement `events.action-events`). Every field must be on the list for
 * its event's type and hold what the list says, so a token, a header, an
 * `input` value or a whole answer body can't ride along under any name.
 * Writers check an event before writing it; readers check every line they read.
 *
 * @param value - an event about to be written, or one line of a record, parsed
 * @returns the event, or the problems; a problem names the field, never its value
 *
 * @example
 * checkActionEvent({ type: "action.step.started", request: "r1", at: "2026-11-24T13:00:00Z", step: 1 });
 * // => { ok: true, event: { ... } }
 */
export function checkActionEvent(value: unknown): ActionEventCheck {
  if (!isRecord(value)) return { ok: false, problems: ["an action event is a JSON object"] };
  const type = value["type"];
  if (typeof type !== "string" || !Object.hasOwn(schemas, type)) {
    return { ok: false, problems: ["type: not an action event"] };
  }
  const specs: Readonly<Record<string, FieldSpec>> = schemas[type as ActionEventType];
  const problems = [...unlistedFields(value, ["type", ...Object.keys(specs)])];
  for (const [name, spec] of Object.entries(specs)) {
    const problem = fieldProblem(spec, value[name]);
    if (problem !== undefined) problems.push(`${name}: ${problem}`);
  }
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, event: value as unknown as ActionEvent };
}

/** A problem for each key not on the list, named but cut short, since a key can be anything. */
function unlistedFields(value: Record<string, unknown>, allowed: readonly string[]): string[] {
  return Object.keys(value)
    .filter((key) => !allowed.includes(key))
    .map((key) => `${key.slice(0, 64)}: not allowed`);
}

function fieldProblem(spec: FieldSpec, value: unknown): string | undefined {
  if (value === undefined) return spec.optional ? undefined : "missing";
  if (spec.kind === "one-of") {
    return typeof value === "string" && spec.values?.includes(value) ? undefined : "not allowed";
  }
  return checkers[spec.kind](value);
}

const checkers: Readonly<Record<FieldKind, (value: unknown) => string | undefined>> = {
  id: (value) => textProblem(value, maxIdLength) ?? controlProblem(value),
  reason: (value) => textProblem(value, maxActionReasonLength),
  error: (value) => textProblem(value, maxActionErrorLength),
  time: (value) => (typeof value === "string" && isoUtc.test(value) ? undefined : "not a UTC time"),
  version: (value) => wholeNumberProblem(value, 1, 1000),
  step: (value) => wholeNumberProblem(value, 1, maxActionStep),
  status: (value) => wholeNumberProblem(value, 100, 599),
  parameters: (value) => flatProblem(value, false),
  kept: actionKeptProblem,
  requester: requesterProblem,
};

function textProblem(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string" || value === "") return "not a text";
  return value.length > maxLength ? `longer than ${maxLength}` : undefined;
}

/** Control characters (U+0000 to U+001F and U+007F) never belong in an id. */
function controlProblem(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const hasControl = [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 0x20 || code === 0x7f;
  });
  return hasControl ? "has a control character" : undefined;
}

function wholeNumberProblem(value: unknown, least: number, most: number): string | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) return "not a whole number";
  return value < least || value > most ? `not between ${least} and ${most}` : undefined;
}

/** A record of plain values under plain names: no object, list or long text can hide in it. */
function flatProblem(value: unknown, allowsNull: boolean): string | undefined {
  if (!isRecord(value)) return "not an object";
  const entries = Object.entries(value);
  if (entries.length > maxFlatEntries) return `more than ${maxFlatEntries} fields`;
  for (const [name, entry] of entries) {
    if (!fieldName.test(name)) return "a field name that isn't plain";
    if (!isPlainValue(entry, allowsNull)) return `${name} isn't a plain value`;
  }
  return undefined;
}

function isPlainValue(value: unknown, allowsNull: boolean): boolean {
  if (value === null) return allowsNull;
  if (typeof value === "string") return value.length <= maxActionValueLength;
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "boolean";
}

function requesterProblem(value: unknown): string | undefined {
  if (!isRecord(value)) return "not an object";
  const kind = value["kind"];
  if (typeof kind !== "string" || !Object.hasOwn(requesterFields, kind)) {
    return "not a kind of requester";
  }
  const allowed = requesterFields[kind] ?? [];
  if (unlistedFields(value, allowed).length > 0) return `a field not allowed for ${kind}`;
  const missing = allowed.find((name) => name !== "kind" && checkers.id(value[name]) !== undefined);
  return missing === undefined ? undefined : `${missing} isn't an id`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
