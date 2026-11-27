// The rows that tell Cloud about stops, waiting runs and live counts. Each builder takes only the
// typed fields a row may hold (ids, enums, whole numbers, times) and checks them before a row
// exists, so no text from a run can reach the outbox through them.
import { checkId, checkScope, isUnit } from "./usage-input.ts";
import type { UsageRefusal, UsageUnit } from "./usage-types.ts";

/** What a stop row may name as its reason: a {@link UsageRefusal}'s code. */
export type StopCode = UsageRefusal["code"];

/**
 * The codes with no unit in them; `plan.<unit>` and `plan.member.<unit>` are checked by unit. Keyed
 * by the refusal's codes, so a code added there fails to compile until it is listed here.
 */
const fixedStopCodeKeys = {
  "plan.none": true,
  "plan.inactive": true,
  "plan.member.inactive": true,
  "plan.concurrency": true,
  "plan.member.concurrency": true,
  "usage.outbox-full": true,
  "usage.rate": true,
  "usage.member.rate": true,
} satisfies Record<Exclude<StopCode, `plan.${UsageUnit}` | `plan.member.${UsageUnit}`>, true>;

const fixedStopCodes: ReadonlySet<string> = new Set(Object.keys(fixedStopCodeKeys));

/** A run stopped at a limit; `phase: "reserve"` when a step was refused before it started. */
export interface StopRow {
  readonly kind: "stop";
  readonly id: string;
  readonly scope: string;
  readonly runId: string;
  readonly code: StopCode;
  readonly phase?: "reserve";
  readonly at: number;
}

/** A run started waiting at a plan limit. */
export interface WaitStartRow {
  readonly kind: "wait-start";
  readonly id: string;
  readonly scope: string;
  readonly runId: string;
  readonly code: StopCode;
  readonly at: number;
}

/** A run that waited too long at a plan limit and failed. */
export interface WaitExpiredRow {
  readonly kind: "wait-expired";
  readonly id: string;
  readonly scope: string;
  readonly runId: string;
  /** When the run started waiting, so Cloud pairs this row with its `wait-start`. */
  readonly waitedSince: number;
  readonly at: number;
}

/** How many runs a customer has running, sent only when the number changes. */
export interface RunningCountRow {
  readonly kind: "running-count";
  readonly id: string;
  readonly scope: string;
  readonly running: number;
  readonly at: number;
}

/** One of the rows this module builds. */
export type LimitEventRow = StopRow | WaitStartRow | WaitExpiredRow | RunningCountRow;

/**
 * A stop row; one per run, stop and time, so a resend dedupes at Cloud and a later stop doesn't.
 *
 * @throws RangeError when an id, the code or the time isn't valid
 */
export function stopRow(input: {
  scope: string;
  runId: string;
  code: StopCode;
  phase?: "reserve";
  at: number;
}): StopRow {
  const { scope, runId, at } = checkCommon(input);
  const code = checkStopCode(input.code);
  const phase = input.phase === undefined ? undefined : checkPhase(input.phase);
  const id = rowId("stop", scope, runId, at, code, phase ?? "");
  return phase === undefined
    ? { kind: "stop", id, scope, runId, code, at }
    : { kind: "stop", id, scope, runId, code, phase, at };
}

/**
 * A wait-start row; one per run and wait, keyed by when the wait began.
 *
 * @throws RangeError when an id, the code or the time isn't valid
 */
export function waitStartRow(input: {
  scope: string;
  runId: string;
  code: StopCode;
  at: number;
}): WaitStartRow {
  const { scope, runId, at } = checkCommon(input);
  const code = checkStopCode(input.code);
  return { kind: "wait-start", id: rowId("wait-start", scope, runId, at), scope, runId, code, at };
}

/**
 * A wait-expired row, keyed like the wait it ends.
 *
 * @throws RangeError when an id or a time isn't valid, or the wait ends before it began
 */
export function waitExpiredRow(input: {
  scope: string;
  runId: string;
  waitedSince: number;
  at: number;
}): WaitExpiredRow {
  const { scope, runId, at } = checkCommon(input);
  const waitedSince = checkTime("waitedSince", input.waitedSince);
  if (at < waitedSince) throw new RangeError("A wait ends after it began.");
  const id = rowId("wait-expired", scope, runId, waitedSince);
  return { kind: "wait-expired", id, scope, runId, waitedSince, at };
}

/**
 * A running-count row. Its id holds the count's change number, which the caller raises on every
 * change, so a resend dedupes and a new count never does.
 *
 * @throws RangeError when the scope, a number or the time isn't valid
 */
export function runningCountRow(input: {
  scope: string;
  running: number;
  change: number;
  at: number;
}): RunningCountRow {
  const scope = checkScope(input.scope);
  const running = checkCount("running", input.running);
  const change = checkCount("change", input.change);
  const at = checkTime("at", input.at);
  return { kind: "running-count", id: rowId("running", scope, change), scope, running, at };
}

// Scopes and run ids may hold ":", so the parts are joined with "|", which neither may hold; run ids
// are only unique within a scope, so every id starts with the scope.
function rowId(kind: string, ...parts: ReadonlyArray<string | number>): string {
  return [kind, ...parts].join("|");
}

function checkCommon(input: { scope: string; runId: string; at: number }) {
  // Builds a new object rather than spreading `input`, so a field it doesn't name never comes along.
  return {
    scope: checkScope(input.scope),
    runId: checkId("runId", input.runId),
    at: checkTime("at", input.at),
  };
}

/**
 * @throws RangeError when `code` isn't a refusal's code
 */
function checkStopCode(code: StopCode): StopCode {
  if (typeof code === "string" && fixedStopCodes.has(code)) return code;
  const unit = typeof code === "string" ? code.replace(/^plan\.(member\.)?/, "") : "";
  if (unit !== code && isUnit(unit)) return code;
  // The refused value may be run text, so the message leaves it out.
  throw new RangeError("code isn't a stop code.");
}

function checkPhase(phase: string): "reserve" {
  if (phase !== "reserve") throw new RangeError('A stop\'s phase is "reserve" or absent.');
  return phase;
}

function checkTime(name: string, time: number): number {
  if (!Number.isSafeInteger(time) || time < 0) {
    throw new RangeError(`${name} must be a time in ms since 1970.`);
  }
  return time;
}

function checkCount(name: string, count: number): number {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError(`${name} must be a safe whole number of 0 or more.`);
  }
  return count;
}
