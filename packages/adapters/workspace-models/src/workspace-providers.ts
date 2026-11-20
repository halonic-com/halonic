// Turns a workspace's provider files into model providers the engine can
// call: the mock model, Anthropic, and OpenAI with the servers that copy its
// API. It is a plain function of its inputs (the provider file, the secrets
// and the HTTP client) and never reads the CLI's printer, argv or `process`
// (Liam, HAL-3895), so it can move into a package Studio shares once Studio
// starts runs.

import { AnthropicProvider } from "@halonicjs/adapter-model-anthropic";
import { mockFactory } from "@halonicjs/adapter-model-mock";
import { OpenAiCompatibleProvider } from "@halonicjs/adapter-model-openai";
import { openAiCompatibleTypes, type Provider } from "@halonicjs/format";
import {
  type LlmProvider,
  ModelCallError,
  type ProviderFactoryContext,
  type Secrets,
  workspaceSecrets,
} from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { defaultLocalBaseUrl } from "./default-addresses.ts";
import { type ModelText, modelTexts } from "./model-texts.ts";

/** OpenAI's own API address, for a provider of type `openai` without a `baseUrl`. */
export const openAiBaseUrl = "https://api.openai.com/v1";

/** The types that speak OpenAI's chat completions API. */
const openAiCompatible = new Set<string>(openAiCompatibleTypes);

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
  if (openAiCompatible.has(file.type)) {
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
    modelTexts.unknownType(file.id, file.type),
    modelTexts.unknownTypeFix(file.id),
    { provider: file.id, type: file.type },
  );
}

/**
 * Why a run's model call has no model to go to, as the CLI prints it:
 * `not_found`, so exit 4, or `denied` for `untrusted-workspace`, `untrusted-provider-address` and
 * `key-origin-not-allowed`. Its
 * message is the reason and its fix the next step; the command's own action
 * makes line 1.
 */
export class WorkspaceModelError extends KindedError {
  /** The detailed code on line 3 and in `--json`. */
  readonly code: WorkspaceModelErrorCode;
  /**
   * The cause the engine logs on `run.failed` when this error stops a run:
   * the code as `models.<code>`, and the names it is about, such as
   * `{ provider: "acme", type: "acme-cloud" }`, so a host can word it
   * without reading the message.
   */
  readonly failureCause: {
    readonly code: string;
    readonly detail?: Readonly<Record<string, string>>;
  };

  constructor(
    code: WorkspaceModelErrorCode,
    reason: ModelText,
    fix: ModelText,
    detail?: Readonly<Record<string, string>>,
  ) {
    super(
      code === "untrusted-workspace" ||
        code === "untrusted-provider-address" ||
        code === "key-origin-not-allowed"
        ? "denied"
        : "not_found",
      reason,
      { fix },
    );
    this.code = code;
    this.failureCause = { code: `models.${code}`, ...(detail === undefined ? {} : { detail }) };
  }
}

/** The codes of {@link WorkspaceModelError}. */
export type WorkspaceModelErrorCode =
  | "unknown-provider-type"
  | "no-provider-address"
  | "no-provider"
  | "untrusted-workspace"
  | "untrusted-provider-address"
  | "key-origin-not-allowed"
  | "not-on-this-machine"
  | "unknown-model-alias"
  | "not-for-harness";

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

/**
 * The address a provider of this type and `baseUrl` calls: `baseUrl`, else
 * OpenAI's own address or a local server's default one, or `undefined` when
 * the type has none (Anthropic's adapter then uses its built-in address).
 * The provider and the serve check on a turn's model settings both read it, so
 * they can't differ.
 */
export function providerAddress(type: string, baseUrl: string | undefined): string | undefined {
  return baseUrl ?? (type === "openai" ? openAiBaseUrl : defaultLocalBaseUrl(type));
}

/** {@link providerAddress}, or the error for a provider that has none. */
function openAiCompatibleAddress(file: ProviderFile): string {
  const address = providerAddress(file.type, file.baseUrl);
  if (address === undefined) {
    throw new WorkspaceModelError(
      "no-provider-address",
      modelTexts.noAddress(file.id),
      modelTexts.noAddressFix(file.id),
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
