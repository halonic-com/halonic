// The failed banners by cause (microcopy 22 F6, F7, F8, F10, F15, F20, F21; checklist FX-D2, FX-D3).
// Each reads the run's reason, or its typed cause, and the log for what the summary doesn't hold:
// the model and its provider from the last model call, the agent from the last agent that started
// or the branch whose answer wasn't an option, and the harness program and its limit from the last
// `harness.started`. A setup cause the engine names, such as a provider type Halonic can't call, is
// read from the summary's cause with the CLI's own facts (`setupFailureOf`). Run again is the
// banner's button (`run-again.ts`); a banner adds the fixes that come before it (Copy command,
// Open Models where the cause is fixed in Models, or See the step) and the links after it (Open
// Models, Copy details).

import { proxyFailureOf, setupFailureOf } from "@halonicjs/app/run-failure";
import {
  answerChoicesOf,
  type RunEvent,
  type RunFailureCause,
  type RunSummary,
} from "@halonicjs/events";
import { failureWords } from "../failure-words.ts";
import { currentStepName } from "../list/run-row.ts";
import { providerNameOf } from "../provider-name.ts";
import { capitalised } from "../run-words.ts";
import { accountBanner } from "./account-banners.ts";
import { apiOffOf } from "./api-off.ts";
import { danger } from "./danger-banner.ts";
import type { BannerFix, RunBanner, RunPageContext } from "./run-page-model.ts";

/** The cause code the Studio gives a run it stopped because the workspace's trust was removed (`trustRemovedCause`). */
const trustRemovedCode = "workspace.trust-removed";

/** What a failure banner may need from the log. */
interface FailureFacts {
  readonly provider: string | undefined;
  readonly model: string | undefined;
  /** The model alias the last call went to, when the log names it (older logs don't). */
  readonly alias: string | undefined;
  /** The host `run.failed` names; `undefined` when it names none, or an empty one. */
  readonly host: string | undefined;
  /** `run.failed` named an empty host: the provider's address has none, such as `localhost:11434` without `http://`. */
  readonly noHost: boolean;
  readonly agent: string | undefined;
  /** The parallel branch's agent whose answer wasn't one of its options, which failed the run. */
  readonly offOptionAgent: string | undefined;
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
  const setup = setupBanner(summary, workflow, step, phone);
  if (setup !== undefined) {
    return setup;
  }
  if (summary.cause?.code === socketPathTooLongCode) {
    return danger([
      failureWords.socketPathTooLong(workflow, step, socketLimitOf(summary.cause), phone),
    ]);
  }
  const facts = factsFrom(log ?? [], context);
  switch (summary.reason) {
    case "sandbox-start-failed":
      return withDetails(
        failureWords.sandboxStartFailed(facts.agent ?? failureWords.theAgent),
        summary,
      );
    case "disk-full":
      return danger([failureWords.diskFull(workflow, step)]);
    case "interrupted":
      return interrupted(summary, workflow, step);
    case "answer-not-an-option": {
      const choices = answerChoicesOf(summary.cause);
      if (choices !== undefined) {
        const agent = agentNameOf(choices.agent, context);
        return danger([failureWords.answerNotAChoice(workflow, step, agent, choices.options)], {
          fixes: [{ kind: "see-step" }],
        });
      }
      // An older log: its cause doesn't give the choices, so the agent comes from the log.
      const agent = facts.offOptionAgent ?? facts.agent;
      return agent === undefined
        ? undefined
        : danger([failureWords.answerNotAnOption(workflow, step, agent)]);
    }
    case "model-unreachable":
      return proxyBanner(summary, facts, context) ?? modelUnreachable(facts, context, phone);
    case "model-out-of-memory":
      return modelOutOfMemory(facts, context, phone);
    case "model-missing":
      return modelMissing(facts, context, phone) ?? accountBanner(log, context, step, phone);
    case "key-refused":
    case "provider-busy":
    case "out-of-credit":
    case "local-only":
      return accountBanner(log, context, step, phone);
    case "model-timeout":
      return modelTimeout(facts, context, step, phone);
    case "model-no-tools":
      return modelNoTools(facts, step, phone);
    case "harness-start-failed":
      return harnessStartFailed(facts, step, summary);
    default:
      return undefined;
  }
}

