import { changeKinds, type Reading, riskAreas, uiOrLogic } from "./reading.ts";

/**
 * The thin-spec score (HAL-17076): the chance that a task's text leaves out
 * the result it will be checked against, from Haiku's reading. A port of
 * halonic-com/variant-router `thin_spec.py`: the same 24 features, scaled and
 * weighted by a logistic regression fitted on the trial's 460 tasks.
 */

/** The trial's threshold: a score above it flags the task (AUC 0.76, flags about 42%). */
export const flagThreshold = 0.5;

/** A fitted model, as variant-router exports it: one mean, scale and weight per feature. */
export interface ThinSpecModel {
  /** Where the weights came from, such as the variant-router commit. */
  readonly source: string;
  readonly mean: readonly number[];
  readonly scale: readonly number[];
  readonly weights: readonly number[];
  readonly intercept: number;
}

/** The number of features `featureRow` makes; a model must have this many of each. */
export const featureCount = 24;

function flag(value: boolean): number {
  return value ? 1 : 0;
}

/** The reading as the trial's feature row (`hk_row`), in the same order. */
export function featureRow(reading: Reading): number[] {
  const kinds = changeKinds.filter((kind) => kind !== "refactor");
  return [
    reading.specPrecision,
    reading.ambiguity,
    Math.log1p(Math.max(0, reading.expectedFiles)),
    Math.log1p(Math.max(0, reading.expectedPackages)),
    flag(reading.needsNewApiOrType),
    flag(reading.existingTestsMustChange),
    reading.difficulty,
    reading.cheapModelFit,
    flag(reading.language === "tsx_react"),
    reading.riskAreas.length,
    ...kinds.map((kind) => flag(reading.changeKind === kind)),
    ...uiOrLogic.map((side) => flag(reading.uiVsLogic === side)),
    ...riskAreas.map((risk) => flag(reading.riskAreas.includes(risk))),
  ];
}

/** Whether a model has one mean, scale and weight per feature and no zero scale. */
export function usableModel(model: ThinSpecModel): boolean {
  const lengths = [model.mean.length, model.scale.length, model.weights.length];
  return lengths.every((length) => length === featureCount) && !model.scale.includes(0);
}

/** The score, between 0 and 1. */
export function thinSpecScore(model: ThinSpecModel, reading: Reading): number {
  const row = featureRow(reading);
  const logit = row.reduce(
    (sum, value, index) =>
      sum +
      (model.weights[index] ?? 0) *
        ((value - (model.mean[index] ?? 0)) / (model.scale[index] ?? 1)),
    model.intercept,
  );
  return 1 / (1 + Math.exp(-logit));
}
