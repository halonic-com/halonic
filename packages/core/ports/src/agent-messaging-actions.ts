// What an action Inbox item carries and how it is answered (ADR 2026-11-24,
// AgentMessaging version 3). The answer goes into the requesting agent's
// context and its run log, so it is held to an allow-list like the action
// events: no account name, no token, no header, no whole answer body.
import {
  type ActionKeptValue,
  type ActionOutcome,
  type ActionParameterValue,
  type ActionStepFailure,
  maxActionErrorLength,
} from "@halonicjs/events";
import type { InboxAnswer, InboxItem } from "./agent-messaging.ts";

/**
 * A request to run a user-only action stepper, as an action Inbox item
 * carries it. It names a reviewed definition and fills it: it never holds a
 * step, a method, an address, a header or a body. `expect` is state the
 * requester saw, checked before the run; `expires` is ISO 8601 UTC. The item's
 * `question` is the requester's reason, shown quoted.
 */
export interface InboxActionRequest {
  definition: string;
  version: number;
  parameters: Readonly<Record<string, ActionParameterValue>>;
  expect?: Readonly<Record<string, ActionParameterValue>>;
  expires: string;
}

/** A service's own error message, cut to `maxActionErrorLength`. The marker travels with the text, so whoever reads it quotes it. */
export interface UntrustedText {
  untrusted: true;
  text: string;
}

/** How one step of an action request ended. Steps the stepper never reached aren't listed. */
export interface ActionResultStep {
  /** The step's number in the definition, from 1. */
  step: number;
  outcome: "succeeded" | "failed" | "skipped";
  /** The HTTP status, when the service answered. */
  status?: number;
  /** For `succeeded`: only the fields the definition keeps. */
  kept?: Readonly<Record<string, ActionKeptValue>>;
  /** For `failed`: why, and only then. */
  failure?: ActionStepFailure;
  /** For `failed`: what the service said, untrusted. */
  error?: UntrustedText;
}

/**
 * Studio's answer to an action item once its stepper ends: how the request
 * ended and each step's outcome with its kept fields. It never names the
 * account the user signed in with; that stays in the request's record.
 */
export interface ActionResultAnswer {
  kind: "action-result";
  outcome: ActionOutcome;
  steps: readonly ActionResultStep[];
}

/** What {@link checkActionResultAnswer} found: the answer, or every problem with it. */
export type ActionResultCheck =
  | { ok: true; answer: ActionResultAnswer }
  | { ok: false; problems: readonly string[] };

/**
 * Whether an answer fits its item: an action item takes only an
 * `action-result` that passes {@link checkActionResultAnswer}, any other item
 * only an option or a reply. Every `AgentMessaging` refuses an answer that
 * doesn't fit with `bad-answer`, before sending anything.
 *
 * @example
 * answerFitsItem(item, { kind: "reply", text: "Not yet" }); // false when `item.action` is set
 */
export function answerFitsItem(item: InboxItem, answer: InboxAnswer): boolean {
  if (item.action === undefined) return answer.kind !== "action-result";
  return answer.kind === "action-result" && checkActionResultAnswer(answer).ok;
}

const maxSteps = 100;
const maxFlatEntries = 50;
const maxValueLength = 1000;
const fieldName = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const outcomes: readonly string[] = ["succeeded", "failed", "declined", "expired"];
const stepOutcomes: readonly string[] = ["succeeded", "failed", "skipped"];
const failures: readonly string[] = [
  "service-error",
  "refused",
  "unreachable",
  "malformed",
  "state-changed",
];
const answerFields = ["kind", "outcome", "steps"];
const stepFields = ["step", "outcome", "status", "kept", "failure", "error"];

