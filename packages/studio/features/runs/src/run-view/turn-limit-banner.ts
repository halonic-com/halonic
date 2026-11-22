// The failed banner for an agent that used its model call limit (microcopy 15.3, HAL-15504): the
// run's cause `engine.turn-limit` names the agent and its limit, which core reads as `turn-limit`
// facts (`runFailureOf`), the facts `halonic run` prints its line from (HAL-15331). So a run reads
// the same in both (E4), with **See the step**, where the agent's model calls show, before Run again.

import { runFailureOf } from "@halonicjs/app/run-failure";
import type { RunSummary } from "@halonicjs/events";
import { failureWords } from "../failure-words.ts";
import { danger } from "./danger-banner.ts";
import type { RunBanner, RunPageContext } from "./run-page-model.ts";

/** The cause code the engine gives a run whose agent used its model call limit (HAL-15331). */
const turnLimitCode = "engine.turn-limit";

/**
 * "*Sorter* used all *6* model calls in the step *Classify* without finishing.", with the agent as
 * its file names it, then "Its last calls to *search_docs* returned nothing." only when the facts
 * name that tool, as the CLI adds it.
 *
 * @returns `undefined` for any other run, so the page keeps its other banners.
 */
export function turnLimitBanner(
  summary: RunSummary,
  context: RunPageContext,
  step: string,
): RunBanner | undefined {
  // Only this cause is read: `runFailureOf` throws on a reason it doesn't know, as a newer
  // engine's log may hold, and the page must still show its general banner then. The summary
  // holds the cause, so this banner needs no log.
  const { cause } = summary;
  if (cause?.code !== turnLimitCode) {
    return undefined;
  }
  const failure = runFailureOf({ error: summary.error ?? "", cause }, undefined);
  if (failure?.reason !== "turn-limit") {
    return undefined;
  }
  // As its file names it; an agent the workspace no longer has keeps its id.
  const agent = context.agentName?.(failure.agent) ?? failure.agent;
  const lines = [failureWords.turnLimit(agent, failure.turns, step)];
  if (failure.emptyCallsTo !== undefined) {
    lines.push(failureWords.turnLimitEmptyCalls(failure.emptyCallsTo));
  }
  return danger([lines.join(" ")], { fixes: [{ kind: "see-step" }] });
}
