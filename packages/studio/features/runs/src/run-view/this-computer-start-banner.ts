// The failed banner for `this-computer-start-failed` (HAL-15203, item 1 of Iris's flow check C548):
// an agent that runs on this computer without the sandbox, by the person's choice, whose launcher
// refused to start it. It says what `halonic run` says on its line 1
// (`cli.run-failed-this-computer-start`), from the same facts (`runFailureOf`), so a CLI run shown
// in Studio reads the same in both, but leaves the launcher's reason to Copy details, as the CLI
// leaves it to `--debug` on line 2 (C566, row 11).

import { failedStartOf, runFailureOf } from "@halonicjs/app/run-failure";
import type { RunEvent, RunSummary } from "@halonicjs/events";
import { failureWords } from "../failure-words.ts";
import { withDetails } from "./danger-banner.ts";
import type { RunBanner, RunPageContext } from "./run-page-model.ts";

/**
 * The agent of the failed step, as its file names it, with **Copy details** and no **Run again**:
 * the same launcher would refuse it the same way. Copy details holds the launcher's reason, which
 * the engine logs as `run.failed`'s error (`engine.this-computer-start-failed`).
 *
 * @param log The run's log, for the step's own `sandbox.started`, which names the agent.
 * @returns `undefined` until the log is read, and for a log without that step's start, so the page
 *   keeps its general banner, as the CLI keeps its general lines.
 */
export function thisComputerStartBanner(
  summary: RunSummary,
  log: readonly RunEvent[] | undefined,
  context: RunPageContext,
  workflow: string,
  step: string,
): RunBanner | undefined {
  const failed = log?.findLast((event) => event.type === "run.failed");
  if (log === undefined || failed === undefined) {
    return undefined;
  }
  const failure = runFailureOf(failed, undefined, failedStartOf(log, failed));
  if (failure?.reason !== "this-computer-start-failed") {
    return undefined;
  }
  // As its file names it; an agent the workspace no longer has keeps its id.
  const agent = context.agentName?.(failure.agent) ?? failure.agent;
  return withDetails(failureWords.thisComputerStartFailed(workflow, step, agent), summary, {
    noRunAgain: true,
  });
}
