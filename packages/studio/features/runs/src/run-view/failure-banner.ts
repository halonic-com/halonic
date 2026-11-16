// The failed banners by cause (microcopy 22 F6, F7, F8, F10, F15, F20; checklist FX-D2, FX-D3).
// Each reads the run's reason, and the log for what the summary doesn't hold: the model and its
// provider from the last model call, the agent from the last agent that started. Run again,
// Open Models and Copy details come with the buttons the page doesn't have yet.

import type { RunEvent, RunSummary } from "@halonicjs/events";
import { failureWords } from "../failure-words.ts";
import { currentStepName } from "../list/run-row.ts";
import { runPageWords } from "../run-words.ts";
import type { RunBanner, RunPageContext } from "./run-page-model.ts";

/** What a failure banner may need from the log. */
interface FailureFacts {
  readonly provider: string | undefined;
  readonly model: string | undefined;
  readonly host: string | undefined;
  readonly agent: string | undefined;
}

/**
 * The banner for a run that failed for one of these reasons, or `undefined` for any other run so
 * the page keeps its general banner. The model reasons need the log (which model, which
 * provider): until it is read they give `undefined` too.
 *
 * @param phone Whether the page is a phone's, where a fix it can't do becomes a line saying to
 *   do it on the computer (microcopy 15.3).
 */
export function causeBanner(
  summary: RunSummary,
  log: readonly RunEvent[] | undefined,
  context: RunPageContext,
  phone: boolean,
): RunBanner | undefined {
  if (summary.status !== "failed") {
    return undefined;
  }
  const workflow = context.workflow?.name ?? summary.workflowId;
  const step = currentStepName(summary, context.workflow);
  const facts = factsFrom(log ?? []);
  switch (summary.reason) {
    case "sandbox-start-failed":
      return danger([failureWords.sandboxStartFailed(facts.agent ?? failureWords.theAgent)]);
    case "disk-full":
      return danger([failureWords.diskFull(workflow, step)]);
    case "interrupted":
      return danger([
        summary.statesVisited.length === 0
          ? failureWords.engineStoppedBeforeFirstStep(workflow)
          : failureWords.engineStopped(workflow, step),
      ]);
    case "model-unreachable":
      return modelUnreachable(facts, context);
    case "model-out-of-memory":
      return modelOutOfMemory(facts, phone);
    default:
      return undefined;
  }
}

/** F7: the cloud sentence names the internet, the local one the program that isn't running. */
function modelUnreachable(facts: FailureFacts, context: RunPageContext): RunBanner | undefined {
  const { provider, model, host } = facts;
  if (provider === undefined || model === undefined) {
    return undefined;
  }
  // A provider that is no longer in the workspace gets the cloud sentence: the internet is the
  // likelier cause, and the local one tells a person to start a program that may not exist.
  const words =
    context.providerKind(provider) === "local"
      ? failureWords.localModelUnreachable
      : failureWords.cloudModelUnreachable;
  return danger([words(provider, host, model)]);
}

/** F8: only a local model can run out of memory on this computer. */
function modelOutOfMemory(facts: FailureFacts, phone: boolean): RunBanner | undefined {
  const { provider, model } = facts;
  if (provider === undefined || model === undefined) {
    return undefined;
  }
  return danger([
    failureWords.modelOutOfMemory(provider, model),
    ...(phone
      ? [
          failureWords.modelOutOfMemoryFixOnPhone,
          failureWords.fixOnComputer(failureWords.modelsPlace),
        ]
      : [failureWords.modelOutOfMemoryFix]),
  ]);
}

function danger(lines: readonly string[]): RunBanner {
  return { kind: "callout", tone: "danger", name: runPageWords.failedName, lines };
}

/** The last model call's provider and model, `run.failed`'s host, and the agent that started last. */
function factsFrom(log: readonly RunEvent[]): FailureFacts {
  const request = log.findLast((event) => event.type === "llm.request");
  const started = log.findLast(
    (event): event is Extract<RunEvent, { type: "agent.started" }> =>
      event.type === "agent.started" && event.parent === undefined,
  );
  const failed = log.findLast((event) => event.type === "run.failed");
  return {
    provider: request?.provider,
    model: request?.model,
    host: failed?.host,
    agent: started?.agent,
  };
}
