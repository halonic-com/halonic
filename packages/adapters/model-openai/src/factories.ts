// One factory per provider type this adapter serves. They all make the same
// OpenAiCompatibleProvider; a type only fills in what its server usually
// needs (its address, whether it wants a key, the length field). Anything the
// provider's YAML sets wins over the type's default.

import {
  isSecretName,
  type LlmProvider,
  type LlmProviderFactory,
  ModelCallError,
  type ProviderConfig,
  type ProviderFactoryContext,
  type Secrets,
} from "@halonicjs/ports";
import { OpenAiCompatibleProvider } from "./openai-provider.ts";
import type { MaxTokensField } from "./request.ts";

/** What a provider type fills in when the YAML doesn't say. */
interface Preset {
  type: string;
  /** The server's usual address, or undefined when the YAML must give one. */
  baseUrl: string | undefined;
  /** Whether a call without a key can't work, so the provider needs a `secret`. */
  needsKey: boolean;
  maxTokensField: MaxTokensField;
}

/** OpenAI itself: its own address, always a key, and the newer length field its models need. */
export const openAiFactory = presetFactory({
  type: "openai",
  baseUrl: "https://api.openai.com/v1",
  needsKey: true,
  maxTokensField: "max_completion_tokens",
});

/** Any server that copies OpenAI's API; the YAML gives its address, and a key only when it needs one. */
export const openAiCompatibleFactory = presetFactory({
  type: "openai-compatible",
  baseUrl: undefined,
  needsKey: false,
  maxTokensField: "max_tokens",
});

/**
 * Ollama on this machine. It cuts every prompt to its context length, 4096
 * tokens unless the server sets `OLLAMA_CONTEXT_LENGTH`; the chat completions
 * API can't change it per call.
 */
export const ollamaFactory = presetFactory({
  type: "ollama",
  baseUrl: "http://localhost:11434/v1",
  needsKey: false,
  maxTokensField: "max_tokens",
});

/** LM Studio's server on this machine. */
export const lmStudioFactory = presetFactory({
  type: "lmstudio",
  baseUrl: "http://localhost:1234/v1",
  needsKey: false,
  maxTokensField: "max_tokens",
});

/** Every factory of this adapter, to register them all at once. */
export const openAiFactories: readonly LlmProviderFactory[] = [
  openAiFactory,
  openAiCompatibleFactory,
  ollamaFactory,
  lmStudioFactory,
];

function presetFactory(preset: Preset): LlmProviderFactory {
  return {
    type: preset.type,
    create(config: ProviderConfig, context: ProviderFactoryContext): LlmProvider {
      const baseUrl = config.baseUrl ?? preset.baseUrl;
      if (baseUrl === undefined) {
        throw new Error(
          `Provider "${config.id}": a provider of type ${preset.type} needs a baseUrl.`,
        );
      }
      const key = keyFor(config, preset, context.secrets);
      return new OpenAiCompatibleProvider({
        id: config.id,
        type: preset.type,
        baseUrl,
        http: context.http,
        maxTokensField: preset.maxTokensField,
        ...(key === undefined ? {} : { key }),
      });
    },
  };
}

/**
 * How the provider gets its key for a call, or undefined when it sends none.
 * The key is read on every call, so a secret set after the start is picked
 * up, and a missing one fails that call with `no-key` before anything is sent.
 *
 * @throws when the provider's `secret` isn't a valid secret name
 */
function keyFor(
  config: ProviderConfig,
  preset: Preset,
  secrets: Secrets,
): (() => Promise<string>) | undefined {
  const name = config.secret;
  if (name === undefined) {
    if (!preset.needsKey) return undefined;
    return () =>
      Promise.reject(
        new ModelCallError(
          "no-key",
          `${config.id} needs an API key: its provider file names no secret that holds one`,
        ),
      );
  }
  if (!isSecretName(name)) {
    throw new Error(
      `Provider "${config.id}": secret must be a letter, then letters, digits, "-" or "_".`,
    );
  }
  return async () => {
    const value = await secrets.get(name);
    if (value === null || value === "") {
      // A valid secret name is short printable text, so the message may repeat it.
      throw new ModelCallError(
        "no-key",
        `${config.id} has no API key: the secret "${name}" isn't set`,
      );
    }
    return value;
  };
}
