import type { RequirementFile } from "./requirement-files.ts";
import type { Step } from "./runner.ts";

/** The click test's own folder and workflow: a change there can move any step. */
const suiteFolder = "packages/testing/studio-click-test/";
const suiteWorkflow = ".github/workflows/studio-preview.yml";

/** The steps a build runs, and the ones it leaves out because its change didn't touch them. */
export interface StepChoice {
  readonly run: readonly Step[];
  readonly notAffected: readonly Step[];
}

/**
 * The steps a build runs (HAL-18716 point 3): the short check, each step whose
 * requirement files, the folders they live in or its own step file the change
 * touched, and the steps those need. A change to the rest of the suite or to
 * its workflow runs every step, and so does a build without a list of changes
 * (`changed` undefined: the nightly run, or a run by hand).
 */
export function chooseSteps(
  steps: readonly Step[],
  changed: readonly string[] | undefined,
  requirements: ReadonlyMap<string, RequirementFile>,
): StepChoice {
  if (changed === undefined || changed.some((path) => changesSuite(path, steps))) {
    return { run: steps, notAffected: [] };
  }
  const chosen = new Set(
    steps
      .filter((step) => step.shortCheck === true || touches(step, changed, requirements))
      .map((step) => step.id),
  );
  // A step needs only earlier steps, so one pass from the last step adds whole chains.
  for (const step of [...steps].reverse()) {
    if (chosen.has(step.id)) for (const id of step.needs ?? []) chosen.add(id);
  }
  return {
    run: steps.filter((step) => chosen.has(step.id)),
    notAffected: steps.filter((step) => !chosen.has(step.id)),
  };
}

/** Whether a changed path is the workflow or suite code that isn't one step's own file. */
function changesSuite(path: string, steps: readonly Step[]): boolean {
  if (path === suiteWorkflow) return true;
  if (!path.startsWith(`${suiteFolder}src/`) || path.endsWith(".test.ts")) return false;
  return !steps.some((step) => path === stepFile(step));
}

function stepFile(step: Step): string {
  return `${suiteFolder}src/steps/${step.id}.ts`;
}

function touches(
  step: Step,
  changed: readonly string[],
  requirements: ReadonlyMap<string, RequirementFile>,
): boolean {
  const homes = step.requirements.map((id) => homeOf(requirements.get(id)));
  return changed.some(
    (path) => path === stepFile(step) || homes.some((home) => path.startsWith(home)),
  );
}

/**
 * The folder that holds a requirement's `requirements/` folder, such as
 * `packages/studio/features/messenger/`: the code the requirement is about.
 * An unknown requirement gives "", which every path starts with, so a step
 * that names one runs rather than being left out.
 */
function homeOf(file: RequirementFile | undefined): string {
  if (file === undefined) return "";
  return file.path.slice(0, file.path.lastIndexOf("requirements/"));
}
