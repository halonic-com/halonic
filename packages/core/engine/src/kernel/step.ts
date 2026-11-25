import type { RunEvent } from "@halonicjs/events";
import type { BlobStore, RunStore } from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";
import { type BudgetCheck, keepToLimits } from "../budget/keep-to-limits.ts";
import { continuesAtLimit, limitTimerDecision, resumedAtLimit } from "../budget/limit-wait.ts";
import type { StepMeter } from "../meter/run-meter.ts";
import { checkRunTakes, decide, startAgain, tellParent } from "./decide.ts";
import type { DecideInput, Decision, Effect, LoggedEvent, RunDefinitions } from "./decide-types.ts";
import { InputRefused } from "./input-refused.ts";
import { definitionsOf, UnreadableDefinitions } from "./kept-definitions.ts";
import type { LimitWait } from "./limit-wait-state.ts";
import { foldRun, type RunState } from "./run-state.ts";
import { saveArtifacts } from "./saved-artifacts.ts";

/**
 * The version of the snapshot `step` stores. Bump it whenever `RunState`
 * changes shape: a snapshot of another version is ignored and the run is
 * folded from its log again, because a snapshot is only a cache (C53).
 */
export const snapshotVersion = 12;

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
  /** Reads the run's definitions, and keeps the files its states save. */
  readonly blobs: Pick<BlobStore, "get" | "put">;
  /** Keeps runs to their budget; without it, no budget stops a run. */
  readonly budget?: BudgetCheck;
  /** Keeps runs to their customer's plan; without it, no plan stops a run. */
  readonly meter?: StepMeter;
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
 * `budget` or `meter`, a decision that asks for a paid call while a budget
 * or a plan limit is reached stores its events and then fails the run with
 * the reason `budget`, or, for a unit's limit of the customer's plan, waits
 * for `continue`, which decides the refused input again. A file
 * a state saves goes into the blob store before the events, so its
 * `artifact.created` never names a missing blob.
 *
 * @throws InputRefused when the run can't take the input; nothing is stored
 * @throws when a file a state saves can't be stored; nothing is appended
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
    const decision = await keepToLimits(ports, runId, run, decided, input);
    if (decision.events.length === 0) {
      // Only an input that doesn't start a run can decide nothing, so `run` is set.
      return { run: run as RunState, events: [], effects: decision.effects };
    }
    const logged = await saveArtifacts(ports.blobs, decision.events);
    const events = stamp(runId, run?.lastSeq ?? 0, input.at, logged);
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
  if (continuesAtLimit(run, input)) {
    return decideAgain(ports, run, input.at);
  }
  const expired = run !== null && input.type === "timer" ? limitTimerDecision(run, input) : null;
  if (expired !== null) return expired;
  return decideOnce(ports, run, input);
}

/**
 * `continue` and the decision the plan limit refused, made again from the
 * run as it was before it: a started run whose first step was refused goes
 * on from its `run.started`. `step` then asks the limits again.
 */
async function decideAgain(ports: StepPorts, run: RunState, at: string): Promise<Decision> {
  const { received, resumed, input } = resumedAtLimit(run, run.limitWait as LimitWait, at);
  const again =
    input.type === "start"
      ? startAgain(resumed, at, await definitionsOf(ports.blobs, input.definitionsVersion))
      : await decideOnce(ports, resumed, input);
  return { events: [received, ...again.events], effects: again.effects };
}

async function decideOnce(
  ports: StepPorts,
  run: RunState | null,
  input: DecideInput,
): Promise<Decision> {
  const version =
    input.type === "start" ? input.definitionsVersion : (run as RunState).definitionsVersion;
  let definitions: RunDefinitions;
  try {
    definitions = await definitionsOf(ports.blobs, version);
  } catch (error) {
    // A starting run is refused instead: it has nothing stored to fail.
    if (run === null || !(error instanceof UnreadableDefinitions)) throw error;
    return {
      events: [{ type: "run.failed", state: run.state, error: error.message, reason: "error" }],
      effects: tellParent({ ...run, status: "failed" }),
    };
  }
  try {
    return decide(run, input, definitions);
  } catch (error) {
    // A run that exists is never left running by a decision that throws, as it would be
    // asked again with the same input for as long as the process lives. A refused input
    // is not a failure of the run, and a starting run has nothing stored to fail.
    if (run === null || error instanceof InputRefused) throw error;
    return {
      events: [
        {
          type: "run.failed",
          state: run.state,
          error: error instanceof Error ? error.message : String(error),
          reason: "error",
        },
      ],
      effects: tellParent({ ...run, status: "failed" }),
    };
  }
}

/** Numbers the decided events after `lastSeq` and stamps them with the input's time. */
function stamp(
  runId: string,
  lastSeq: number,
  at: string,
  events: readonly LoggedEvent[],
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
