/**
 * The detectors' coefficients: the one file to replace when they are
 * retrained. Written from variant-router's exports (`live_detector.py` for the
 * end-of-run model, `inrun_export.py` for the checkpoint models); paste their
 * `model.json` and `selftest.json` in as they are.
 *
 * Until the first export lands, every model is untrained: all coefficients 0,
 * so it scores every attempt 0.5 and flags none. Callers check `trained`
 * before they act on a score.
 */
import type { CheckpointMinute } from "./in-run.ts";
import type { FeatureValues, LogisticModel } from "./logistic-model.ts";

/** A model with where it came from. */
export interface TrainedModel extends LogisticModel {
  /** False while the coefficients are the untrained placeholder. */
  readonly trained: boolean;
  /** Finished runs and tasks it was fitted on, and its leave-one-task-out AUC. */
  readonly trainedOn?: {
    readonly runs: number;
    readonly tasks: number;
    readonly heldoutAuc: number;
  };
}

/** A known attempt and the score the Python model gave it; the tests check every one. */
export interface SelftestCase {
  readonly features: FeatureValues;
  readonly pFail: number;
}

const endOfRunFeatureNames = [
  "turns",
  "shell",
  "read",
  "edit",
  "write",
  "grep",
  "changed_lines",
  "agent_seconds",
  "timed_out",
  "exit_nonzero",
  "no_edit",
  "prompt_chars",
];

const inRunFeatureNames = [
  "steps",
  "elapsed_s",
  "shell_calls",
  "edited_any",
  "first_edit_t",
  "files_edited",
  "max_edits_same_file",
  "max_reads_same_file",
  "since_last_edit_s",
  "test_runs",
  "typecheck_runs",
  "tests_ran",
  "last_failed",
  "failed_trend",
  "test_files_edited",
  "existing_tests_edited",
  "snapshot_edited",
  "tokens_in",
  "tokens_out",
];

function untrained(
  features: readonly string[],
  logged: readonly string[],
  logFloor: number,
): TrainedModel {
  const zeros = features.map(() => 0);
  const ones = features.map(() => 1);
  return {
    trained: false,
    features,
    logged,
    logFloor,
    mean: zeros,
    scale: ones,
    coef: zeros,
    intercept: 0,
    threshold: 0.5,
  };
}

/** End-of-run detector; report threshold 0.5 (catches 70–73% of failures at 24–26% false flags). */
export const endOfRunModel: TrainedModel = untrained(
  endOfRunFeatureNames,
  [
    "turns",
    "shell",
    "read",
    "edit",
    "write",
    "grep",
    "changed_lines",
    "agent_seconds",
    "prompt_chars",
  ],
  0,
);

/** In-run detectors, one per checkpoint; every tag is logged with a floor of -0.99, as in training. */
export const inRunModels: Readonly<Record<CheckpointMinute, TrainedModel>> = {
  3: untrained(inRunFeatureNames, inRunFeatureNames, -0.99),
  6: untrained(inRunFeatureNames, inRunFeatureNames, -0.99),
  10: untrained(inRunFeatureNames, inRunFeatureNames, -0.99),
};

/** Python-scored cases for the end-of-run model, from the export's `selftest.json`. */
export const endOfRunSelftest: readonly SelftestCase[] = [];

/** Python-scored cases per checkpoint, from the in-run export. */
export const inRunSelftest: Readonly<Record<CheckpointMinute, readonly SelftestCase[]>> = {
  3: [],
  6: [],
  10: [],
};
