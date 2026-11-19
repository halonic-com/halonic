import { capitalised } from "./run-words.ts";

/** The model programs by the name a person knows (microcopy 5): "LM Studio", not "Lmstudio". */
const providerNames: Readonly<Record<string, string>> = { lmstudio: "LM Studio", openai: "OpenAI" };

/**
 * A provider as the slow-step line names it: its known name, or its own name with a capital.
 * The banners get the name from the provider's file instead (`providerNameOf`).
 */
export function providerName(provider: string): string {
  return providerNames[provider] ?? capitalised(provider);
}

/** F7's "the model alias `smart`", or "the model gpt-4o" when the log doesn't give the alias. */
function modelOrAlias(model: string, alias: string | undefined): string {
  return alias === undefined ? `the model ${model}` : `the model alias ${alias}`;
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
  localModelUnreachable: (
    provider: string,
    host: string | undefined,
    model: string,
    alias: string | undefined,
  ) =>
    `Halonic couldn't reach ${provider}${host === undefined ? "" : ` at ${host}`} for ${modelOrAlias(model, alias)}. ${provider} may not be running on this computer. Start ${provider}, then run again.`,
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
  /** F21: the harness program (Claude Code, Codex) didn't start, or sent no first event in time. */
  harnessStartFailed: (agent: string, harness: string, seconds: number, step: string) =>
    `${capitalised(agent)} didn't start: ${harness} didn't start on this computer, or didn't answer within ${seconds} ${seconds === 1 ? "second" : "seconds"}. Nothing ran in the step ${step}.`,
  /** The harness ids the engine logs, as the person knows the programs. */
  harnessNames: { "claude-code": "Claude Code", codex: "Codex" } as Readonly<
    Record<string, string>
  >,
};
