// Whether a run's answers came from the built-in test model, which Studio
// calls Sample answers (requirement `cli.sample-answers`, HAL-16187). The
// CLI says so where Studio shows its "Sample answers" chip, so a person who
// starts in a terminal doesn't read the test model's draft as a real reply.
// Like Studio's `runModelPath`, it reads the run's own log, not the
// workspace's current model, so the answer stays right after a real model
// is picked. Only the fact is decided here; the words are the catalogue's.

import type { RunEvent } from "@halonicjs/events";
import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";
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
  const testModels = new Set(
    filesOf(workspace, "provider")
      .filter(({ value }) => value.type === "mock")
      .map(({ value }) => value.id),
  );
  let calledAModel = false;
  for (const event of events) {
    if (event.type !== "llm.request") continue;
    if (!testModels.has(event.provider)) return false;
    calledAModel = true;
  }
  return calledAModel;
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
