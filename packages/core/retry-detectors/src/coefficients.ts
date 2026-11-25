/**
 * The detectors' coefficients: the one file to replace when they are
 * retrained. Written from variant-router's exports (`export_halonic_detectors.py`).
 *
 * Current export: variant-router `7d5cc47`, fitted on live opencode /
 * deepseek-v4.1-flash runs (25 Nov 2026). The 6- and 10-minute models stay
 * untrained placeholders (all coefficients 0: every attempt scores 0.5 and
 * none is flagged): on live runs alone they scored a held-out AUC of 0.68 and
 * 0.50, too weak to act on until there are more live runs. Callers check
 * `trained` before they act on a score.
 */
import type { WriterSetup } from "./calibration.ts";
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

/** A known attempt and the score the Python model gave it; the tests check every one. */
export interface SelftestCase {
  readonly features: FeatureValues;
  readonly pFail: number;
}

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

/** The only setup every model here was fitted on; the detectors refuse attempts from any other. */
export const calibratedOn: WriterSetup = {
  agent: "opencode",
  model: "deepseek-v4.1-flash",
  provider: "deepinfra-fp8",
};

/** End-of-run detector; report threshold 0.5 (catches 70–73% of failures at 24–26% false flags). */
export const endOfRunModel: TrainedModel = {
  trained: true,
  trainedOn: { runs: 1016, tasks: 294, heldoutAuc: 0.7847 },
  features: endOfRunFeatureNames,
  logged: [
    "agent_seconds",
    "changed_lines",
    "edit",
    "grep",
    "prompt_chars",
    "read",
    "shell",
    "turns",
    "write",
  ],
  logFloor: 0,
  mean: [
    3.72660892, 3.60438687, 2.2808059, 1.94006801, 0.45507343, 0.84254434, 4.75148778, 5.73725766,
    0.01377953, 0.00885827, 0.21850394, 6.87348721,
  ],
  scale: [
    0.72042426, 0.77963765, 1.21313907, 1.22434766, 0.5843498, 0.99848334, 1.04197452, 0.66373595,
    0.11657466, 0.09370058, 0.41323113, 0.50492919,
  ],
  coef: [
    0.5555798, -0.17927861, 0.15013515, 0.42859601, 0.10032071, 0.02133088, -0.18586401, 0.44585838,
    0.55429584, 0.63532762, -0.48445275, -0.11009868,
  ],
  intercept: -0.09731875,
  threshold: 0.5,
};

/** In-run detectors, one per checkpoint; every tag is logged with a floor of -0.99, as in training. */
export const inRunModels: Readonly<Record<CheckpointMinute, TrainedModel>> = {
  3: {
    trained: true,
    trainedOn: { runs: 168, tasks: 81, heldoutAuc: 0.7201 },
    features: inRunFeatureNames,
    logged: inRunFeatureNames,
    logFloor: -0.99,
    mean: [
      3.40162357, 5.07483245, 3.40220761, 0.38783235, 0.57211972, 0.9122641, 0.71000928, 1.11296847,
      3.17335097, 0.53701927, 0.02958222, 0.33832184, -3.84826771, -0.02741173, 0.41400322, 0.0,
      0.0, 11.30903551, 9.49176261,
    ],
    scale: [
      0.27752929, 0.23143378, 0.57786677, 0.34410895, 4.60591431, 0.88770366, 0.67142441, 0.2976995,
      2.07237095, 0.62178965, 0.15790089, 0.34647534, 1.85402486, 0.35423758, 0.50004062, 1.0, 1.0,
      0.40112129, 0.36938977,
    ],
    coef: [
      -0.17518699, 0.23270625, -0.33201446, 0.15308253, 0.31972255, 0.05181616, -1.04373699,
      0.17167707, -0.21690072, 0.24210717, -0.23326205, -0.0298245, -0.18157573, 0.12110896,
      -0.06377274, 0.0, 0.0, 0.14935663, 1.08729437,
    ],
    intercept: -0.10694947,
    threshold: 0.5,
  },
  6: untrained(inRunFeatureNames, inRunFeatureNames, -0.99),
  10: untrained(inRunFeatureNames, inRunFeatureNames, -0.99),
};
