// What the engine's active runs are waiting for, read from their logs: the
// "waits in progress" of `halonic doctor` and the Studio (failure path, rule 3).
// Nothing is stored; every wait is worked out from events the run already
// writes, so older logs show the waits they have and nothing else.

import type { RunEvent, RunSummary } from "@halonicjs/events";

/** The fields every wait has, whatever it waits for. */
interface WaitBase {
  runId: string;
  /** ISO time the wait began. */
  since: string;
  /** How long it has waited so far, in milliseconds; never below 0. */
  waitedMs: number;
}

/** A program a step started, and how long the engine gives it before the step fails. */
interface StartWait extends WaitBase {
  state: string;
  agent: string;
  /** From the `*.started` event: the limit after which the step fails. */
  timeoutMs: number;
  /** True once `waitedMs` is past `timeoutMs`: the engine should have ended the wait by now. */
  overdue: boolean;
}

/**
 * One thing an active run is waiting for:
 * - `run`: the run itself waits for an event, a timer or a person's OK;
 * - `sandbox`, `harness`, `connector`: a step started that program and it
 *   hasn't answered yet.
 */
export type Wait =
  | (WaitBase & {
      kind: "run";
      state: string | null;
      /** The events the run accepts, such as "approve". */
      accepts: string[];
      /** The tool calls waiting for a person's OK. */
      approvals: number;
      /** When the next timer is due (ISO), if the state has timers. */
      nextTimer: string | null;
    })
  | (StartWait & { kind: "sandbox" })
  | (StartWait & { kind: "harness"; harness: string })
  | (StartWait & { kind: "connector"; connector: string });

/** An active run: its summary, and its events oldest first. */
export interface ActiveRun {
  summary: RunSummary;
  events: readonly RunEvent[];
}

/**
 * The waits of the given runs, oldest first (requirement
 * `app.resource-report-waits`).
 *
 * A run with the status `waiting` waits itself, since its last `run.waiting`.
 * A `sandbox.started`, `harness.started` or `connector.started` event is a
 * wait until the same step writes anything after it: a later event from the
 * same agent, in the same parallel branch and for-each item, that names the
 * same state or no state at all (`tool.result` names none). Runs that have
 * ended have no waits.
 *
 * @param runs the active runs, in any order
 * @param now the time to measure the waits against
 *
 * @example
 * waitsInProgress([{ summary, events }], clock.now());
 * // [{ kind: "harness", runId: "r1", state: "write", agent: "writer",
 * //    harness: "claude-code", since: "…", waitedMs: 4000, timeoutMs: 60000, overdue: false }]
 */
export function waitsInProgress(runs: readonly ActiveRun[], now: Date): Wait[] {
  const waits: Wait[] = [];
  for (const run of runs) {
    if (run.summary.status !== "running" && run.summary.status !== "waiting") continue;
    const runWait = waitOfRun(run.summary, now);
    if (runWait !== undefined) waits.push(runWait);
    waits.push(...openStarts(run.events, now));
  }
  return waits.sort(oldestFirst);
}

function waitOfRun(summary: RunSummary, now: Date): Wait | undefined {
  if (summary.status !== "waiting") return undefined;
  const since = summary.lastWaitingAt ?? summary.updatedAt;
  return {
    kind: "run",
    runId: summary.id,
    since,
    waitedMs: waitedSince(since, now),
    state: summary.state,
    accepts: [...summary.accepts],
    approvals: summary.approvals.length,
    nextTimer: summary.nextTimer,
  };
}

type StartedEvent = Extract<
  RunEvent,
  { type: "sandbox.started" | "harness.started" | "connector.started" }
>;

function isStarted(event: RunEvent): event is StartedEvent {
  return (
    event.type === "sandbox.started" ||
    event.type === "harness.started" ||
    event.type === "connector.started"
  );
}

/** The started events of a log that nothing from their step came after. */
function openStarts(events: readonly RunEvent[], now: Date): Wait[] {
  const open: StartedEvent[] = [];
  for (const event of events) {
    const stillOpen = open.filter((started) => !answers(event, started));
    open.length = 0;
    open.push(...stillOpen);
    if (isStarted(event)) open.push(event);
  }
  return open.map((started) => startWait(started, now));
}

/** Whether `later` comes from the step that wrote `started`, so the program answered. */
function answers(later: RunEvent, started: StartedEvent): boolean {
  if (!("agent" in later) || later.agent !== started.agent) return false;
  if (later.branch !== started.branch || later.item !== started.item) return false;
  if (!("state" in later)) return true;
  return later.state === started.state;
}

function startWait(started: StartedEvent, now: Date): Wait {
  const waitedMs = waitedSince(started.at, now);
  const base: StartWait = {
    runId: started.runId,
    since: started.at,
    waitedMs,
    state: started.state,
    agent: started.agent,
    timeoutMs: started.timeoutMs,
    overdue: waitedMs > started.timeoutMs,
  };
  switch (started.type) {
    case "sandbox.started":
      return { ...base, kind: "sandbox" };
    case "harness.started":
      return { ...base, kind: "harness", harness: started.harness };
    case "connector.started":
      return { ...base, kind: "connector", connector: started.connector };
  }
}

function waitedSince(since: string, now: Date): number {
  return Math.max(0, now.getTime() - Date.parse(since));
}

function oldestFirst(first: Wait, second: Wait): number {
  return Date.parse(first.since) - Date.parse(second.since);
}
