import type { SetupStep, SetupSteps, StepId } from "./setup-step.ts";

/** A row of a step, by what it is: an API host, a scope URL or a service's check. */
export interface StepRow {
  readonly kind: "api" | "scope" | "check";
  readonly key: string;
}

/**
 * How one step of the new setup differs from the old one.
 *
 * - `unchanged`: nothing the user did in Google is out of date.
 * - `lost-only`: rows went away, such as an unticked service's API. Nothing
 *   new has to be done, so the step stays done (design 3.3).
 * - `reopened`: the step gained rows, or a value the user typed or chose
 *   changed, or it's new to the setup. `newRows` are the rows Studio marks
 *   "New".
 */
export type StepChange =
  | { readonly step: StepId; readonly change: "unchanged" }
  | { readonly step: StepId; readonly change: "lost-only"; readonly lostRows: readonly StepRow[] }
  | {
      readonly step: StepId;
      readonly change: "reopened";
      readonly newRows: readonly StepRow[];
      readonly valuesChanged: boolean;
    };

/** A ticked service, as `SetupSteps` names it. */
type ServiceName = SetupSteps["services"][number];

/** What changed between two generated setups, step by step. */
export interface SetupChanges {
  /** One entry per step of the new setup, in its order. */
  readonly steps: readonly StepChange[];
  /** The steps that open again, so Studio can say "3 steps for …". */
  readonly reopened: readonly StepId[];
  /** Services ticked in the new setup only, so Studio can say "Add … to …". */
  readonly addedServices: readonly ServiceName[];
  /** Services ticked in the old setup only. */
  readonly removedServices: readonly ServiceName[];
}

/**
 * What a step holds that the user had to act on in Google. Links and numbers
 * are left out on purpose: a new project ID or step 4 being switched off
 * changes them, but nothing the user did goes out of date.
 */
interface Comparable {
  readonly rows: readonly StepRow[];
  readonly values: readonly string[];
}

function copyValues(step: SetupStep): string[] {
  return step.copyValues.map(({ id, value }) => `${id}=${value}`);
}

function comparable(step: SetupStep): Comparable {
  switch (step.id) {
    case "project":
      return { rows: [], values: [step.location, ...copyValues(step)] };
    case "apis":
      return { rows: step.apis.map((row) => ({ kind: "api", key: row.api })), values: [] };
    case "consent":
      return { rows: [], values: [step.audience, ...step.requiredTicks, ...copyValues(step)] };
    case "scopes":
      // The "all scopes" copy value follows from the rows, so it isn't compared.
      return { rows: step.scopes.map((row) => ({ kind: "scope", key: row.scope })), values: [] };
    case "client":
    case "credentials":
      return { rows: [], values: copyValues(step) };
    case "sign-in":
      // Google grants new scopes only at a new sign-in, and a new service's
      // check runs only after one, so both kinds of row reopen this step.
      return {
        rows: [
          ...step.scopesToGrant.map((row): StepRow => ({ kind: "scope", key: row.scope })),
          ...step.checks.map((check): StepRow => ({ kind: "check", key: check.service })),
        ],
        values: [step.beforeSignIn],
      };
  }
}

function rowsMissingFrom(rows: readonly StepRow[], other: readonly StepRow[]): StepRow[] {
  return rows.filter(
    (row) => !other.some((candidate) => candidate.kind === row.kind && candidate.key === row.key),
  );
}

function sameValues(before: readonly string[], after: readonly string[]): boolean {
  return before.length === after.length && before.every((value, index) => value === after[index]);
}

function compareStep(before: SetupStep | undefined, after: SetupStep): StepChange {
  const afterParts = comparable(after);
  if (before === undefined) {
    return { step: after.id, change: "reopened", newRows: afterParts.rows, valuesChanged: true };
  }
  const beforeParts = comparable(before);
  const newRows = rowsMissingFrom(afterParts.rows, beforeParts.rows);
  const valuesChanged = !sameValues(beforeParts.values, afterParts.values);
  if (newRows.length > 0 || valuesChanged) {
    return { step: after.id, change: "reopened", newRows, valuesChanged };
  }
  const lostRows = rowsMissingFrom(beforeParts.rows, afterParts.rows);
  if (lostRows.length > 0) {
    return { step: after.id, change: "lost-only", lostRows };
  }
  return { step: after.id, change: "unchanged" };
}

function servicesMissingFrom(
  services: readonly ServiceName[],
  other: readonly ServiceName[],
): ServiceName[] {
  return services.filter((service) => !other.some((candidate) => candidate.id === service.id));
}

/**
 * Compares the setup before and after the ticked services, the account type
 * or the scopes switch changed (design 3.3 and 3.6). Steps are matched by id,
 * so the comparison doesn't depend on their numbers.
 *
 * @param before - the setup the user's ticks were made for.
 * @param after - the setup generated from the new input.
 *
 * @example
 * const changes = compareSetups(setupSteps(oneService), setupSteps(twoServices));
 * changes.reopened; // ["apis", "scopes", "sign-in"]
 */
export function compareSetups(before: SetupSteps, after: SetupSteps): SetupChanges {
  const steps = after.steps.map((afterStep) =>
    compareStep(
      before.steps.find((beforeStep) => beforeStep.id === afterStep.id),
      afterStep,
    ),
  );
  return {
    steps,
    reopened: steps.filter((step) => step.change === "reopened").map((step) => step.step),
    addedServices: servicesMissingFrom(after.services, before.services),
    removedServices: servicesMissingFrom(before.services, after.services),
  };
}

/**
 * The ticks that stay after the setup changed: those of steps that are still
 * there and didn't open again. A tick on a step the new setup leaves out,
 * such as step 4 with the switch off, is dropped, so switching it back on
 * asks for the step again.
 *
 * @param changes - the result of `compareSetups`.
 * @param ticks - the ids of the steps the user had finished.
 */
export function ticksToKeep(changes: SetupChanges, ticks: readonly StepId[]): StepId[] {
  return ticks.filter((tick) =>
    changes.steps.some((step) => step.step === tick && step.change !== "reopened"),
  );
}
