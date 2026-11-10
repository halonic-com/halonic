import { defineMessages } from "./define.ts";
import { phrase } from "./phrase.ts";

/** The provider types the CLI can call, as the unknown-type fix lists them. */
const knownTypes = "anthropic, openai, openai-compatible, ollama, lmstudio or mock";

/**
 * Why a run's model call has no model to go to. `loadWorkspace` already
 * reports a missing alias or provider before a run starts, so these show only
 * for what it can't see: a provider type the CLI has no adapter for, or a
 * workspace changed while it ran. Each reason follows the command's action on
 * line 1, as in "✕ Couldn't run Support reply: …".
 */
export const modelMessages = defineMessages("models", {
  unknownType: (provider: string, type: string) =>
    phrase`provider ${provider} has type ${type}, which Halonic can't call.`,
  unknownTypeFix: (provider: string) =>
    phrase`Give providers/${provider}.yaml one of the types ${knownTypes}.`,
  noAddress: (provider: string) => phrase`provider ${provider} has no baseUrl.`,
  noAddressFix: (provider: string) =>
    phrase`Add the server's address as baseUrl to providers/${provider}.yaml.`,
  noProvider: (provider: string, model: string) =>
    phrase`model ${model} names provider ${provider}, which the workspace doesn't have.`,
  noProviderFix: (provider: string) => phrase`Add providers/${provider}.yaml, then run again.`,
  unknownAlias: (alias: string, hubId: string) => phrase`hub ${hubId} has no model alias ${alias}.`,
  unknownAliasFix: () => phrase`Add the alias to models.yaml, or pick one it has.`,
});
