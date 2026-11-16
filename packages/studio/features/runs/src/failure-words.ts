import { capitalised } from "./run-words.ts";

/**
 * The failed banners by cause (microcopy 22 F6, F7, F8, F10, F15, F20, F21). The reason the engine
 * gives never shows: it goes into Copy details, which the banner doesn't have yet.
 */
export const failureWords = {
  /** For a failed sandbox start that names no agent. */
  theAgent: "The agent",
  sandboxStartFailed: (agent: string) =>
    `${capitalised(agent)} didn't start: the sandbox on this computer didn't start. Nothing ran.`,
  cloudModelUnreachable: (provider: string, host: string | undefined, model: string) =>
    `Halonic couldn't reach ${capitalised(provider)}${host === undefined ? "" : ` at ${host}`} for the model ${model}. This computer may be offline. Check your internet connection, then run again.`,
  localModelUnreachable: (provider: string, host: string | undefined, model: string) =>
    `Halonic couldn't reach ${capitalised(provider)}${host === undefined ? "" : ` at ${host}`} for the model ${model}. ${capitalised(provider)} may not be running on this computer. Start ${capitalised(provider)}, then run again.`,
  /** F6 (microcopy 15.3, `model-missing`): the server answers, but the model isn't in its list. */
  modelMissingOllama: (model: string) =>
    `Ollama is answering, but it doesn't have ${model} yet. Run \`ollama pull ${model}\` in a terminal, or pick another model in Models.`,
  modelMissingOther: (provider: string, model: string) =>
    `${capitalised(provider)} is answering, but it doesn't have ${model} yet. Download it in ${capitalised(provider)}, or pick another model in Models.`,
  ollamaPullCommand: (model: string) => `ollama pull ${model}`,
  /** `model-timeout`: a local provider names its address, a cloud one the step it stopped. */
  localModelTimeout: (provider: string, host: string | undefined) =>
    `${capitalised(provider)} didn't start answering${host === undefined ? "" : ` at ${host}`} within 5 minutes. It may still be loading the model.`,
  cloudModelTimeout: (provider: string, step: string) =>
    `${capitalised(provider)} didn't start answering within 5 minutes, so the step ${step} stopped. Nothing you set caused this.`,
  /** `model-no-tools`: cli-output 3.4's lines 1 and 2; without the alias the log didn't give. */
  modelNoTools: (model: string, alias: string | undefined, step: string) =>
    alias === undefined
      ? `${model} can't use tools, and the step ${step} offers tools. Pick a model that can in Models, then run again.`
      : `${model}, used by the model alias ${alias}, can't use tools, and the step ${step} offers tools. Point the model alias ${alias} at a model that can use tools.`,
  copyCommand: "Copy command",
  openModels: "Open Models",
  modelOutOfMemory: (provider: string, model: string) =>
    `${capitalised(provider)} couldn't load ${model}: this computer doesn't have enough free memory for it.`,
  modelOutOfMemoryFix: "Close other programs, or pick a smaller model in Models.",
  modelOutOfMemoryFixOnPhone: "Close other programs, or pick a smaller model.",
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
