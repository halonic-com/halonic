// Why a model call has no model to go to, as plain sentences. Each reason
// follows the host's own action, as in "✕ Couldn't run Support reply: …"
// in the CLI; the Studio shows them the same way.

import { providerTypes } from "@halonicjs/format";

/** A sentence of the reason or its fix, with no styling. */
export type ModelText = string;

/** The provider types the engine can call, as the unknown-type fix lists them: "anthropic, openai, … or mock". */
const knownTypes = `${providerTypes.slice(0, -1).join(", ")} or ${providerTypes.at(-1)}`;

/**
 * `loadWorkspace` already reports a missing provider before a run starts,
 * so these show only for what it can't see: a provider type with no
 * adapter, a default model alias it only warns about (HAL-12377), or a
 * workspace changed while it ran.
 */
export const modelTexts = {
  unknownType: (provider: string, type: string): ModelText =>
    `provider ${provider} has type ${type}, which Halonic can't call.`,
  unknownTypeFix: (provider: string): ModelText =>
    `Set type in providers/${provider}.yaml to one of ${knownTypes}, then run again.`,
  noAddress: (provider: string): ModelText => `provider ${provider} has no baseUrl.`,
  noAddressFix: (provider: string): ModelText =>
    `Add the server's address as baseUrl to providers/${provider}.yaml.`,
  noProvider: (provider: string, model: string): ModelText =>
    `model ${model} names provider ${provider}, which the workspace doesn't have.`,
  noProviderFix: (provider: string): ModelText => `Add providers/${provider}.yaml, then run again.`,
  notOnThisMachine: (model: string): ModelText =>
    `model ${model} is at an address that isn't on this computer, and this workspace is local only.`,
  notOnThisMachineFix: (): ModelText =>
    "Use a model on this computer, or turn off privacy.localOnly in workspace.yaml.",
  untrustedWorkspace: (provider: string): ModelText =>
    `provider ${provider} calls a real model, and this workspace isn't trusted on this computer, so nothing was sent.`,
  untrustedWorkspaceFix: (provider: string): ModelText =>
    `Check the workspace, then trust it, or set type: mock in providers/${provider}.yaml to use the test model.`,
  untrustedAddress: (provider: string, origin: string): ModelText =>
    `provider ${provider} would send its key to ${origin}, and this workspace isn't trusted on this computer.`,
  untrustedAddressFix: (provider: string): ModelText =>
    `Check providers/${provider}.yaml, then trust the workspace, or point it at the type's own address.`,
  /**
   * Line 1 of the error for a key that isn't allowed to go to an address. The
   * CLI, a scheduled run's result and the Studio run log all show this one
   * text, so a person gets the same words wherever it ends (HAL-11873). The
   * key is named, never its value.
   */
  originNotAllowed: (provider: string, keyName: string, origin: string): ModelText =>
    `Provider "${provider}" can't send key "${keyName}" to ${origin}. That address isn't allowed for this key. Only allow an address you recognise.`,
  /** The fix, with the command to paste: the key name is quoted, and the address is quoted when a shell would read it. */
  originNotAllowedFix: (keyName: string, origin: string): ModelText =>
    `To allow it, open Models in Halonic Studio, or run: halonic models allow-address "${keyName}" ${shellWord(origin)}`,
  unknownAlias: (alias: string, hubId: string): ModelText =>
    `hub ${hubId} has no model alias ${alias}.`,
  unknownAliasFix: (): ModelText => "Add the alias to models.yaml, or pick one it has.",
  harnessType: (provider: string, type: string): ModelText =>
    `provider ${provider} has type ${type}, and Claude Code and Codex can only call a provider of type anthropic, openai or openai-compatible.`,
  harnessTypeFix: (provider: string): ModelText =>
    `Point the agent's model at an alias whose provider speaks Anthropic's Messages API or OpenAI's Responses API, or change the type in providers/${provider}.yaml.`,
  harnessRoute: (harness: string, provider: string, type: string): ModelText =>
    `${harness} can't call provider ${provider}, which has type ${type}: Claude Code calls a provider of type anthropic, Codex one of type openai or openai-compatible.`,
  harnessRouteFix: (provider: string): ModelText =>
    `Point the agent's model at an alias whose provider its harness can call, or choose the harness that calls providers/${provider}.yaml.`,
  harnessKey: (provider: string): ModelText =>
    `provider ${provider} names no secret, and Claude Code and Codex need a key for a provider Halonic chooses.`,
  harnessKeyFix: (provider: string): ModelText =>
    `Add a secret to providers/${provider}.yaml, or give the agent a model name its program knows, so the program signs in itself.`,
} as const;

/** The address as one safe word for a shell: left as it is when it holds only plain characters, else in double quotes. */
function shellWord(address: string): string {
  return /^[A-Za-z0-9:/._-]+$/u.test(address) ? address : `"${address}"`;
}
