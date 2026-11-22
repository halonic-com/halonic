// The failed banners for the workspace's own config (HAL-14899, after HAL-14301): the CLI's two
// lines for the same run, what is wrong and what to do. A provider the workspace doesn't have is
// fixed in Models, so its banner offers Open Models, or on a phone says to fix it on the computer.
// A workflow step the run can't go on from is fixed in the workflow, so its banner offers
// **See the step**.

import type { RunFailure } from "@halonicjs/app/run-failure";
import { configFailureWords as words } from "../config-failure-words.ts";
import { danger, fixInModels } from "./danger-banner.ts";
import type { RunBanner } from "./run-page-model.ts";

/** The config causes `setupFailureOf` reads from the engine's cause (`run-failure-config.ts`). */
type ConfigFailure = Extract<
  RunFailure,
  {
    reason:
      | "unknown-provider"
      | "items-not-a-list"
      | "no-transition"
      | "task-without-agent"
      | "item-run-waits";
  }
>;

/** Whether a setup failure is one of the workspace's config causes. */
export function isConfigFailure(failure: RunFailure | undefined): failure is ConfigFailure {
  switch (failure?.reason) {
    case "unknown-provider":
    case "items-not-a-list":
    case "no-transition":
    case "task-without-agent":
    case "item-run-waits":
      return true;
    default:
      return false;
  }
}

/**
 * The banner for a config cause, naming the run's workflow and the step it failed in.
 *
 * @param phone Whether the page is a phone's, which can't open Models (microcopy 15.3).
 */
export function configBanner(
  failure: ConfigFailure,
  workflow: string,
  step: string,
  phone: boolean,
): RunBanner {
  switch (failure.reason) {
    case "unknown-provider":
      return fixInModels(
        [
          words.unknownProvider(workflow, step, failure.provider, failure),
          words.unknownProviderFix(failure.provider, failure),
        ],
        phone,
      );
    case "items-not-a-list":
      return inTheStep([
        words.itemsNotAList(workflow, step, failure.items, failure.gives),
        words.itemsNotAListFix(failure.items, failure.gives),
      ]);
    case "no-transition":
      return inTheStep([
        words.noTransition(workflow, step, failure),
        words.noTransitionFix(failure),
      ]);
    case "task-without-agent":
      return inTheStep([words.taskWithoutAgent(workflow, step), words.taskWithoutAgentFix]);
    case "item-run-waits":
      return inTheStep([
        words.itemRunWaits(workflow, step, failure.item),
        words.itemRunWaitsFix(step, failure.workflow),
      ]);
  }
}

/** A cause the workflow's step holds: its lines, with **See the step**. */
function inTheStep(lines: readonly string[]): RunBanner {
  return danger(lines, { fixes: [{ kind: "see-step" }] });
}
