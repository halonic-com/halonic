import { amsterdamTime } from "../amsterdam-time.ts";
import type { BoardWrite } from "./writes.ts";

/**
 * Part (a) of the board check: runs that failed or timed out, as Paperclip
 * reports them with the `agent.run.failed` event. The SDK can't list runs,
 * and events sent while the plugin is down are lost, so the record says
 * since when it has been counting. A run's error text is read once, to sort
 * it into a cause code, and then dropped: it is never stored, posted or logged.
 */

/** Why a run failed, as far as the board check needs to know. */
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

/** What the board check keeps about failed runs in plugin state. */
export interface FailedRunsRecord {
  /** Since when it has been counting: the first event it kept. */
  readonly since: string | null;
  readonly runs: readonly FailedRun[];
  /** Tasks already woken for a missing GitHub identity: once per task. */
  readonly woken: readonly string[];
  /** Spend-limit failures already reported on the Seat Supervisor's task, by run id. */
  readonly reported: readonly string[];
}

/** Failed runs are kept two days, enough for `failed_runs(since)` and the comparison with the agent's log. */
export const keepRunsMs = 48 * 60 * 60_000;

export const emptyRecord: FailedRunsRecord = { since: null, runs: [], woken: [], reported: [] };

/** The text patterns behind each cause code, first match wins; the Worker agents page matches them in the database. */
export const causePatterns: readonly [CauseCode, RegExp][] = [
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
export function readFailedRun(event: {
  readonly entityId?: string | undefined;
  readonly actorId?: string | undefined;
  readonly occurredAt: string;
  readonly payload: unknown;
}): FailedRun | undefined {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const context = (payload["contextSnapshot"] ?? {}) as Record<string, unknown>;
  const runId = text(payload["runId"]) ?? text(event.entityId);
  const agentId = text(payload["agentId"]) ?? text(event.actorId);
  if (runId === undefined || agentId === undefined) {
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
    at: new Date(event.occurredAt).toISOString(),
  };
}

/** Reads the record from plugin state; anything malformed starts it afresh. */
export function readRecord(value: unknown): FailedRunsRecord {
  const record = (value ?? {}) as Partial<FailedRunsRecord>;
  const strings = (list: unknown) =>
    Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];
  const runs = Array.isArray(record.runs)
    ? record.runs.filter(
        (run): run is FailedRun =>
          typeof run?.runId === "string" &&
          typeof run.agentId === "string" &&
          (causeCodes as readonly unknown[]).includes(run.cause) &&
          typeof run.at === "string",
      )
    : [];
  return {
    since: typeof record.since === "string" ? record.since : null,
    runs,
    woken: strings(record.woken),
    reported: strings(record.reported),
  };
}

/** The record with `run` added once, and runs older than `keepRunsMs` dropped. */
export function recordFailure(
  record: FailedRunsRecord,
  run: FailedRun,
  now: Date,
): FailedRunsRecord {
  const cutoff = now.getTime() - keepRunsMs;
  const runs = record.runs.some((kept) => kept.runId === run.runId)
    ? record.runs
    : [...record.runs, run];
  const kept = runs.filter((kept) => Date.parse(kept.at) >= cutoff);
  return {
    ...record,
    since: record.since ?? run.at,
    runs: kept,
    // A task leaves `woken` with its last kept run, so a failure days later wakes it again.
    woken: record.woken.filter((taskId) => kept.some((kept) => kept.taskId === taskId)),
    reported: record.reported.filter((id) => kept.some((kept) => kept.runId === id)),
  };
}

/** What part (a) wants written this pass, and the record to save once it went through. */
export interface FailedRunsPlan {
  readonly writes: readonly BoardWrite[];
  readonly record: FailedRunsRecord;
}

/**
 * Wakes the task of each run that failed for a missing GitHub identity, once
 * per task and at most `wakes` of them this pass (the rest wait for the next),
 * and one line on the Seat Supervisor's task for new spend-limit failures.
 */
export function planFailedRuns(
  record: FailedRunsRecord,
  options: {
    readonly wakes: number;
    readonly seatSupervisorTaskId: string | undefined;
    readonly names: ReadonlyMap<string, string>;
  },
): FailedRunsPlan {
  const toWake = [
    ...new Set(
      record.runs
        .filter((run) => run.cause === "no_identity" && run.taskId !== null)
        .map((run) => run.taskId ?? ""),
    ),
  ]
    .filter((taskId) => !record.woken.includes(taskId))
    .slice(0, Math.max(0, options.wakes));
  const writes: BoardWrite[] = toWake.map((taskId) => ({
    kind: "wake",
    taskId,
    reason: "board_check_no_identity",
    key: `board-check no_identity ${taskId}`,
  }));
  const spend = record.runs.filter(
    (run) => run.cause === "spend_limit" && !record.reported.includes(run.runId),
  );
  const seatTask = options.seatSupervisorTaskId;
  if (seatTask !== undefined && spend.length > 0) {
    const agents = [...new Set(spend.map((run) => options.names.get(run.agentId) ?? run.agentId))];
    writes.push({
      kind: "comment",
      taskId: seatTask,
      body: `Spend-limit failures: ${spend.length} runs since ${amsterdamTime(spend[0]?.at ?? "")} (${agents.join(", ")}).`,
    });
  }
  return {
    writes,
    record: {
      ...record,
      woken: [...record.woken, ...toWake],
      reported:
        seatTask === undefined
          ? record.reported
          : [...record.reported, ...spend.map((run) => run.runId)],
    },
  };
}
