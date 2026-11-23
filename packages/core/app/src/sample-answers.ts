// Whether a run's answers came from the built-in test model, which Studio and
// the CLI call Sample answers (requirements `runs.sample-chip` and
// `cli.sample-answers`). Both read it from the run's own log, not the
// workspace's current model, so the answer stays right after a real model is
// picked. Studio's chip and the CLI's line decide it here, so they never
// disagree about a run (HAL-16228).

import type { RunEvent } from "@halonicjs/events";
import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";

/**
 * The ids of the workspace's providers whose file says `type: mock`, the
 * built-in test model, whatever their id.
 *
 * @example
 * testModelsOf(loaded); // Set { "mock" } for Acme
 */
export function testModelsOf(workspace: LoadedWorkspace): ReadonlySet<string> {
  return new Set(
    filesOf(workspace, "provider").flatMap(({ value }) =>
      value.type === "mock" ? [value.id] : [],
    ),
  );
}

/**
 * Whether every model call of the run went to a provider `isTestModel` says
 * is the test model. A run that made no model call, and one that mixed the
 * test model with a real one, are not on Sample answers.
 *
 * @example
 * const testModels = testModelsOf(loaded);
 * ranOnTestModel(events, (providerId) => testModels.has(providerId)); // true for Acme's run on `mock`
 */
export function ranOnTestModel(
  events: readonly RunEvent[],
  isTestModel: (providerId: string) => boolean,
): boolean {
  let calledAModel = false;
  for (const event of events) {
    if (event.type !== "llm.request") continue;
    if (!isTestModel(event.provider)) return false;
    calledAModel = true;
  }
  return calledAModel;
}
