import type {
  ChatRequest,
  ChatResponse,
  ChatStreamEvent,
  HttpClient,
  LlmCapabilities,
  LlmProvider,
} from "@halonicjs/ports";
import { errorForNetwork, errorForReply, errorForStatus, type FailedCall } from "./call-error.ts";
import { ReplyFormatError, readReply } from "./reply.ts";
import { type MaxTokensField, toWireBody } from "./request.ts";
import { readSseData } from "./sse.ts";
import { StreamedReply } from "./stream-reply.ts";

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
 * `tool_calls` fields. `stream()` asks for server-sent events; `chat()`
 * asks for one whole reply, and the contract suite checks both give the
 * same answer.
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
    streaming: true,
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
    const { response, call } = await this.#call(request, false);
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

  /**
   * Streams the answer as the server writes it. An abort ends the stream
   * with the signal's reason, even when it comes while the caller handles
   * an event; stopping early closes the call.
   */
  async *stream(request: ChatRequest): AsyncGenerator<ChatStreamEvent> {
    const { response, call } = await this.#call(request, true);
    const reply = new StreamedReply();
    try {
      if (response.body === null) throw new ReplyFormatError("the reply has no body");
      for await (const data of readSseData(response.body)) {
        for (const event of reply.add(JSON.parse(data))) {
          yield event;
          request.signal?.throwIfAborted();
        }
      }
    } catch (error) {
      request.signal?.throwIfAborted();
      const unreadable = error instanceof SyntaxError || error instanceof ReplyFormatError;
      throw unreadable ? errorForReply(error, call) : errorForNetwork(error, call);
    }
    yield { type: "done", response: reply.response() };
  }

  /** Starts a call and checks the server took it; an error reply becomes a {@link ModelCallError}. */
  async #call(
    request: ChatRequest,
    stream: boolean,
  ): Promise<{ response: Response; call: FailedCall }> {
    request.signal?.throwIfAborted();
    const call: FailedCall = {
      providerId: this.id,
      model: request.model,
      offeredTools: (request.tools?.length ?? 0) > 0,
    };
    const response = await this.#send(request, stream, call);
    if (!response.ok) {
      throw errorForStatus(response.status, await textOrEmpty(response), call);
    }
    return { response, call };
  }

  /** Sends the call. An aborted signal rejects with its own reason, any other failure as offline. */
  async #send(request: ChatRequest, stream: boolean, call: FailedCall): Promise<Response> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.#key !== undefined) headers["authorization"] = `Bearer ${await this.#key()}`;
    const body = toWireBody(request, { maxTokensField: this.#maxTokensField, stream });
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