/** The cause code the harness bridge gives a socket path longer than the system takes (HAL-13862). */
const socketPathTooLongCode = "harness-bridge.socket-path-too-long";

/** The socket path's length, the system's limit and the system, only when the cause gives all three. */
function socketLimitOf(cause: RunFailureCause) {
  const bytes = cause.detail?.["bytes"];
  const most = cause.detail?.["limit"];
  const system = cause.detail?.["system"];
  return bytes === undefined || most === undefined || system === undefined
    ? undefined
    : { bytes, most, system };
}

/**
 * The engine stopped while the run was going: on its own, or because the workspace's trust was
 * removed, which the run's typed cause says (`runs.run-view.trust-removed`).
 */
function interrupted(summary: RunSummary, workflow: string, step: string): RunBanner {
  const beforeFirstStep = summary.statesVisited.length === 0;
  if (summary.cause?.code === trustRemovedCode) {
    return danger([
      beforeFirstStep
        ? failureWords.trustRemovedBeforeFirstStep(workflow)
        : failureWords.trustRemoved(workflow, step),
    ]);
  }
  return danger([
    beforeFirstStep
      ? failureWords.engineStoppedBeforeFirstStep(workflow)
      : failureWords.engineStopped(workflow, step),
  ]);
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
  return danger([sentence], {
    fixes: [
      {
        kind: "open-external",
        label: failureWords.switchItOn,
        address: off.enableUrl,
        opens: failureWords.opensGoogleCloud,
      },
    ],
  });
}

/**
 * F7 for a call that failed at the proxy (a `proxy.*` cause): the proxy, not the internet, and
 * **Model calls through a proxy ↗**. The desktop shell's cause brings its own sentence; the CLI's
 * HTTP client's brings the facts for the CLI's two lines, what the proxy did and its one fix
 * (`cli.run-failed-proxy`). It reads the typed cause only, never the error.
 */
function proxyBanner(
  summary: RunSummary,
  facts: FailureFacts,
  context: RunPageContext,
): RunBanner | undefined {
  if (facts.provider === undefined) {
    return undefined;
  }
  const name = providerNameOf(facts.provider, context.providerName);
  const failure = proxyFailureOf(summary.cause, name);
  if (failure === undefined) {
    return undefined;
  }
  const shellSentence = summary.cause?.detail?.["message"];
  return danger(
    shellSentence === undefined
      ? [failureWords.proxyProblem(name, failure), failureWords.proxyFix(name, failure)]
      : [failureWords.modelUnreachableThroughProxy(name, facts.host, shellSentence)],
    {
      fixes: [
        {
          kind: "open-external",
          label: failureWords.proxyHowTo,
          address: failureWords.proxyHowToAddress,
          opens: failureWords.opensGitHub,
        },
      ],
    },
  );
}

/**
 * A setup cause the engine names (`setupFailureOf`): the CLI's first line, then the fix in Studio,
 * which is Open Models rather than a file. A phone says to fix it on the computer. A secrets file
 * other users can read keeps the CLI's own fix, chmod 600, with no button (HAL-14122). Any other
 * cause keeps the page's other banners.
 */
function setupBanner(
  summary: RunSummary,
  workflow: string,
  step: string,
  phone: boolean,
): RunBanner | undefined {
  const failure = setupFailureOf(summary.cause);
  switch (failure?.reason) {
    case "unknown-provider-type":
      return fixInModels(
        [
          failureWords.unknownProviderType(workflow, step, failure.provider, failure.type),
          failureWords.unknownProviderTypeFix(failure.provider),
        ],
        phone,
      );
    case "unknown-model-alias":
      return fixInModels(
        [
          failureWords.unknownModelAlias(workflow, step, failure.hub, failure.alias),
          failureWords.unknownModelAliasFix,
        ],
        phone,
      );
    case "secrets-file-readable":
      // The engine's reason is `error`: only the cause tells this setup problem from a bug.
      return danger([failureWords.secretsFileReadable(workflow, step, failure.file)]);
    default:
      return undefined;
  }
}

