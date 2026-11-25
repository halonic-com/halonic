import type { FailScore } from "./logistic-model.ts";

/** The writer an attempt ran on: the agent harness, the model and who served it. */
export interface WriterSetup {
  readonly agent: string;
  readonly model: string;
  readonly provider: string;
}

/**
 * A detector's answer: a score, or a refusal because the attempt ran on a
 * setup the coefficients were not fitted on.
 */
export type DetectorResult =
  | ({ readonly kind: "scored" } & FailScore)
  | { readonly kind: "refused"; readonly calibratedOn: WriterSetup };

/**
 * Scores only when `setup` is exactly the one the coefficients were fitted on.
 * The features (turns, tool calls, seconds, tokens) depend on the agent, the
 * model and its serving speed, so a score for any other setup means nothing.
 */
export function scoreIfCalibrated(
  setup: WriterSetup,
  calibratedOn: WriterSetup,
  score: () => FailScore,
): DetectorResult {
  if (!isSameSetup(setup, calibratedOn)) return { kind: "refused", calibratedOn };
  return { kind: "scored", ...score() };
}

function isSameSetup(a: WriterSetup, b: WriterSetup): boolean {
  return a.agent === b.agent && a.model === b.model && a.provider === b.provider;
}
