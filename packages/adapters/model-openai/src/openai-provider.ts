import type {
  ChatRequest,
  ChatResponse,
  HttpClient,
  LlmCapabilities,
  LlmProvider,
} from "@halonicjs/ports";
import {
  errorForNetwork,
  errorForReply,
  errorForSize,
  errorForStatus,
  type FailedCall,
} from "./call-error.ts";
import { BodyTooLargeError, readTextWithin } from "./read-body.ts";
import { readReply } from "./reply.ts";
import { type MaxTokensField, toWireBody } from "./request.ts";

/** The largest reply read, 10 MiB, as `integration-kit` allows a response by default. */
const maxReplyBytes = 10 * 1024 * 1024;

/** The largest error reply read: only its first few hundred characters reach the message. */
const maxErrorBytes = 64 * 1024;

/** Settings for an {@link OpenAiCompatibleProvider}. */
export interface OpenAiCompatibleProviderOptions {
  /** The provider's id in the workspace. */
  id: string;
  /** The adapter type it was configured as, such as "openai" or "ollama". */
  type: string;
  /** The API's address up to and including `/v1`, such as `http://localhost:11434/v1`. */
  baseUrl: string;
  http: HttpClient;
  /**
   * Gives the API key for one call; left out for servers that need none.
   * The key only ever goes into the `Authorization` header.
   *
   * @throws {ModelCallError} with `no-key` when the key isn't set
   */
  key?: () => Promise<string>;
  /** The field that limits the answer's length; `max_tokens` unless the vendor wants the newer one. */
  maxTokensField?: MaxTokensField;
}

/**
 * A model provider that speaks OpenAI's chat completions API
 * (`POST {baseUrl}/chat/completions`): OpenAI itself, and Ollama, LM Studio
 * and other servers that copy it. Tools go over the native `tools` and
 * `tool_calls` fields.
 *
 * @example
 * const model = new OpenAiCompatibleProvider({
 *   id: "local",
 *   type: "ollama",
 *   baseUrl: "http://localhost:11434/v1",
 *   http: { fetch },
 * });
 * const answer = await model.chat({ model: "qwen3", messages: [{ role: "user", content: "Hi" }] });
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly id: string;
  readonly type: string;
  readonly capabilities: LlmCapabilities = {
    tools: true,
    jsonOutput: true,
    vision: false,
    streaming: false,
  };
  readonly #endpoint: string;
  /** The endpoint's host and port, for an `offline` error. */
  readonly #host: string | undefined;
  readonly #http: HttpClient;
  readonly #key: (() => Promise<string>) | undefined;
  readonly #maxTokensField: MaxTokensField;

  constructor(options: OpenAiCompatibleProviderOptions) {
    this.id = options.id;
    this.type = options.type;
    this.#endpoint = `${options.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    this.#host = hostOf(this.#endpoint);
    this.#http = options.http;
    this.#key = options.key;
    this.#maxTokensField = options.maxTokensField ?? "max_tokens";
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    request.signal?.throwIfAborted();
    const call: FailedCall = {
      providerId: this.id,
      model: request.model,
      offeredTools: (request.tools?.length ?? 0) > 0,
      host: this.#host,
    };
    const response = await this.#send(request, call);
    let body: unknown;
    try {
      body = JSON.parse(await readTextWithin(response, maxReplyBytes));
    } catch (error) {
      request.signal?.throwIfAborted();
      if (error instanceof BodyTooLargeError) throw errorForSize(error, call);
      throw errorForReply(error, call);
    }
    try {
      return readReply(body);
    } catch (error) {
      throw errorForReply(error, call);
    }
  }

  /**
   * Sends the call and gives the reply once its status is OK. An aborted
   * signal rejects with its own reason, a network failure as offline, and an
   * error status with what it means.
   */
  async #send(request: ChatRequest, call: FailedCall): Promise<Response> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    const key = this.#key === undefined ? undefined : await this.#key();
    if (key !== undefined) headers["authorization"] = `Bearer ${key}`;
    const body = toWireBody(request, { maxTokensField: this.#maxTokensField });
    let response: Response;
    try {
      response = await this.#http.fetch(this.#endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        // A redirect would carry the key to another address.
        redirect: "error",
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      });
    } catch (error) {
      request.signal?.throwIfAborted();
      throw errorForNetwork(error, call);
    }
    if (response.ok) return response;
    const text = await textOrEmpty(response);
    // Reading the body ends early when the signal aborts; the caller gets the abort, not the status.
    request.signal?.throwIfAborted();
    throw errorForStatus(response.status, text, call, key);
  }
}

/** The body of an error reply, or "" when it can't be read or is too large. */
async function textOrEmpty(response: Response): Promise<string> {
  try {
    return await readTextWithin(response, maxErrorBytes);
  } catch {
    return "";
  }
}

/** The host and port of `url`, or undefined when it doesn't parse. */
function hostOf(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}
