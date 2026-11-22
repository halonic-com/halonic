// The banner of a run whose `workflow` or for-each step failed because the child run it started
// failed (HAL-15729). The parent's own `run.failed` holds only the engine's text, so its banner
// would say Halonic can't tell the cause. The child's log holds the cause, so the banner is the
// child's own, with the parent's step leading its first line and **Open run** to the child, as
// `halonic runs show` ends such a run (`cli.commands.runs.show-child-failure`).

import { shortRunId } from "@halonicjs/app";
import type { RunEvent, RunSummary } from "@halonicjs/events";
import { failureWords } from "../failure-words.ts";
import { currentStepName } from "../list/run-row.ts";
import { runPageWords } from "../run-words.ts";
import { causeBanner } from "./failure-banner.ts";
import {
  type BannerFix,
  type RunBanner,
  type RunPageContext,
  runBanner,
} from "./run-page-model.ts";

/** The child run a failed run's step failed with, read with its log and its own page context. */
export interface FailedChildView {
  /** The for-each item it ran for, 0-based; `undefined` for a `workflow` step. */
  readonly item: number | undefined;
  readonly summary: RunSummary;
  readonly log: readonly RunEvent[];
  /** The child's page context: its own workflow, hub and models. */
  readonly context: RunPageContext;
}

/**
 * The parent's banner from its failed child's: the child's banner by cause, or its general banner,
 * with "Topics failed in the step Each: the run it started for item 2" in place of the child's
 * workflow, then **Open run** to the child (`runs.run-view.failed-child-run`). A child banner whose
 * line doesn't name its workflow, such as "Halonic couldn't reach Ollama …", gets a line before it
 * that names the parent's step and the child's. `undefined` for a child that was cancelled, so the
 * parent keeps its own banner.
 */
export function childFailureBanner(
  parent: RunSummary,
  parentContext: RunPageContext,
  child: FailedChildView,
  phone: boolean,
): RunBanner | undefined {
  const lead = failureWords.startedRun(
    parentContext.workflow?.name ?? parent.workflowId,
    currentStepName(parent, parentContext.workflow),
    child.item,
  );
  const context: RunPageContext = {
    ...child.context,
    workflow: {
      name: lead,
      stepDescription: (stateId) => child.context.workflow?.stepDescription(stateId),
    },
  };
  const own =
    causeBanner(child.summary, child.log, context, phone) ??
    runBanner({ summary: child.summary }, context);
  if (own?.kind !== "callout") {
    return undefined;
  }
  const [first = ""] = own.lines;
  const lines = first.includes(lead)
    ? own.lines
    : [
        failureWords.startedRunFailedIn(lead, currentStepName(child.summary, context.workflow)),
        ...own.lines,
      ];
  const { action: _childAction, noRunAgain: _childNoRunAgain, ...buttons } = own;
  return {
    ...buttons,
    lines,
    fixes: outsideTheSteps(own.fixes),
    links: outsideTheSteps(own.links),
    action: {
      kind: "open-run",
      runId: child.summary.id,
      label: runPageWords.openRun(shortRunId(child.summary.id)),
    },
    ...(own.details === undefined
      ? {}
      : { details: `${own.details}\nStarted by run ${parent.id}` }),
  };
}

/**
 * The child's buttons that work from the parent's page: not **See the step**, which would open the
 * parent's step rather than the child's. **Open run** leads to the child's page, which has it.
 */
function outsideTheSteps(fixes: readonly BannerFix[] | undefined): readonly BannerFix[] {
  return (fixes ?? []).filter((fix) => fix.kind !== "see-step");
}
