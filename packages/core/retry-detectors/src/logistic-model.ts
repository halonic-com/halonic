/**
 * A frozen logistic regression, as variant-router exports it: a standard
 * scaler (mean, scale) in front of one coefficient per feature. Feature names
 * keep the exporter's snake_case so a retrained file pastes in unchanged.
 */
export interface LogisticModel {
  /** The features in coefficient order. */
  readonly features: readonly string[];
  /** Features that go through `log1p(max(logFloor, value))` before scaling. */
  readonly logged: readonly string[];
  /** The floor under a logged value: 0 for counts, just above -1 for tags that use -1 for "not yet". */
  readonly logFloor: number;
  readonly mean: readonly number[];
  readonly scale: readonly number[];
  readonly coef: readonly number[];
  readonly intercept: number;
  /** A score above this flags the attempt as a likely failure. */
  readonly threshold: number;
}

/** A failure score and whether it crosses the model's threshold. */
export interface FailScore {
  /** Probability that the attempt fails its checks, 0 to 1. */
  readonly pFail: number;
  readonly flagged: boolean;
}

/** The feature values a model reads, by feature name; a missing name counts as 0. */
export type FeatureValues = Readonly<Record<string, number>>;

/** Scores feature values with a frozen model. */
export function scoreWith(model: LogisticModel, values: FeatureValues): FailScore {
  let z = model.intercept;
  model.features.forEach((name, i) => {
    const value = modelInput(model, name, values[name] ?? 0);
    z += ((model.coef[i] ?? 0) * (value - (model.mean[i] ?? 0))) / (model.scale[i] || 1);
  });
  const pFail = 1 / (1 + Math.exp(-z));
  return { pFail, flagged: pFail > model.threshold };
}

function modelInput(model: LogisticModel, name: string, value: number): number {
  const finite = Number.isFinite(value) ? value : 0;
  return model.logged.includes(name) ? Math.log1p(Math.max(model.logFloor, finite)) : finite;
}
