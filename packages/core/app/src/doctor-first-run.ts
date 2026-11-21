// The two lines Studio's Check this computer adds for a first run
// (first-run-progress 4.2, HAL-13406): Default model and Last run, as facts
// with ids, and the action each line offers. `halonic doctor` doesn't print
// them, and they don't count in its summary: a Last run repeats a cause, and
// a cloud `default` under Local only is already one of the Workspace line's
// file problems. Studio counts causes, not lines, by the cause ids here.

import type { DoctorLine } from "./doctor-checks.ts";
import type { AliasProvider, ModelsLine } from "./doctor-models-line.ts";
import type { DoctorProvider, DoctorReport } from "./doctor-service.ts";
import type { TimedOutLine } from "./doctor-time-limit.ts";
import type { RunFailure } from "./run-failure-facts.ts";

/** Each line's stable id: its `check`. */
export type DoctorLineId =
  | "workspace"
  | "models"
  | "secrets"
  | "sandbox"
  | "mxc"
  | "no-sandbox"
  | "harnesses"
  | "node"
  | "network"
  | "disk"
  | "default-model"
  | "last-run";

/**
 * A cause: the id of the line it belongs to, then its reason, such as
 * "models.no-key" or "default-model.local-only". Studio points a line at the
 * line its cause belongs to, and counts that cause once.
 */
export type DoctorCause = `${DoctorLineId}.${string}`;

/** Any line of the report, the two first-run lines included. */
export type AnyDoctorLine = NonNullable<DoctorReport[Exclude<keyof DoctorReport, "summary">]>;

/** What Studio offers on a line, by id; it picks the button from this, never from the words. */
export type DoctorAction =
  | "review-trust"
  | "open-models"
  | "test-again"
  | "pick-model"
  | "open-run";

/** The alias the demo's agents use, and the Default model line names. */
export const defaultAlias = "default";

/** Where `default` points: the built-in test model, or a provider of the workspace. */
export type DefaultModelTarget =
  | { uses: "sample-answers" }
  | {
      uses: "provider";
      provider: string;
      /** The name a person reads, such as "Anthropic". */
      name: string;
      /** A model server on this computer, such as Ollama, rather than a cloud provider. */
      local: boolean;
    };

/** Why `default` points at a model that can't be used yet. */
export type DefaultModelCause = "models.no-key" | "models.unreachable" | "default-model.local-only";

/** The Default model line. */
export interface DefaultModelLine extends DoctorLine {
  check: "default-model";
  target: DefaultModelTarget;
  /** Left out when the model can be used. */
  cause?: DefaultModelCause;
}

/** What {@link defaultModelLine} reads. */
export interface DefaultModelInput {
  aliases: readonly AliasProvider[];
  providers: readonly DoctorProvider[];
  /** The Models line, as the report has it. */
  models: ModelsLine | TimedOutLine<"models"> | undefined;
  /** Whether `workspace.yaml` sets `privacy.localOnly: true`. */
  localOnly: boolean;
}

/**
 * The Default model line (requirement `app.doctor-default-model`): where
 * `default` points, and why that model can't be used yet. Local only comes
 * first, because then the run is refused before a key or a server matters.
 * A Models line that ran over says nothing about the provider, so then no
 * cause is named.
 *
 * @returns `undefined` when the workspace has no `default` alias, or its provider wasn't given
 *
 * @example
 * defaultModelLine({ aliases: [{ alias: "default", provider: "anthropic" }], providers: [anthropic], models, localOnly: true });
 * // { check: "default-model", status: "failed",
 * //   target: { uses: "provider", provider: "anthropic", name: "Anthropic", local: false },
 * //   cause: "default-model.local-only" }
 */
export function defaultModelLine(input: DefaultModelInput): DefaultModelLine | undefined {
  const alias = input.aliases.find((one) => one.alias === defaultAlias);
  const provider = input.providers.find((one) => one.provider === alias?.provider);
  if (alias === undefined || provider === undefined) return undefined;
  if (provider.runs === "without-a-key" && provider.testModel === true) {
    return { check: "default-model", status: "ok", target: { uses: "sample-answers" } };
  }
  const local = provider.runs === "on-this-computer";
  const target: DefaultModelTarget = {
    uses: "provider",
    provider: provider.provider,
    name: provider.name,
    local,
  };
  const cause = defaultModelCause(provider, input, local);
  return cause === undefined
    ? { check: "default-model", status: "ok", target }
    : { check: "default-model", status: "failed", target, cause };
}

function defaultModelCause(
  provider: DoctorProvider,
  { models, localOnly }: DefaultModelInput,
  local: boolean,
): DefaultModelCause | undefined {
  if (localOnly && !local) return "default-model.local-only";
  if (models === undefined || "timedOut" in models) return undefined;
  for (const problem of models.problems) {
    if (problem.provider !== provider.provider) continue;
    if (problem.problem === "unreachable") return "models.unreachable";
    if (problem.alias === defaultAlias) return "models.no-key";
  }
  return undefined;
}

