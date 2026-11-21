import { capitalised } from "./run-words.ts";

/** F7's "the model alias `smart`", or "the model gpt-4o" when the log doesn't give the alias. */
function modelOrAlias(model: string, alias: string | undefined): string {
  return alias === undefined ? `the model ${model}` : `the model alias ${alias}`;
}

/**
 * A sentence as it reads after a colon: a lower-case first letter, unless it starts with the name
 * Halonic, and a full stop at the end.
 */
function afterColon(sentence: string): string {
  const trimmed = sentence.trim();
  const opened = trimmed.startsWith("Halonic")
    ? trimmed
    : `${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;
  return asSentence(opened);
}

/**
 * How the shell's sentence for an unreachable proxy (`proxy` in `http_fetch.rs`) starts. The banner
 * already says it, so it gives only what follows (HAL-13770). Other callers show the shell's
 * sentence on its own, so the shell keeps it.
 */
const unreachableThroughProxy = "couldn't reach the host through the proxy";

/**
 * The end of the proxy line: the shell's sentence after a colon, or, when that sentence only
 * repeats that the proxy couldn't be reached, what it says to do as a sentence of its own.
 */
function proxyLineEnd(reason: string | undefined): string {
  if (reason === undefined) {
    return ".";
  }
  const trimmed = reason.trim();
  if (!trimmed.startsWith(unreachableThroughProxy)) {
    return `: ${afterColon(trimmed)}`;
  }
  const rest = trimmed.slice(unreachableThroughProxy.length).replace(/^:\s*/, "");
  return rest === "" ? "." : `. ${asSentence(capitalised(rest))}`;
}

/** A sentence with a full stop at the end, unless it already ends a sentence. */
function asSentence(sentence: string): string {
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

/**
 * The failed banners by cause (microcopy 22 F6, F7, F8, F10, F15, F20, F21). The reason the engine
 * gives never shows: it goes into Copy details, which the banner doesn't have yet.
 */
export const failureWords = {
  /** For a failed sandbox start that names no agent. */
  theAgent: "The agent",
  sandboxStartFailed: (agent: string) =>
    `${capitalised(agent)} didn't start: the sandbox on this computer didn't start. Nothing ran.`,
  /** F7: names the model alias the call went to, or the model when an older log doesn't give it. */
  cloudModelUnreachable: (
    provider: string,
    host: string | undefined,
    model: string,
    alias: string | undefined,
  ) =>
    `Halonic couldn't reach ${provider}${host === undefined ? "" : ` at ${host}`} for ${modelOrAlias(model, alias)}. This computer may be offline. Check your internet connection, then run again.`,
  /**
   * F7 when the call failed at the proxy (`proxy.*`, HAL-13725): the shell's own sentence says
   * what to change, after a colon; without one the sentence ends at the proxy. An unreachable
   * proxy's sentence follows as a sentence of its own, without its first part (HAL-13770).
   */
  modelUnreachableThroughProxy: (
    provider: string,
    host: string | undefined,
    reason: string | undefined,
  ) =>
    `Halonic couldn't reach ${provider}${host === undefined ? "" : ` at ${host}`} through your proxy${proxyLineEnd(reason)}`,
  proxyHowTo: "Model calls through a proxy",
  /** The how-to #3799 updated, until docs.halonic.dev has it. */
  proxyHowToAddress:
    "https://github.com/halonic-com/halonic/blob/main/docs/how-to/model-calls-through-a-proxy.md",
  opensGitHub: "Opens GitHub",
  localModelUnreachable: (
    provider: string,
    host: string | undefined,
    model: string,
    alias: string | undefined,
  ) =>
    `Halonic couldn't reach ${provider}${host === undefined ? "" : ` at ${host}`} for ${modelOrAlias(model, alias)}. ${provider} may not be running on this computer. Start ${provider}, then run again.`,
  /** `run.failed` named an empty host: the address in the provider's file has none, such as one without `http://`. */
  modelAddressWithoutHost: (provider: string, model: string, alias: string | undefined) =>
    `Halonic couldn't reach ${provider} for ${modelOrAlias(model, alias)}: its address has no host. Check ${provider}'s address in Models. It starts with http:// or https://, such as http://localhost:11434.`,
  /** On a phone, "localhost" is the computer: the sentence says so (microcopy 15.3, revision 96). */
  localModelUnreachableOnPhone: (
    provider: string,
    host: string | undefined,
    model: string,
    alias: string | undefined,
  ) =>
    `Halonic couldn't reach ${provider} on your computer${host === undefined ? "" : ` (${host})`} for ${modelOrAlias(model, alias)}. Start ${provider} there, then run again.`,
  /** F6 (microcopy 15.3, `model-missing`): the server answers, but the model isn't in its list. */
  modelMissingOllama: (model: string) =>
    `Ollama is answering, but it doesn't have ${model} yet. Run ollama pull ${model} in a terminal, or pick another model in Models.`,
  modelMissingOther: (provider: string, model: string) =>
    `${provider} is answering, but it doesn't have ${model} yet. Download it in ${provider}, or pick another model in Models.`,
  modelMissingOllamaOnPhone: (model: string) =>
    `Ollama on your computer doesn't have ${model} yet. Run ollama pull ${model} in a terminal there, or pick another model in Models.`,
  modelMissingOtherOnPhone: (provider: string, model: string) =>
    `${provider} on your computer doesn't have ${model} yet. Download it there, or pick another model in Models.`,
  ollamaPullCommand: (model: string) => `ollama pull ${model}`,
  /** `model-timeout`: a local provider names its address, a cloud one the step it stopped. */
  localModelTimeout: (provider: string, host: string | undefined) =>
    `${provider} didn't start answering${host === undefined ? "" : ` at ${host}`} within 5 minutes. It may still be loading the model.`,
  localModelTimeoutOnPhone: (provider: string) =>
    `${provider} on your computer didn't start answering within 5 minutes. It may still be loading the model.`,
  cloudModelTimeout: (provider: string, step: string) =>
    `${provider} didn't start answering within 5 minutes, so the step ${step} stopped. Nothing you set caused this.`,
  /** `model-no-tools`: cli-output 3.4's lines 1 and 2; without the alias the log didn't give. */
  modelNoTools: (model: string, alias: string | undefined, step: string) =>
    alias === undefined
      ? `${model} can't use tools, and the step ${step} offers tools. Pick a model that can in Models, then run again.`
      : `${model}, used by the model alias ${alias}, can't use tools, and the step ${step} offers tools. Point the model alias ${alias} at a model that can use tools.`,
  /** `models.unknown-provider-type`: the CLI's first line (cli-output 3.4); the fix is in Models, not the file. */
  unknownProviderType: (workflow: string, step: string, provider: string, type: string) =>
    `${workflow} failed in the step ${step}: provider ${provider} has type ${type}, which Halonic can't call.`,
  unknownProviderTypeFix: (provider: string) =>
    `Pick a type Halonic knows for ${provider} in Models, then run again.`,
  /** `models.unknown-model-alias`: the CLI's first line, and Studio's fix (C343 S5). */
  unknownModelAlias: (workflow: string, step: string, hub: string, alias: string) =>
    `${workflow} failed in the step ${step}: hub ${hub} has no model alias ${alias}.`,
  unknownModelAliasFix: "Add it in Models, or set a model on the agent.",
  copyCommand: "Copy command",
  openModels: "Open Models",
  modelOutOfMemory: (provider: string, model: string) =>
    `${provider} couldn't load ${model}: this computer doesn't have enough free memory for it.`,
  modelOutOfMemoryFix: "Close other programs, or pick a smaller model in Models.",
  modelOutOfMemoryFixOnPhone: "Close other programs, or pick a smaller model.",
  /** The Google APIs by the name a person knows, as "the ___ API" reads (microcopy 10.4). */
  googleApiNames: { gmail: "Gmail", drive: "Google Drive" } as const,
  /** `google.api-disabled`: names the project when the cause gives one. Never "probably" or an error code. */
  googleApiOff: (api: string, project: string | undefined) =>
    project === undefined
      ? `The ${api} API is off in your Google project, so this step didn't run.`
      : `The ${api} API is off in project ${project}, so this step didn't run.`,
  switchItOn: "Switch it on",
  opensGoogleCloud: "Opens Google Cloud",
  switchOnInGoogleCloud: (api: string) => `switch on the ${api} API in Google Cloud.`,
  fixOnComputer: (place: string) => `Fix this on your computer: ${place}`,
  modelsPlace: "Models",
  diskFull: (workflow: string, step: string) =>
    `${workflow} stopped in the step ${step}: the disk is full, so Halonic couldn't write the run log. Free some space, then run again.`,
  engineStopped: (workflow: string, step: string) =>
    `${workflow} stopped because Halonic's engine stopped during the step ${step}. Nothing after that step ran.`,
  engineStoppedBeforeFirstStep: (workflow: string) =>
    `${workflow} stopped because Halonic's engine stopped before the first step. Nothing ran.`,
  /** An interrupted run the engine stopped because the workspace's trust was removed (HAL-13678). */
  trustRemoved: (workflow: string, step: string) =>
    `${workflow} stopped because this workspace's trust was removed during the step ${step}. Nothing after that step ran.`,
  trustRemovedBeforeFirstStep: (workflow: string) =>
    `${workflow} stopped because this workspace's trust was removed before the first step. Nothing ran.`,
  /** F21: the harness program (Claude Code, Codex) didn't start, or sent no first event in time. */
  harnessStartFailed: (agent: string, harness: string, seconds: number, step: string) =>
    `${capitalised(agent)} didn't start: ${harness} didn't start on this computer, or didn't answer within ${seconds} ${seconds === 1 ? "second" : "seconds"}. Nothing ran in the step ${step}.`,
  /** R1 (microcopy 15.3): the provider's secret holds no key, so no key was sent. */
  noKey: (provider: string, alias: string) =>
    `${provider} has no API key on this computer, and the model alias ${alias} needs one.`,
  addKey: "Add key",
  /** R2 (microcopy 15.3, P9): the provider turned the key away. */
  keyRefused: (provider: string, secret: string, alias: string) =>
    `${provider} didn't accept the key in the secret ${secret}, used by the model alias ${alias}. It may be mistyped, revoked, or for another account.`,
  replaceKey: "Replace key",
  /** R3 (microcopy 15.3, revision 77): the tries only when the run log has them. */
  providerBusy: (provider: string, step: string) =>
    `${provider} was busy and asked Halonic to slow down, so the step ${step} stopped. Nothing you set caused this.`,
  providerBusyAfterTries: (provider: string, tries: string, over: string, step: string) =>
    `${provider} was busy and asked Halonic to slow down. Halonic tried ${tries} over ${over} and stopped the step ${step}. Nothing you set caused this.`,
  /** R4 (microcopy 15.3): the provider's account, not the Halonic budget. */
  outOfCredit: (provider: string) =>
    `${provider} refused the call because the account has no credit left or reached its limit at ${provider}. This isn't your Halonic budget.`,
  openBilling: (provider: string) => `Open ${provider} billing`,
  opensProvider: (provider: string) => `Opens ${provider}`,
  /** R5: a cloud provider answered that it has no model by that name. */
  cloudModelMissing: (provider: string, model: string, alias: string) =>
    `${provider} doesn't have the model ${model}, used by the model alias ${alias}. Pick another model for ${alias} in Models.`,
  /** R5 for a model no alias points at, which the facts name `<provider>/<model>`. */
  cloudModelMissingNoAlias: (provider: string, model: string) =>
    `${provider} doesn't have the model ${model}. Pick another model in Models.`,
  /** R6 (microcopy 15.3, "Local only"): nothing was sent, so Run again would fail the same way. */
  localOnly: (workspace: string, provider: string, agent: string, alias: string) =>
    `${workspace} is local only, so Halonic sent nothing to ${provider}. ${agent}'s model alias ${alias} points to a cloud model.`,
  chooseLocalModel: (agent: string) => `Choose a local model for ${agent}`,
  /** The harness ids the engine logs, as the person knows the programs. */
  harnessNames: { "claude-code": "Claude Code", codex: "Codex" } as Readonly<
    Record<string, string>
  >,
};
