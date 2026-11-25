import type { PaperclipEvent, RuntimeHost, StateKey } from "../host.ts";

/**
 * The runtime's record of failed runs, kept from Paperclip's
 * `agent.run.failed` events, because the SDK can't list runs. Ported from
 * `tooling/paperclip` (`board-check/failed-runs.ts`), without the board
 * check's wakes and reports. Events sent while the plugin is down are lost,
 * so the record says since when it has been counting. A run's error text is
 * read once, to sort it into a cause code, and then dropped: it is never
 * stored or answered. Writing the record is the runtime's own bookkeeping,
 * not something a tool can do.
 */

/** Why a run failed, as far as an agent reading the list needs to know. */
export const causeCodes = [
  "no_identity",
  "spend_limit",
  "timeout",
  "adapter_error",
  "other",
] as const;
export type CauseCode = (typeof causeCodes)[number];

/** A failed run: ids, a cause code and a time. */
export interface FailedRun {
  readonly runId: string;
  readonly agentId: string;
  /** The task the run worked on, or null when the event names none. */
  readonly taskId: string | null;
  readonly cause: CauseCode;
  readonly at: string;
}

/** What the runtime keeps about failed runs in plugin state. */
export interface FailedRunsRecord {
  /** Since when it has been counting: the first event it kept. */
  readonly since: string | null;
  /** Oldest first. */
  readonly runs: readonly FailedRun[];
}

/** The record's limits: a week, the longest window a tool may set, and at most this many runs. */
export const recordLimits = { keepMs: 168 * 60 * 60_000, maxRuns: 500 } as const;

export const emptyRecord: FailedRunsRecord = { since: null, runs: [] };

/** The text patterns behind each cause code, first match wins. */
const causePatterns: readonly [CauseCode, RegExp][] = [
  ["no_identity", /no managed github identity|github identity/i],
  [
    "spend_limit",
    /spend(ing)? limit|usage limit|budget|out of (extra )?(usage|credits?)|credit balance/i,
  ],
  ["timeout", /timed? ?out|timeout/i],
  ["adapter_error", /adapter|exited with code|spawn|ENOENT|EPIPE/i],
];

/** Sorts a failure into a cause code from its status, code and text; the text goes no further. */
export function causeOf(failure: {
  readonly status: unknown;
  readonly errorCode: unknown;
  readonly error: unknown;
}): CauseCode {
  if (failure.status === "timed_out") {
    return "timeout";
  }
  const words = [failure.errorCode, failure.error]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
  return causePatterns.find(([, pattern]) => pattern.test(words))?.[0] ?? "other";
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** Reads a failed run from an `agent.run.failed` event; its payload is undocumented, so every field is checked. */
export function readFailedRun(event: PaperclipEvent): FailedRun | undefined {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const context = (payload["contextSnapshot"] ?? {}) as Record<string, unknown>;
  const runId = text(payload["runId"]) ?? text(event.entityId);
  const agentId = text(payload["agentId"]) ?? text(event.actorId);
  const at = Date.parse(event.occurredAt);
  if (runId === undefined || agentId === undefined || Number.isNaN(at)) {
    return undefined;
  }
  return {
    runId,
    agentId,
    taskId: text(payload["issueId"]) ?? text(context["issueId"]) ?? null,
    cause: causeOf({
      status: payload["status"],
      errorCode: payload["errorCode"],
      error: payload["error"],
    }),
    at: new Date(at).toISOString(),
  };
}

/** Reads the record from plugin state; anything malformed starts it afresh. */
export function readRecord(value: unknown): FailedRunsRecord {
  const record = (value ?? {}) as Partial<FailedRunsRecord>;
  const runs = Array.isArray(record.runs)
    ? record.runs.filter(
        (run): run is FailedRun =>
          typeof run?.runId === "string" &&
          typeof run.agentId === "string" &&
          (typeof run.taskId === "string" || run.taskId === null) &&
          (causeCodes as readonly unknown[]).includes(run.cause) &&
          typeof run.at === "string",
      )
    : [];
  return { since: typeof record.since === "string" ? record.since : null, runs };
}

/**
 * The record with `run` added once, keeping only the runs of the last week
 * and, of those, the newest `maxRuns`.
 */
export function recordFailure(
  record: FailedRunsRecord,
  run: FailedRun,
  now: Date,
): FailedRunsRecord {
  const cutoff = now.getTime() - recordLimits.keepMs;
  const runs = record.runs.some((kept) => kept.runId === run.runId)
    ? record.runs
    : [...record.runs, run];
  const kept = runs
    .filter((kept) => Date.parse(kept.at) >= cutoff)
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-recordLimits.maxRuns);
  return { since: record.since ?? run.at, runs: kept };
}

/** Where the record lives in plugin state, per company. */
export function failedRunsKey(companyId: string): StateKey {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: "runtime",
    stateKey: "failed-runs",
  };
}

/** Keeps the run an `agent.run.failed` event reports; an event without a run or an agent is skipped. */
export async function keepFailedRun(
  state: RuntimeHost["state"],
  event: PaperclipEvent,
  now: Date,
): Promise<void> {
  const run = readFailedRun(event);
  if (run === undefined) {
    return;
  }
  const key = failedRunsKey(event.companyId);
  const record = readRecord(await state.get(key));
  await state.set(key, recordFailure(record, run, now));
}
