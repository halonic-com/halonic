// Turns a workspace's provider files into model providers the engine can
// call: the mock model, Anthropic, and OpenAI with the servers that copy its
// API. It is a plain function of its inputs (the provider file, the secrets
// and the HTTP client) and never reads the CLI's printer, argv or `process`
// (Liam, HAL-3895), so it can move into a package Studio shares once Studio
// starts runs.

import { AnthropicProvider } from "@halonicjs/adapter-model-anthropic";
import { mockFactory } from "@halonicjs/adapter-model-mock";
import { OpenAiCompatibleProvider } from "@halonicjs/adapter-model-openai";
import type { Provider } from "@halonicjs/format";
import {
  type LlmProvider,
  ModelCallError,
  type ProviderFactoryContext,
  type Secrets,
  workspaceSecrets,
} from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { defaultLocalBaseUrl } from "./doctor-workspace.ts";
import type { Message } from "./messages/define.ts";
import { modelMessages } from "./messages/models.ts";
import { plainText } from "./messages/phrase.ts";

/** OpenAI's own API address, for a provider of type `openai` without a `baseUrl`. */
export const openAiBaseUrl = "https://api.openai.com/v1";

/** The types that speak OpenAI's chat completions API. */
const openAiCompatibleTypes = new Set(["openai", "openai-compatible", "ollama", "lmstudio"]);

/**
 * The model provider for one provider file.
 *
 * - `mock` → the mock model, with the file's `options.script`
 * - `anthropic` → Anthropic's Messages API, at `baseUrl` or Anthropic's own address
 * - `openai`, `openai-compatible`, `ollama`, `lmstudio` → OpenAI's chat
 *   completions API, at `baseUrl` or the type's default address
 *
 * The key is read from `context.secrets` by the file's `secret` name for
 * each call, never before, through `workspaceSecrets` so a file can't name
 * one of Halonic's own secrets. Pass the CLI's remembered secrets, so the
 * error printer can scrub any key that reaches it.
 *
 * @throws {WorkspaceModelError} `unknown-provider-type` for a type with no
 *   adapter, or `no-provider-address` for an `openai-compatible` file without
 *   `baseUrl`
 *
 * @example
 * const model = workspaceProvider(file, { secrets, http: { fetch } });
 */
export function workspaceProvider(
  file: ProviderFile,
  context: ProviderFactoryContext,
): LlmProvider {
  const secrets = workspaceSecrets(context.secrets);
  if (file.type === "mock") {
    return mockFactory.create(providerConfig(file), { ...context, secrets });
  }
  if (file.type === "anthropic") {
    return new AnthropicProvider({
      id: file.id,
      http: context.http,
      key: keyReader(file, secrets),
      ...(file.baseUrl === undefined ? {} : { baseUrl: file.baseUrl }),
    });
  }
  if (openAiCompatibleTypes.has(file.type)) {
    return new OpenAiCompatibleProvider({
      id: file.id,
      type: file.type,
      baseUrl: openAiCompatibleAddress(file),
      http: context.http,
      // OpenAI's newer models take only the newer field; the servers that copy its API take the older one.
      maxTokensField: file.type === "openai" ? "max_completion_tokens" : "max_tokens",
      ...(file.secret === undefined ? {} : { key: keyReader(file, secrets) }),
    });
  }
  throw new WorkspaceModelError(
    "unknown-provider-type",
    modelMessages.unknownType(file.id, file.type),
    modelMessages.unknownTypeFix(file.id),
  );
}

/**
 * Why a run's model call has no model to go to, as the CLI prints it:
 * `not_found`, so exit 4. Its message is the reason and its fix the next
 * step; the command's own action makes line 1.
 */
export class WorkspaceModelError extends KindedError {
  /** The detailed code on line 3 and in `--json`. */
  readonly code: WorkspaceModelErrorCode;

  constructor(code: WorkspaceModelErrorCode, reason: Message, fix: Message) {
    super("not_found", plainText(reason.phrase), { fix: plainText(fix.phrase) });
    this.code = code;
  }
}

/** The codes of {@link WorkspaceModelError}. */
export type WorkspaceModelErrorCode =
  | "unknown-provider-type"
  | "no-provider-address"
  | "no-provider"
  | "unknown-model-alias";

/** What {@link workspaceProvider} reads from a provider file, or from an agent's unsaved settings. */
export type ProviderFile = Pick<
  Provider,
  "id" | "type" | "baseUrl" | "secret" | "local" | "options"
>;

/** The file as the port's factories take it. */
function providerConfig(file: ProviderFile) {
  return {
    id: file.id,
    type: file.type,
    local: file.local,
    options: file.options,
    ...(file.baseUrl === undefined ? {} : { baseUrl: file.baseUrl }),
    ...(file.secret === undefined ? {} : { secret: file.secret }),
  };
}

/** `baseUrl`, else OpenAI's own address or a local server's default one. */
function openAiCompatibleAddress(file: ProviderFile): string {
  const address =
    file.baseUrl ?? (file.type === "openai" ? openAiBaseUrl : defaultLocalBaseUrl(file.type));
  if (address === undefined) {
    throw new WorkspaceModelError(
      "no-provider-address",
      modelMessages.noAddress(file.id),
      modelMessages.noAddressFix(file.id),
    );
  }
  return address;
}

/**
 * Reads the provider's key for one call. A file without `secret`, or a
 * secret that isn't set, fails the call with `no-key`, which the engine
 * turns into its own run failure. The message names the secret, never a key.
 */
function keyReader(file: ProviderFile, secrets: Secrets): () => Promise<string> {
  return async () => {
    const key = file.secret === undefined ? null : await secrets.get(file.secret);
    if (key === null) {
      throw new ModelCallError(
        "no-key",
        file.secret === undefined
          ? `Provider "${file.id}" names no secret for its key.`
          : `Provider "${file.id}" has no key: the secret "${file.secret}" isn't set.`,
      );
    }
    return key;
  };
}
