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
   * key, offline, the model is missing, it can't call tools, it ran out of
   * memory, the key wasn't accepted, the account is out of credit, the
   * provider is busy, or the provider refused. Callers treat any other error as `refused`, except the abort
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
  "out-of-memory",
  "key-refused",
  "out-of-credit",
  "provider-busy",
  "refused",
] as const;

/**
 * Why a model call failed:
 * - `no-key`: the provider needs a key and its secret isn't set. A provider
 *   that has a key and is turned away says `key-refused`.
 * - `offline`: the provider couldn't be reached, such as no network, a DNS
 *   failure, a refused connection or a timeout. The error names the `host`
 *   when the provider knows it.
 * - `model-missing`: the provider doesn't have the model asked for.
 * - `model-no-tools`: the model can't call tools and the request offered some.
 * - `out-of-memory`: the model doesn't fit in the memory of the machine that
 *   runs it. Providers find it with {@link isModelOutOfMemory}.
 * - `key-refused`: the provider didn't accept the key (HTTP 401 or 403).
 * - `out-of-credit`: the account at the provider has no credit left or
 *   reached its spending limit, such as HTTP 402 or OpenAI's 429 with
 *   `insufficient_quota`. This is never Halonic's own budget.
 * - `provider-busy`: the provider is overloaded or asked the caller to slow
 *   down, such as any other HTTP 429, a 5xx or Anthropic's 529.
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
 * throw new ModelCallError("offline", "Ollama didn't answer.", { host: "localhost:11434", cause });
 */
export class ModelCallError extends Error {
  override readonly name = "ModelCallError";
  readonly reason: ModelCallErrorReason;
  /**
   * With `offline` only: the host that didn't answer, as its name and port,
   * such as `localhost:11434`. Never a URL with a path, a query or a key.
   */
  readonly host: string | undefined;

  /**
   * @param reason - why the call failed
   * @param message - plain text for the run log, never a key
   * @param options - `cause` keeps the error this one wraps; `host` names the
   * host that didn't answer, and is kept only with `offline`
   */
  constructor(
    reason: ModelCallErrorReason,
    message: string,
    options?: { cause?: unknown; host?: string },
  ) {
    super(message, options);
    this.reason = reason;
    this.host = reason === "offline" ? options?.host : undefined;
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
  const { reason, host } = value as { reason?: unknown; host?: unknown };
  const knownReason = modelCallErrorReasons.some((known) => known === reason);
  return knownReason && (host === undefined || typeof host === "string");
}

/**
 * The provider's own error text, as the `cause` of a {@link ModelCallError}
 * for an error reply (requirement `ports.vendor-error-text`). It stays
 * out of the message, which Studio and the command line show: microcopy 1.4
 * allows no quoted outside text there. The engine keeps it in the run log
 * for `--debug` and Copy details.
 *
 * The provider shortens the text and checks it for keys before it builds
 * one: whatever is in it may end up in the run log.
 *
 * Check for it with {@link isVendorErrorText}, not `instanceof`: an adapter
 * may be built against its own copy of this package.
 *
 * @example
 * const cause = new VendorErrorText(400, "max_tokens: 200000 > 64000");
 * throw new ModelCallError("refused", `anthropic refused the call (HTTP 400)`, { cause });
 */
export class VendorErrorText extends Error {
  override readonly name = "VendorErrorText";
  /**
   * The HTTP status the text came with, or for an error in a stream the
   * status its error type stands for; undefined when there is none.
   */
  readonly status: number | undefined;

  /**
   * @param status - the HTTP status the text came with, or undefined when there is none
   * @param text - the provider's text, already shortened and checked for keys
   */
  constructor(status: number | undefined, text: string) {
    super(text);
    this.status = status;
  }
}

/**
 * Whether `value` is a {@link VendorErrorText}: an `Error` named
 * "VendorErrorText" with a `status` that is a whole number or set to
 * undefined. It works across copies of this package, where `instanceof`
 * doesn't.
 *
 * @example
 * const text = isVendorErrorText(error.cause) ? error.cause.message : undefined;
 */
export function isVendorErrorText(value: unknown): value is VendorErrorText {
  if (!(value instanceof Error) || value.name !== "VendorErrorText") return false;
  if (!Object.hasOwn(value, "status")) return false;
  const { status } = value as { status?: unknown };
  return status === undefined || Number.isInteger(status);
}

// What model servers say when the model doesn't fit in memory: Ollama's own
// check, llama.cpp's allocation failures, and the CUDA, ROCm and Metal
// messages they pass on. Lower case, matched anywhere in the text.
const outOfMemoryPhrases = [
  "out of memory",
  // Ollama's llama-server loader: "llama-server reported out-of-memory during startup: …".
  "out-of-memory",
  "requires more system memory",
  "insufficient memory",
  "not enough memory",
  "failed to allocate",
  "unable to allocate",
  "cudamalloc failed",
  "hipmalloc failed",
];

/**
 * True when a model server's error text says the model ran out of memory.
 * A provider calls it on an error body, then throws a {@link ModelCallError}
 * with `out-of-memory` (requirement `ports.model-out-of-memory-text`).
 *
 * @example
 * isModelOutOfMemory("model requires more system memory (12.0 GiB) than is available (7.6 GiB)"); // true
 */
export function isModelOutOfMemory(text: string): boolean {
  const lowered = text.toLowerCase();
  return outOfMemoryPhrases.some((phrase) => lowered.includes(phrase));
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
