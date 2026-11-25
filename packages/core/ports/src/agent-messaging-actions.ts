// What an action Inbox item carries and how it is answered (ADR 2026-11-24,
// AgentMessaging version 3). The answer goes into the requesting agent's
// context and its run log, so it is held to an allow-list like the action
// events: no account name, no token, no header, no whole answer body.
import {
  type ActionKeptValue,
  type ActionOutcome,
  type ActionParameterValue,
  type ActionStepFailure,
  actionKeptProblem,
  actionOutcomes,
  actionStepFailures,
  maxActionErrorLength,
  maxActionStep,
} from "@halonicjs/events";
import type { InboxAnswer, InboxItem } from "./agent-messaging.ts";
import { optionAnswerFits, questionsAnswerFits } from "./agent-messaging-questions.ts";

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

/**
 * How one step of an action request ended. Steps the stepper never reached
 * aren't listed. For a stepper request (`InboxItem.stepper`) a step is one block.
 */
export interface ActionResultStep {
  /** The step's number in the definition, or the block's in a stepper request, from 1. */
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
  /** For `succeeded`: the user did it by hand ("Done by hand"), so the result says so. */
  byHand?: true;
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
 * Whether an answer fits its item: an item with `answerElsewhere` takes none;
 * an action item (one with `action` or `stepper`, even with `questions` too)
 * takes only an `action-result` that passes {@link checkActionResultAnswer}; any
 * other item with `questions` an `answers` answer that fits them
 * (`questionsAnswerFits`) or one of its `options`; any other item an option or a
 * reply. An option that needs a note takes it only with one (`optionAnswerFits`). Every `AgentMessaging` refuses an answer that
 * doesn't fit with `bad-answer`, before sending anything.
 *
 * @example
 * answerFitsItem(item, { kind: "reply", text: "Not yet" }); // false when `item.action` is set
 */
export function answerFitsItem(item: InboxItem, answer: InboxAnswer): boolean {
  if (item.answerElsewhere !== undefined) return false;
  // The action comes first: an item that carries both takes only the stepper's result.
  if (item.action !== undefined || item.stepper !== undefined) {
    return answer.kind === "action-result" && checkActionResultAnswer(answer).ok;
  }
  if (answer.kind === "option") {
    return optionAnswerFits(item, answer);
  }
  if (item.questions !== undefined) {
    return answer.kind === "answers" && questionsAnswerFits(item.questions, answer);
  }
  return answer.kind === "reply";
}

const stepOutcomes: readonly string[] = ["succeeded", "failed", "skipped"];
const answerFields = ["kind", "outcome", "steps"];
const stepFields = ["step", "outcome", "status", "kept", "failure", "error", "byHand"];

/**
 * Checks a value against the allow-list of an `action-result` answer
 * (requirement `ports.agent-messaging-actions`). Every field must be on the
 * list and hold what it says: kept fields are plain values under plain names,
 * error text is marked untrusted and at most 300 characters, and `kept`,
 * `failure` and `error` appear only on the outcome they belong to. So an
 * account name, a token or a whole answer body can't ride along under any
 * name. The outcome must agree with the steps, and steps come in the order
 * the stepper ran them, each once. A provider checks an answer before it sends it on; the engine checks
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
  if (!oneOf(value["outcome"], actionOutcomes)) problems.push("outcome: not allowed");
  const steps = value["steps"];
  if (!Array.isArray(steps)) problems.push("steps: not a list");
  else if (steps.length > maxActionStep) problems.push(`steps: more than ${maxActionStep}`);
  else problems.push(...steps.flatMap((step, index) => stepProblems(step, `steps.${index}.`)));
  if (problems.length > 0) return { ok: false, problems };
  const answer = value as unknown as ActionResultAnswer;
  const disagreement = orderProblem(answer.steps) ?? outcomeProblem(answer);
  if (disagreement !== undefined) return { ok: false, problems: [disagreement] };
  return { ok: true, answer };
}

/**
 * A stepper runs its steps in order and each at most once, so step numbers
 * only go up. A repeat or a step out of order means the answer wasn't built
 * from one run, and the requester would read the wrong outcome for a step.
 */
function orderProblem(steps: readonly ActionResultStep[]): string | undefined {
  const outOfOrder = steps.findIndex(
    (step, index) => index > 0 && step.step <= (steps[index - 1]?.step ?? 0),
  );
  return outOfOrder === -1 ? undefined : `steps.${outOfOrder}.step: not after the step before it`;
}

/**
 * Declined and expired requests never ran, so they list no steps; a request
 * that succeeded has no failed step.
 */
function outcomeProblem(answer: ActionResultAnswer): string | undefined {
  const ran = answer.steps.length > 0;
  if ((answer.outcome === "declined" || answer.outcome === "expired") && ran) {
    return `steps: none for ${answer.outcome}`;
  }
  const failedStep = answer.steps.some((step) => step.outcome === "failed");
  if (answer.outcome === "succeeded" && failedStep) return "outcome: succeeded with a failed step";
  return undefined;
}

function stepProblems(value: unknown, at: string): string[] {
  if (!isRecord(value)) return [`${at.slice(0, -1)}: not an object`];
  const problems = unlistedFields(value, stepFields, at);
  const outcome = value["outcome"];
  if (!wholeNumberIn(value["step"], 1, maxActionStep))
    problems.push(`${at}step: not a step number`);
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
  only("kept", "succeeded", actionKeptProblem(value["kept"]));
  only(
    "failure",
    "failed",
    oneOf(value["failure"], actionStepFailures) ? undefined : "not allowed",
  );
  only("error", "failed", untrustedTextProblem(value["error"]));
  only("byHand", "succeeded", value["byHand"] === true ? undefined : "not true");
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
