// Why a model call has no model to go to, as plain sentences. Each reason
// follows the host's own action, as in "✕ Couldn't run Support reply: …"
// in the CLI; the Studio shows them the same way.

/** A sentence of the reason or its fix, with no styling. */
export type ModelText = string;

/** The provider types the engine can call, as the unknown-type fix lists them. */
const knownTypes = "anthropic, openai, openai-compatible, ollama, lmstudio or mock";

/**
 * `loadWorkspace` already reports a missing alias or provider before a run
 * starts, so these show only for what it can't see: a provider type with no
 * adapter, or a workspace changed while it ran.
 */
export const modelTexts = {
  unknownType: (provider: string, type: string): ModelText =>
    `provider ${provider} has type ${type}, which Halonic can't call.`,
  unknownTypeFix: (provider: string): ModelText =>
    `Give providers/${provider}.yaml one of the types ${knownTypes}.`,
  noAddress: (provider: string): ModelText => `provider ${provider} has no baseUrl.`,
  noAddressFix: (provider: string): ModelText =>
    `Add the server's address as baseUrl to providers/${provider}.yaml.`,
  noProvider: (provider: string, model: string): ModelText =>
    `model ${model} names provider ${provider}, which the workspace doesn't have.`,
  noProviderFix: (provider: string): ModelText => `Add providers/${provider}.yaml, then run again.`,
  unknownAlias: (alias: string, hubId: string): ModelText =>
    `hub ${hubId} has no model alias ${alias}.`,
  unknownAliasFix: (): ModelText => "Add the alias to models.yaml, or pick one it has.",
} as const;
