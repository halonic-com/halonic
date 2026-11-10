import type { RunEvent } from "@halonicjs/events";
import type { BlobStore, RunStore } from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";
import { type BudgetCheck, keepToBudget } from "../budget/keep-to-budget.ts";
import { checkRunTakes, decide, tellParent } from "./decide.ts";
import type { DecidedEvent, DecideInput, Decision, Effect } from "./decide-types.ts";
import { missingDefinitionsError, readDefinitions } from "./kept-definitions.ts";
import { foldRun, type RunState } from "./run-state.ts";

/**
 * The version of the snapshot `step` stores. Bump it whenever `RunState`
 * changes shape: a snapshot of another version is ignored and the run is
 * folded from its log again, because a snapshot is only a cache (C53).
 */
export const snapshotVersion = 7;

/** How often `step` reads the run again after losing a race before it gives up. */
export const maxStepAttempts = 10;

/** What `step` stores as the run's snapshot. */
interface StoredSnapshot {
  readonly version: number;
  readonly state: RunState;
}

/** The ports `step` reads and writes. */
export interface StepPorts {
  readonly runs: Pick<RunStore, "append" | "events" | "snapshot">;
  readonly blobs: Pick<BlobStore, "get">;
  /** Keeps runs to their budget; without it, no budget stops a run. */
  readonly budget?: BudgetCheck;
}

/** What one `step` did. */
export interface StepResult {
  /** The run after the step. */
  readonly run: RunState;
  /** The events the step appended, in order; empty when the input changed nothing. */
  readonly events: readonly RunEvent[];
  /** The effects to carry out now that the events are stored. */
  readonly effects: readonly Effect[];
}

/**
 * Reads a run as the kernel knows it: its snapshot, if one is usable, with
 * the events after it folded on. A snapshot of another version, or one that
 * doesn't match the log, is ignored and the whole log is folded.
 *
 * @returns the run's state, or `null` for a run with no events
 */
export async function readRun(
  runs: Pick<RunStore, "events" | "snapshot">,
  runId: string,
): Promise<RunState | null> {
  const snapshot = await runs.snapshot(runId);
  const start =
    snapshot !== null && isUsable(snapshot.state, runId, snapshot.seq)
      ? snapshot.state.state
      : null;
  const events = await runs.events(runId, start?.lastSeq ?? 0);
  return foldRun(events, start);
}

/**
 * Moves a run on by one input: reads it, decides, and appends the decided
 * events with the snapshot after them, but only if the log hasn't moved on
 * since the read. When another writer got there first, nothing was stored,
 * so it reads the run again and decides afresh: an input is never written
 * twice. It carries out none of the effects; the caller does that once this
 * returns, because they are only safe once the events are stored.
 *
 * A run whose definitions are missing from the blob store fails with an
 * error that says so. It never falls back to the workspace's files. With
 * `budget`, a decision that asks for a paid call while a budget is reached
 * stores its events and then fails the run with the reason `budget`.
 *
 * @throws InputRefused when the run can't take the input; nothing is stored
 * @throws when a starting run's definitions are missing, or the log kept
 *   moving on for {@link maxStepAttempts} reads
 */
export async function step(
  ports: StepPorts,
  runId: string,
  input: DecideInput,
): Promise<StepResult> {
  for (let attempt = 1; attempt <= maxStepAttempts; attempt += 1) {
    const run = await readRun(ports.runs, runId);
    const decided = await decideWithDefinitions(ports, run, input);
    const decision =
      ports.budget === undefined
        ? decided
        : await keepToBudget(ports.budget, runId, run, decided, input.at);
    if (decision.events.length === 0) {
      // Only an input that doesn't start a run can decide nothing, so `run` is set.
      return { run: run as RunState, events: [], effects: decision.effects };
    }
    const events = stamp(runId, run?.lastSeq ?? 0, input.at, decision.events);
    const after = foldRun(events, run) as RunState;
    const snapshot: StoredSnapshot = { version: snapshotVersion, state: after };
    const result = await ports.runs.append(runId, run?.lastSeq ?? 0, events, { snapshot });
    if (result.ok) {
      return { run: after, events, effects: decision.effects };
    }
  }
  throw new Error(
    `Run "${runId}" kept moving on while it was being stepped; gave up after ${maxStepAttempts} tries.`,
  );
}

async function decideWithDefinitions(
  ports: StepPorts,
  run: RunState | null,
  input: DecideInput,
): Promise<Decision> {
  checkRunTakes(run, input);
  const version =
    input.type === "start" ? input.definitionsVersion : (run as RunState).definitionsVersion;
  const definitions = await readDefinitions(ports.blobs, version);
  if (definitions !== null) {
    return decide(run, input, definitions);
  }
  if (run === null) {
    throw new Error(missingDefinitionsError(version));
  }
  return {
    events: [
      {
        type: "run.failed",
        state: run.state,
        error: missingDefinitionsError(version),
        reason: "error",
      },
    ],
    effects: tellParent({ ...run, status: "failed" }),
  };
}

/** Numbers the decided events after `lastSeq` and stamps them with the input's time. */
function stamp(
  runId: string,
  lastSeq: number,
  at: string,
  events: readonly DecidedEvent[],
): RunEvent[] {
  // `entry` is left out: `entryOf` gives the same entries without it.
  return events.map((event, index) => ({ ...event, runId, seq: lastSeq + index + 1, at }));
}

function isUsable(value: unknown, runId: string, seq: number): value is StoredSnapshot {
  if (!isPlainObject(value) || value["version"] !== snapshotVersion) {
    return false;
  }
  const state = value["state"];
  return isPlainObject(state) && state["runId"] === runId && state["lastSeq"] === seq;
}
