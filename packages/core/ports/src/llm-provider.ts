import type { ChatRequest, ChatResponse, ChatStreamEvent } from "./chat.ts";
import type { HttpClient } from "./http-client.ts";
import type { Secrets } from "./secrets.ts";

/** Version of the {@link LlmProvider} and {@link LlmProviderFactory} ports. A breaking change bumps it and comes with an ADR. */
export const llmProviderVersion = 1;

/** What a provider's models can do. */
export interface LlmCapabilities {
  /** Whether its models can call tools. */
  tools: boolean;
  /** Whether it can be asked for a JSON answer. */
  jsonOutput: boolean;
  /** Whether its models accept images. */
  vision: boolean;
  /** Whether it can stream an answer as it is written. */
  streaming: boolean;
}

/** A model provider (OpenAI, Gemini, Ollama, the scripted test model …) as one workspace configures it. */
export interface LlmProvider {
  /** The provider's id in the workspace's providers. */
  readonly id: string;
  /** The adapter type, such as "openai". */
  readonly type: string;
  /** What its models can do. */
  readonly capabilities: LlmCapabilities;
  /**
   * Makes one model call.
   *
   * @throws {ModelCallError} when the call fails, with the reason why: no
   * key, offline, the model is missing, it can't call tools, or the provider
   * refused. Callers treat any other error as `refused`, except the abort
   * error when `request.signal` aborts the call.
   */
  chat(request: ChatRequest): Promise<ChatResponse>;
  /**
   * Makes one model call and yields the answer as it is written, ending
   * with a `done` event that holds the full {@link ChatResponse}. Present
   * only when `capabilities.streaming` is true; callers check both and
   * fall back to `chat()`. Aborting `request.signal` ends the stream with
   * an error.
   *
   * @throws {ModelCallError} when the call fails, before the first event or
   * during the stream, with the same reason `chat()` would give for the same
   * failure.
   */
  stream?(request: ChatRequest): AsyncIterable<ChatStreamEvent>;
}

/** Every reason a model call can fail with, in {@link ModelCallErrorReason} order. */
export const modelCallErrorReasons = [
  "no-key",
  "offline",
  "model-missing",
  "model-no-tools",
  "refused",
] as const;

/**
 * Why a model call failed:
 * - `no-key`: the provider needs a key and its secret isn't set. A provider
 *   that has a key and is turned away (HTTP 401 or 403) says `refused`.
 * - `offline`: the provider couldn't be reached, such as no network, a DNS
 *   failure, a refused connection or a timeout.
 * - `model-missing`: the provider doesn't have the model asked for.
 * - `model-no-tools`: the model can't call tools and the request offered some.
 * - `refused`: anything else the provider turned down or failed on.
 */
export type ModelCallErrorReason = (typeof modelCallErrorReasons)[number];

/**
 * The error an {@link LlmProvider} throws when a model call fails, so the
 * engine can tell why and decide whether to try the next model. Its message
 * is plain text for the run log; it never holds a key or any part of one.
 *
 * Check for it with {@link isModelCallError}, not `instanceof`: an adapter
 * may be built against its own copy of this package.
 *
 * @example
 * throw new ModelCallError("model-missing", `openai has no model "gpt-9"`);
 */
export class ModelCallError extends Error {
  override readonly name = "ModelCallError";
  readonly reason: ModelCallErrorReason;

  constructor(reason: ModelCallErrorReason, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.reason = reason;
  }
}

/**
 * Whether `value` is a {@link ModelCallError}: an `Error` named
 * "ModelCallError" with one of the known reasons. It works across copies of
 * this package, where `instanceof` doesn't.
 *
 * @example
 * const reason = isModelCallError(error) ? error.reason : "refused";
 */
export function isModelCallError(value: unknown): value is ModelCallError {
  if (!(value instanceof Error) || value.name !== "ModelCallError") return false;
  const reason: unknown = (value as { reason?: unknown }).reason;
  return modelCallErrorReasons.some((known) => known === reason);
}

/** A provider as the workspace's YAML configures it. */
export interface ProviderConfig {
  /** The provider's id in the workspace. */
  id: string;
  /** The adapter type, such as "openai"; picks the factory. */
  type: string;
  /** The provider's address, when it isn't the adapter's default. */
  baseUrl?: string;
  /** The **name** of the secret that holds the API key, never the key itself. */
  secret?: string;
  /** Whether the models run on this machine (such as Ollama), so they have no price. */
  local: boolean;
  /** Settings only this adapter type understands. */
  options: Record<string, unknown>;
}

/** What a factory may use to build a provider. */
export interface ProviderFactoryContext {
  secrets: Secrets;
  http: HttpClient;
}

/** Creates a provider from its YAML config. One factory per adapter type. */
export interface LlmProviderFactory {
  /** The `type` this factory handles. */
  readonly type: string;
  create(config: ProviderConfig, context: ProviderFactoryContext): LlmProvider;
}
