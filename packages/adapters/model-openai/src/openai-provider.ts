import type {
  ChatRequest,
  ChatResponse,
  HttpClient,
  LlmCapabilities,
  LlmProvider,
} from "@halonicjs/ports";
import { errorForNetwork, errorForReply, errorForStatus, type FailedCall } from "./call-error.ts";
import { readReply } from "./reply.ts";
import { type MaxTokensField, toWireBody } from "./request.ts";

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
  readonly #http: HttpClient;
  readonly #key: (() => Promise<string>) | undefined;
  readonly #maxTokensField: MaxTokensField;

  constructor(options: OpenAiCompatibleProviderOptions) {
    this.id = options.id;
    this.type = options.type;
    this.#endpoint = `${options.baseUrl.replace(/\/+$/, "")}/chat/completions`;
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
    };
    const response = await this.#send(request, call);
    if (!response.ok) {
      throw errorForStatus(response.status, await textOrEmpty(response), call);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      request.signal?.throwIfAborted();
      throw errorForReply(error, call);
    }
    try {
      return readReply(body);
    } catch (error) {
      throw errorForReply(error, call);
    }
  }

  /** Sends the call. An aborted signal rejects with its own reason, any other failure as offline. */
  async #send(request: ChatRequest, call: FailedCall): Promise<Response> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.#key !== undefined) headers["authorization"] = `Bearer ${await this.#key()}`;
    const body = toWireBody(request, { maxTokensField: this.#maxTokensField });
    try {
      return await this.#http.fetch(this.#endpoint, {
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
  }
}

/** The body of an error reply, or "" when it can't be read. */
async function textOrEmpty(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
