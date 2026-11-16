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