/**
 * F7: the cloud sentence names the internet, the local one the program that isn't running and
 * offers Open Models. A phone says the program is on the computer and says to fix it there. An
 * address without a host can't be reached whatever runs, so that sentence points to the address.
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
  if (facts.noHost) {
    return fixInModels([failureWords.modelAddressWithoutHost(name, model, alias)], phone);
  }
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
  return danger([failureWords.localModelUnreachable(name, host, model, alias)], {
    links: [openModels],
  });
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
    phone ? {} : { fixes: [openModels] },
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
  return danger([line], { ...(ollama ? { fixes: [copy] } : {}), links: [openModels] });
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
 * first, at the alias's tab when the log names it. A phone can't open Models, so it says to do it
 * on the computer.
 */
function modelNoTools(facts: FailureFacts, step: string, phone: boolean): RunBanner | undefined {
  const { model, alias } = facts;
  if (model === undefined) {
    return undefined;
  }
  const line = failureWords.modelNoTools(model, alias, step);
  const open: BannerFix = alias === undefined ? openModels : { kind: "open-models", alias };
  return phone
    ? danger([line, failureWords.fixOnComputer(failureWords.modelsPlace)])
    : danger([line], { fixes: [open] });
}

/** F21: needs the log, for the program and the limit it was given. */
function harnessStartFailed(
  facts: FailureFacts,
  step: string,
  summary: RunSummary,
): RunBanner | undefined {
  const { harness } = facts;
  if (harness === undefined) {
    return undefined;
  }
  const program = failureWords.harnessNames[harness.id] ?? capitalised(harness.id);
  const seconds = Math.round(harness.timeoutMs / 1000);
  return withDetails(
    failureWords.harnessStartFailed(harness.agent, program, seconds, step),
    summary,
  );
}

const openModels: BannerFix = { kind: "open-models" };

/** A banner whose fix is in Models: Open Models, or on a phone a line saying to fix it on the computer. */
function fixInModels(lines: readonly string[], phone: boolean): RunBanner {
  return phone
    ? danger([...lines, failureWords.fixOnComputer(failureWords.modelsPlace)])
    : danger(lines, { fixes: [openModels] });
}

/**
 * F6 and F21: **Run again** · link **Copy details**. Nothing in Studio fixes the cause, and Copy
 * details carries the engine's or the program's own message, which never shows on screen.
 */
function withDetails(line: string, summary: RunSummary): RunBanner {
  const message = summary.error?.trim() ?? "";
  return danger([line], {
    details: [line, `Run ${summary.id}`, message].filter((part) => part !== "").join("\n"),
  });
}

/**
 * The last model call's provider and model, `run.failed`'s host, and the agent that started last.
 * An agent is named as its file names it; an agent the workspace no longer has keeps its id.
 */
function factsFrom(log: readonly RunEvent[], context: RunPageContext): FailureFacts {
  const request = log.findLast((event) => event.type === "llm.request");
  const started = log.findLast(
    (event): event is Extract<RunEvent, { type: "agent.started" }> =>
      event.type === "agent.started" && event.parent === undefined,
  );
  const failed = log.findLast((event) => event.type === "run.failed");
  const harness = log.findLast((event) => event.type === "harness.started");
  const offOption = log.findLast(
    (event): event is Extract<RunEvent, { type: "agent.finished" }> =>
      event.type === "agent.finished" && event.reason === "answer-not-an-option",
  );
  return {
    provider: request?.provider,
    model: request?.model,
    alias: request?.alias,
    host: failed?.host === "" ? undefined : failed?.host,
    noHost: failed?.host === "",
    agent: started === undefined ? undefined : agentNameOf(started.agent, context),
    offOptionAgent: offOption === undefined ? undefined : agentNameOf(offOption.agent, context),
    harness:
      harness === undefined
        ? undefined
        : {
            id: harness.harness,
            agent: agentNameOf(harness.agent, context),
            timeoutMs: harness.timeoutMs,
          },
  };
}

/** An agent's name as its file says, or its id when the workspace has no such agent. */
export function agentNameOf(agentId: string, context: Pick<RunPageContext, "agentName">): string {
  return context.agentName?.(agentId) ?? agentId;
}