/**
 * Checks a value against the allow-list of an `action-result` answer
 * (requirement `ports.agent-messaging-actions`). Every field must be on the
 * list and hold what it says: kept fields are plain values under plain names,
 * error text is marked untrusted and at most 300 characters, and `kept`,
 * `failure` and `error` appear only on the outcome they belong to. So an
 * account name, a token or a whole answer body can't ride along under any
 * name. A provider checks an answer before it sends it on; the engine checks
 * one before it records it on a run.
 *
 * @param value - an answer about to be sent, or one read back, parsed
 * @returns the answer, or the problems; a problem names the field, never its value
 *
 * @example
 * checkActionResultAnswer({ kind: "action-result", outcome: "declined", steps: [] });
 * // => { ok: true, answer: { ... } }
 */
export function checkActionResultAnswer(value: unknown): ActionResultCheck {
  if (!isRecord(value)) return { ok: false, problems: ["an answer is a JSON object"] };
  const problems = unlistedFields(value, answerFields, "");
  if (value["kind"] !== "action-result") problems.push("kind: not action-result");
  if (!oneOf(value["outcome"], outcomes)) problems.push("outcome: not allowed");
  const steps = value["steps"];
  if (!Array.isArray(steps)) problems.push("steps: not a list");
  else if (steps.length > maxSteps) problems.push(`steps: more than ${maxSteps}`);
  else problems.push(...steps.flatMap((step, index) => stepProblems(step, `steps.${index}.`)));
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, answer: value as unknown as ActionResultAnswer };
}

function stepProblems(value: unknown, at: string): string[] {
  if (!isRecord(value)) return [`${at.slice(0, -1)}: not an object`];
  const problems = unlistedFields(value, stepFields, at);
  const outcome = value["outcome"];
  if (!wholeNumberIn(value["step"], 1, maxSteps)) problems.push(`${at}step: not a step number`);
  if (!oneOf(outcome, stepOutcomes)) problems.push(`${at}outcome: not allowed`);
  const status = value["status"];
  if (status !== undefined && !wholeNumberIn(status, 100, 599)) {
    problems.push(`${at}status: not an HTTP status`);
  }
  const only = (field: string, belongsTo: string, problem: string | undefined) => {
    if (value[field] === undefined) return;
    if (outcome !== belongsTo) problems.push(`${at}${field}: only for ${belongsTo}`);
    else if (problem !== undefined) problems.push(`${at}${field}: ${problem}`);
  };
  only("kept", "succeeded", flatProblem(value["kept"]));
  only("failure", "failed", oneOf(value["failure"], failures) ? undefined : "not allowed");
  only("error", "failed", untrustedTextProblem(value["error"]));
  if (outcome === "failed" && value["failure"] === undefined)
    problems.push(`${at}failure: missing`);
  return problems;
}

function untrustedTextProblem(value: unknown): string | undefined {
  if (!isRecord(value)) return "not an object";
  if (unlistedFields(value, ["untrusted", "text"], "").length > 0) return "a field not allowed";
  if (value["untrusted"] !== true) return "not marked untrusted";
  const text = value["text"];
  if (typeof text !== "string" || text === "") return "not a text";
  return text.length > maxActionErrorLength ? `longer than ${maxActionErrorLength}` : undefined;
}

/** A record of plain values under plain names: no object, list or long text can hide in it. */
function flatProblem(value: unknown): string | undefined {
  if (!isRecord(value)) return "not an object";
  const entries = Object.entries(value);
  if (entries.length > maxFlatEntries) return `more than ${maxFlatEntries} fields`;
  for (const [name, entry] of entries) {
    if (!fieldName.test(name)) return "a field name that isn't plain";
    if (!isPlainValue(entry)) return `${name} isn't a plain value`;
  }
  return undefined;
}

function isPlainValue(value: unknown): boolean {
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "string") return value.length <= maxValueLength;
  return typeof value === "number" && Number.isFinite(value);
}

/** A problem for each key not on the list, named but cut short, since a key can be anything. */
function unlistedFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
  at: string,
): string[] {
  return Object.keys(value)
    .filter((key) => !allowed.includes(key))
    .map((key) => `${at}${key.slice(0, 64)}: not allowed`);
}

function oneOf(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === "string" && allowed.includes(value);
}

function wholeNumberIn(value: unknown, least: number, most: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= least && value <= most;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
