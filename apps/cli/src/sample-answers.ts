// Whether a run's answers came from the built-in test model, which Studio
// calls Sample answers (requirement `cli.sample-answers`, HAL-16187). The
// CLI says so where Studio shows its "Sample answers" chip, so a person who
// starts in a terminal doesn't read the test model's draft as a real reply.
// The fact is decided in `@halonicjs/app`, the same check Studio's
// `runModelPath` uses, so the CLI and the chip never disagree about a run;
// the words are the catalogue's.

import { ranOnTestModel, testModelsOf } from "@halonicjs/app";
import type { RunEvent } from "@halonicjs/events";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import { dimmed, type Phrase } from "./messages/phrase.ts";
import { runsMessages } from "./messages/runs.ts";

/**
 * Whether every model call of the run went to a provider whose file says
 * `type: mock`, whatever its id. A run that made no model call, one that
 * mixed the test model with a real one, and one that called a provider the
 * workspace no longer has are not on Sample answers.
 *
 * @example
 * onSampleAnswers(events, loaded); // true for Acme's run on the provider `mock`
 */
export function onSampleAnswers(events: readonly RunEvent[], workspace: LoadedWorkspace): boolean {
  const testModels = testModelsOf(workspace);
  return ranOnTestModel(events, (providerId) => testModels.has(providerId));
}

/**
 * The dim line after a run's step lines, and a blank line before it, that
 * says the test model wrote its answers; none for any other run.
 *
 * @example
 * sampleAnswersLines(events, loaded).map(plainText);
 * // ["", "On Sample answers: the built-in test model wrote this run's answers, not a real model."]
 */
export function sampleAnswersLines(
  events: readonly RunEvent[],
  workspace: LoadedWorkspace,
): Phrase[] {
  return onSampleAnswers(events, workspace)
    ? [[], dimmed(runsMessages.sampleAnswers().phrase)]
    : [];
}
