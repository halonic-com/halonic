// The failed banners by cause (microcopy 22 F6, F7, F8, F10, F15, F20, F21; checklist FX-D2, FX-D3).
// Each reads the run's reason, and the log for what the summary doesn't hold: the model and its
// provider from the last model call, the agent from the last agent that started, and the harness
// program and its limit from the last `harness.started`. Run again is the banner's button
// (`run-again.ts`); the local-model banners add Copy command and Open Models before it.

import type { RunEvent, RunSummary } from "@halonicjs/events";
import { escapeHidden } from "@halonicjs/std";
import { failureWords } from "../failure-words.ts";
import { currentStepName } from "../list/run-row.ts";
import { providerNameOf } from "../provider-name.ts";
import { capitalised, runPageWords } from "../run-words.ts";
import { apiOffOf } from "./api-off.ts";
import type { BannerFix, RunBanner, RunPageContext } from "./run-page-model.ts";
import { unknownProviderTypeOf } from "./unknown-provider-type.ts";

/** What a failure banner may need from the log. */
interface FailureFacts {
  readonly provider: string | undefined;
  readonly model: string | undefined;
  /** The model alias the last call went to, when the log names it (older logs don't). */
  readonly alias: string | undefined;
  readonly host: string | undefined;
  readonly agent: string | undefined;
  /** The harness program the last step tried to start, and how long the engine waits for it. */
  readonly harness:
    | { readonly id: string; readonly agent: string; readonly timeoutMs: number }
    | undefined;
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
  const apiOff = apiOffBanner(summary, phone);
  if (apiOff !== undefined) {
    return apiOff;
  }
  const unknownType = unknownProviderTypeBanner(summary, workflow, step);
  if (unknownType !== undefined) {
    return unknownType;
  }
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
      return proxyBanner(summary, facts, context) ?? modelUnreachable(facts, context, phone);
    case "model-out-of-memory":
      return modelOutOfMemory(facts, context, phone);
    case "model-missing":
      return modelMissing(facts, context, phone);
    case "model-timeout":
      return modelTimeout(facts, context, step, phone);
    case "model-no-tools":
      return modelNoTools(facts, step, phone);
    case "harness-start-failed":
      return harnessStartFailed(facts, step);
    default:
      return undefined;
  }
}

/**
 * `google.api-disabled` (microcopy 10.4): says which API is off and in which project, with
 * **Switch it on ↗** to Google's enable page. The button is left out when the cause gave no
 * Google console address, and on a phone it becomes a line saying to do it on the computer.
 * It reads the typed cause only, never the reason.
 */
function apiOffBanner(summary: RunSummary, phone: boolean): RunBanner | undefined {
  const off = apiOffOf(summary);
  if (off === undefined) {
    return undefined;
  }
  const api = failureWords.googleApiNames[off.api];
  const sentence = failureWords.googleApiOff(api, off.project);
  if (phone) {
    return danger([sentence, failureWords.fixOnComputer(failureWords.switchOnInGoogleCloud(api))]);
  }
  if (off.enableUrl === undefined) {
    return danger([sentence]);
  }
  return danger(
    [sentence],
    [
      {
        kind: "open-external",
        label: failureWords.switchItOn,
        address: off.enableUrl,
        opens: failureWords.opensGoogleCloud,
      },
    ],
  );
}

/**
 * F7 for a call that failed at the proxy (a `proxy.*` cause, from the CLI's HTTP client or the
 * desktop shell's): the proxy, not the internet, with the shell's sentence when the cause gives
 * one, and **Model calls through a proxy ↗**. It reads the typed cause only, never the error.
 */
function proxyBanner(
  summary: RunSummary,
  facts: FailureFacts,
  context: RunPageContext,
): RunBanner | undefined {
  const { cause } = summary;
  if (facts.provider === undefined || cause?.code?.startsWith("proxy.") !== true) {
    return undefined;
  }
  return danger(
    [
      failureWords.modelUnreachableThroughProxy(
        providerNameOf(facts.provider, context.providerName),
        facts.host,
        cause.detail?.["message"],
      ),
    ],
    [
      {
        kind: "open-external",
        label: failureWords.proxyHowTo,
        address: failureWords.proxyHowToAddress,
        opens: failureWords.opensGitHub,
      },
    ],
  );
}

/**
 * `models.unknown-provider-type`: the person's own provider file names a type Halonic can't call,
 * so the banner says, as the CLI does, which file to mend and the types it can name, with no
 * **Copy details**. The type is the file's own text: hidden characters in it are shown.
 */
function unknownProviderTypeBanner(
  summary: RunSummary,
  workflow: string,
  step: string,
): RunBanner | undefined {
  const unknown = unknownProviderTypeOf(summary);
  if (unknown === undefined) {
    return undefined;
  }
  const { provider, type } = unknown;
  return danger([
    failureWords.unknownProviderType(workflow, step, provider, escapeHidden(type)),
    failureWords.unknownProviderTypeFix(provider),
  ]);
}

/**
 * F7: the cloud sentence names the internet, the local one the program that isn't running and
 * offers Open Models. A phone says the program is on the computer and says to fix it there.
 */
