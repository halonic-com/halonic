import type { WriterSetup } from "./calibration.ts";
import type { FeatureValues } from "./logistic-model.ts";

/**
 * One line of the retry decision log. The retry policy (HAL-17073) writes one
 * entry for every decision it takes on a task, with the numbers it decided on,
 * so the detectors can be retrained on production runs. Entries never hold the
 * task prompt, the diff or any check output: only counts, scores and choices.
 */
export type DecisionEntry =
  | AttemptStarted
  | CheckpointScored
  | AttemptStopped
  | AttemptFinished
  | ShipChosen
  | OutcomeKnown;

/** Fields every entry has. */
interface EntryBase {
  /** The writer task the decision belongs to. */
  readonly taskId: string;
  /** When the decision was taken, as an ISO 8601 time. */
  readonly at: string;
}

/** Why an attempt started: the task's first, or a spawn after a checkpoint score. */
export type StartReason = "first" | "spawn";

/** An attempt started, on which writer. */
export interface AttemptStarted extends EntryBase {
  readonly kind: "attempt-started";
  /** The attempt's number on its task, counting from 1. */
  readonly attempt: number;
  readonly reason: StartReason;
  readonly setup: WriterSetup;
  /** For a spawn: the attempt whose checkpoint score started this one. */
  readonly spawnedBy?: number;
}

/** A running attempt was scored at a checkpoint, and what the policy did with it. */
export interface CheckpointScored extends EntryBase {
  readonly kind: "checkpoint";
  readonly attempt: number;
  readonly minute: number;
  readonly features: FeatureValues;
  /** The score, or null when the detector refused the attempt's setup. */
  readonly pFail: number | null;
  /** The spawn and stop thresholds in force. */
  readonly spawnAt: number;
  readonly stopAt: number;
  /** The policy started another attempt because of this score. */
  readonly spawned: boolean;
  /** The policy stopped this attempt because of this score. */
  readonly stopped: boolean;
}

/** Why an attempt stopped before it finished by itself. */
export type StopReason = "score" | "shipped-other" | "timeout" | "cancelled";

/** The policy stopped a running attempt. */
export interface AttemptStopped extends EntryBase {
  readonly kind: "attempt-stopped";
  readonly attempt: number;
  readonly reason: StopReason;
  /** Spend on the attempt up to the stop, in US dollars. */
  readonly costUsd: number;
  readonly seconds: number;
}

/** An attempt finished by itself and got its end-of-run score. */
export interface AttemptFinished extends EntryBase {
  readonly kind: "attempt-finished";
  readonly attempt: number;
  readonly features: FeatureValues;
  /** The score, or null when the detector refused the attempt's setup. */
  readonly pFail: number | null;
  readonly flagged: boolean;
  readonly costUsd: number;
  readonly seconds: number;
}

/**
 * The ship choice for a task: one finished attempt, or none, when every
 * attempt was flagged or stopped and the task goes back to Opus.
 */
export interface ShipChosen extends EntryBase {
  readonly kind: "ship";
  /** The shipped attempt, or null for the fallback. */
  readonly attempt: number | null;
  /** How many attempts ran on the task, stopped ones included. */
  readonly attempts: number;
  /** Spend on all of the task's attempts, in US dollars. */
  readonly costUsd: number;
  /** Seconds from the first attempt's start to the ship choice. */
  readonly waitSeconds: number;
}

/**
 * What became of a shipped change: `pass` when it merged as written, `rework`
 * when it needed another writer run or a person's fix first.
 */
export type Outcome = "pass" | "rework";

/** The outcome of a task's shipped change, known later than the ship choice. */
export interface OutcomeKnown extends EntryBase {
  readonly kind: "outcome";
  readonly outcome: Outcome;
}

/** Where the policy writes its entries: a file, a store, or memory in tests. */
export interface DecisionLog {
  append(entry: DecisionEntry): Promise<void>;
}

/** A decision log in memory, for tests and for a policy run without storage. */
export class MemoryDecisionLog implements DecisionLog {
  readonly entries: DecisionEntry[] = [];

  async append(entry: DecisionEntry): Promise<void> {
    this.entries.push(entry);
  }
}

/** One entry as one line of JSON, for an append-only log file. */
export function decisionLine(entry: DecisionEntry): string {
  return `${JSON.stringify(entry)}\n`;
}

const entryKinds: ReadonlySet<string> = new Set<DecisionEntry["kind"]>([
  "attempt-started",
  "checkpoint",
  "attempt-stopped",
  "attempt-finished",
  "ship",
  "outcome",
]);

/**
 * Reads a log file's text back into entries. A line that is not JSON or has
 * no known `kind`, `taskId` and `at` is skipped and counted, so one torn line
 * (a crash mid-write) never loses the rest of the log.
 */
export function readDecisionLines(text: string): {
  readonly entries: DecisionEntry[];
  readonly skipped: number;
} {
  const entries: DecisionEntry[] = [];
  let skipped = 0;
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const entry = parseEntry(line);
    if (entry) entries.push(entry);
    else skipped++;
  }
  return { entries, skipped };
}

function parseEntry(line: string): DecisionEntry | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  const { kind, taskId, at } = value as Record<string, unknown>;
  const known =
    typeof kind === "string" &&
    entryKinds.has(kind) &&
    typeof taskId === "string" &&
    typeof at === "string";
  return known ? (value as DecisionEntry) : undefined;
}