/** The failed run the Last run line names, as the host read it from the run's log. */
export interface LastRunInput {
  runId: string;
  /** The step it stopped at, counted from 1, and how many the run has. */
  step: number;
  steps: number;
  /** For the screen only: the report never holds a step's or an agent's name (first-run-progress 4.3). */
  stepName: string;
  agentName?: string;
  /** How long it ran before it stopped. */
  durationMs: number;
  /** From `runFailureOf`; `undefined` for a cancelled run, which gets no line. */
  failure: RunFailure | undefined;
}

/** The Last run line: only for a run that failed. */
export interface LastRunLine extends DoctorLine {
  check: "last-run";
  status: "failed";
  runId: string;
  step: number;
  steps: number;
  stepName: string;
  agentName?: string;
  durationMs: number;
  failure: RunFailure;
  cause: DoctorCause;
  /** The line above that shows the same cause, so Studio draws this one as info and counts the cause once. */
  causeShownOn?: DoctorLineId;
}

/**
 * The Last run line (requirement `app.doctor-last-run`), with its cause id,
 * and the line above that already shows that cause, when the report has it.
 *
 * @returns `undefined` for a cancelled run
 *
 * @example
 * lastRunLine({ runId: "r1", step: 2, steps: 3, stepName: "Write reply", durationMs: 6800,
 *   failure: { reason: "no-key", provider: "Anthropic", secret: "anthropic-key", alias: "default" } }, report);
 * // { check: "last-run", status: "failed", …, cause: "models.no-key", causeShownOn: "models" }
 */
export function lastRunLine(
  run: LastRunInput,
  report: Pick<DoctorReport, "models" | "sandbox" | "defaultModel">,
): LastRunLine | undefined {
  const { failure, ...facts } = run;
  if (failure === undefined) return undefined;
  const cause = runCause(failure);
  const shownOn = causeShownOn(cause, failure, report);
  return {
    check: "last-run",
    status: "failed",
    ...facts,
    failure,
    cause,
    ...(shownOn === undefined ? {} : { causeShownOn: shownOn }),
  };
}

/** The cause id of a failed run: a doctor line's own cause where it has one, else `last-run.<reason>`. */
export function runCause(failure: RunFailure): DoctorCause {
  switch (failure.reason) {
    case "no-key":
      return "models.no-key";
    case "model-unreachable":
      // The doctor asks only a server on this computer; a cloud one it never calls.
      return failure.local ? "models.unreachable" : "last-run.model-unreachable";
    case "local-only":
      return failure.alias === defaultAlias ? "default-model.local-only" : "last-run.local-only";
    case "sandbox-not-ready":
      return `sandbox.${failure.code}`;
    default:
      return `last-run.${failure.reason}`;
  }
}

/** The line above that shows this very failure: the same alias without a key, the same server, or the sandbox with the same reason. */
function causeShownOn(
  cause: DoctorCause,
  failure: RunFailure,
  report: Pick<DoctorReport, "models" | "sandbox" | "defaultModel">,
): DoctorLineId | undefined {
  const { models, sandbox, defaultModel } = report;
  // The line the cause belongs to, never one that only repeats it, as Default model does a Models cause.
  if (cause === "default-model.local-only") {
    return defaultModel?.cause === cause ? "default-model" : undefined;
  }
  if (failure.reason === "no-key" || (failure.reason === "model-unreachable" && failure.local)) {
    const problems = models === undefined || "timedOut" in models ? [] : models.problems;
    const shown = problems.some((one) =>
      one.problem === "no-key"
        ? failure.reason === "no-key" && one.alias === failure.alias
        : failure.reason === "model-unreachable" && one.address === failure.address,
    );
    return shown ? "models" : undefined;
  }
  // Only the same reason: a sandbox that broke differently since the run is a different cause.
  if (failure.reason !== "sandbox-not-ready" || sandbox.status !== "failed") return undefined;
  if ("timedOut" in sandbox) return undefined;
  return sandbox.reason === failure.code ? "sandbox" : undefined;
}

/**
 * The actions a line offers (first-run-progress 4.2's Button column):
 * Review for a workspace that isn't trusted, Test again on the Models line,
 * with Open Models while it has a problem, Pick another model and Open the
 * run. Every other line offers none: Halonic fixes nothing itself (4.4).
 *
 * @example
 * doctorLineActions({ check: "workspace", status: "warning", name: "acme", trust: "new" }); // ["review-trust"]
 */
export function doctorLineActions(line: AnyDoctorLine): DoctorAction[] {
  if ("timedOut" in line) return [];
  switch (line.check) {
    case "workspace":
      return line.trust === "trusted" || line.trust === "not-needed" ? [] : ["review-trust"];
    case "models":
      return line.status === "ok" ? ["test-again"] : ["test-again", "open-models"];
    case "default-model":
      return line.target.uses === "sample-answers" ? [] : ["pick-model"];
    case "last-run":
      return ["open-run"];
    default:
      return [];
  }
}