function modelUnreachable(
  facts: FailureFacts,
  context: RunPageContext,
  phone: boolean,
): RunBanner | undefined {
  const { provider, model, alias, host } = facts;
  if (provider === undefined || model === undefined) {
    return undefined;
  }
  const name = providerNameOf(provider, context.providerName);
  // A provider that is no longer in the workspace gets the cloud sentence: the internet is the
  // likelier cause, and the local one tells a person to start a program that may not exist.
  if (context.providerKind(provider) !== "local") {
    return danger([failureWords.cloudModelUnreachable(name, host, model, alias)]);
  }
  if (phone) {
    return danger([
      failureWords.localModelUnreachableOnPhone(name, host, model, alias),
      failureWords.fixOnComputer(failureWords.modelsPlace),
    ]);
  }
  return danger([failureWords.localModelUnreachable(name, host, model, alias)], [openModels]);
}

/**
 * F8: only a local model can run out of memory on this computer. A provider that runs elsewhere
 * keeps the page's general banner, since "this computer" would be wrong for it.
 */
function modelOutOfMemory(
  facts: FailureFacts,
  context: RunPageContext,
  phone: boolean,
): RunBanner | undefined {
  const { provider, model } = facts;
  if (provider === undefined || model === undefined || context.providerKind(provider) === "cloud") {
    return undefined;
  }
  return danger(
    [
      failureWords.modelOutOfMemory(providerNameOf(provider, context.providerName), model),
      ...(phone
        ? [
            failureWords.modelOutOfMemoryFixOnPhone,
            failureWords.fixOnComputer(failureWords.modelsPlace),
          ]
        : [failureWords.modelOutOfMemoryFix]),
    ],
    phone ? undefined : [openModels],
  );
}

/**
 * `model-missing`: only a local provider can lack a model it was asked for; a provider that is
 * cloud or no longer in the workspace keeps the general banner. Ollama's line tells
 * how to pull it and offers the command; another local provider says to download it there.
 */
function modelMissing(
  facts: FailureFacts,
  context: RunPageContext,
  phone: boolean,
): RunBanner | undefined {
  const { provider, model } = facts;
  if (provider === undefined || model === undefined || context.providerKind(provider) !== "local") {
    return undefined;
  }
  const ollama = provider === "ollama";
  const name = providerNameOf(provider, context.providerName);
  if (phone) {
    const line = ollama
      ? failureWords.modelMissingOllamaOnPhone(model)
      : failureWords.modelMissingOtherOnPhone(name, model);
    return danger([line, failureWords.fixOnComputer(failureWords.modelsPlace)]);
  }
  const line = ollama
    ? failureWords.modelMissingOllama(model)
    : failureWords.modelMissingOther(name, model);
  const copy: BannerFix = { kind: "copy-command", command: failureWords.ollamaPullCommand(model) };
  return danger([line], ollama ? [copy, openModels] : [openModels]);
}

/** `model-timeout`: Run again is the button; nothing the person set caused it. */
function modelTimeout(
  facts: FailureFacts,
  context: RunPageContext,
  step: string,
  phone: boolean,
): RunBanner | undefined {
  const { provider, host } = facts;
  if (provider === undefined) {
    return undefined;
  }
  const name = providerNameOf(provider, context.providerName);
  if (context.providerKind(provider) !== "local") {
    return danger([failureWords.cloudModelTimeout(name, step)]);
  }
  return danger([
    phone
      ? failureWords.localModelTimeoutOnPhone(name)
      : failureWords.localModelTimeout(name, host),
  ]);
}

/**
 * `model-no-tools`: Run again fails the same way until the alias changes, so Open Models comes
 * first. A phone can't open Models, so it says to do it on the computer.
 */
function modelNoTools(facts: FailureFacts, step: string, phone: boolean): RunBanner | undefined {
  const { model, alias } = facts;
  if (model === undefined) {
    return undefined;
  }
  const line = failureWords.modelNoTools(model, alias, step);
  return phone
    ? danger([line, failureWords.fixOnComputer(failureWords.modelsPlace)])
    : danger([line], [openModels]);
}

/** F21: needs the log, for the program and the limit it was given. */
function harnessStartFailed(facts: FailureFacts, step: string): RunBanner | undefined {
  const { harness } = facts;
  if (harness === undefined) {
    return undefined;
  }
  const program = failureWords.harnessNames[harness.id] ?? capitalised(harness.id);
  const seconds = Math.round(harness.timeoutMs / 1000);
  return danger([failureWords.harnessStartFailed(harness.agent, program, seconds, step)]);
}

const openModels: BannerFix = { kind: "open-models" };

function danger(lines: readonly string[], fixes?: readonly BannerFix[]): RunBanner {
  return {
    kind: "callout",
    tone: "danger",
    name: runPageWords.failedName,
    lines,
    ...(fixes === undefined ? {} : { fixes }),
  };
}

/** The last model call's provider and model, `run.failed`'s host, and the agent that started last. */
function factsFrom(log: readonly RunEvent[]): FailureFacts {
  const request = log.findLast((event) => event.type === "llm.request");
  const started = log.findLast(
    (event): event is Extract<RunEvent, { type: "agent.started" }> =>
      event.type === "agent.started" && event.parent === undefined,
  );
  const failed = log.findLast((event) => event.type === "run.failed");
  const harness = log.findLast((event) => event.type === "harness.started");
  return {
    provider: request?.provider,
    model: request?.model,
    alias: request?.alias,
    host: failed?.host,
    agent: started?.agent,
    harness:
      harness === undefined
        ? undefined
        : { id: harness.harness, agent: harness.agent, timeoutMs: harness.timeoutMs },
  };
}
