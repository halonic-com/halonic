/**
 * The guard in front of the retry policy (HAL-17073 step 3, requirement
 * `retry-detectors.routing-guard`): a task in an Opus-only area or on a
 * repository that isn't public never goes to an open model; it stays on Opus.
 *
 * The guard fails closed. A repository whose visibility isn't known counts as
 * private, so missing data can only keep a task on Opus, never send it out.
 */

/** A repository's visibility, as GitHub reports it, or `unknown` when nobody said. */
export type RepositoryVisibility = "public" | "private" | "internal" | "unknown";

/** What the guard reads about the task a writer run is for. */
export interface RoutingTask {
  /** The task's label names, as written; case and surrounding spaces don't matter. */
  readonly labels: readonly string[];
  /** The visibility of every repository the run may read or change. */
  readonly repositories: readonly RepositoryVisibility[];
}

/** Why a task stays on Opus. */
export type OpusOnlyReason = "opus-only-area" | "non-public-repository" | "no-repository";

/** The guard's answer: open models may take the task, or it stays on Opus and why. */
export type RoutingDecision =
  | { readonly route: "open-model-allowed" }
  | { readonly route: "opus"; readonly reasons: readonly OpusOnlyReason[] };

/**
 * Labels that keep a task on Opus by themselves: the `opus-only` tag and the
 * triage step's risk areas. The same list as Paperclip's effort table
 * (`opusOnlyAreas` in tooling/paperclip) and the engine's run effort; the
 * layer rules keep core from importing either, so a change goes to all three.
 */
export const opusOnlyLabels: ReadonlySet<string> = new Set([
  "opus-only",
  "security",
  "trust",
  "sandbox",
  "schema",
  "secrets",
  "sign-in",
  "oauth",
  "keychain",
]);

/** Decides whether an open model may work on `task`; anything doubtful stays on Opus. */
export function routeForTask(task: RoutingTask): RoutingDecision {
  const reasons: OpusOnlyReason[] = [];
  if (hasOpusOnlyLabel(task.labels)) reasons.push("opus-only-area");
  if (task.repositories.length === 0) reasons.push("no-repository");
  else if (task.repositories.some((visibility) => visibility !== "public")) {
    reasons.push("non-public-repository");
  }
  return reasons.length === 0 ? { route: "open-model-allowed" } : { route: "opus", reasons };
}

function hasOpusOnlyLabel(labels: readonly string[]): boolean {
  return labels.some((label) => opusOnlyLabels.has(label.trim().toLowerCase()));
}
