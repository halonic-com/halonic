import type {
  ChatRequest,
  ChatResponse,
  ChatStreamEvent,
  HttpClient,
  LlmCapabilities,
  LlmProvider,
  ModelCallError,
} from "@halonicjs/ports";
import {
  errorForNetwork,
  errorForReply,
  errorForSize,
  errorForStatus,
  errorForStreamedError,
  type FailedCall,
} from "./call-error.ts";
import { BodyTooLargeError, bodyWithin, readTextWithin } from "./read-body.ts";
import { ReplyFormatError, readReply } from "./reply.ts";
import { type MaxTokensField, toWireBody } from "./request.ts";
import { readSseData } from "./sse.ts";
import { StreamedErrorEvent, StreamedReply } from "./stream-reply.ts";

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
    const { response, call } = await this.#call(request, false);
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
   * Streams the answer as the server writes it. An abort ends the stream
   * with the signal's reason, even when it comes while the caller handles
   * an event; stopping early closes the call. An error event from the
   * server, or a stream without chunks, fails rather than ending with an
   * empty answer. A stream reads at most 10 MiB, as `chat()` does.
   */
  async *stream(request: ChatRequest): AsyncGenerator<ChatStreamEvent> {
    const { response, call, key } = await this.#call(request, true);
    const reply = new StreamedReply();
    let answer: ChatResponse;
    try {
      const body = await bodyWithin(response, maxReplyBytes);
      if (body === null) throw new ReplyFormatError("the reply has no body");
      for await (const data of readSseData(body)) {
        for (const event of reply.add(JSON.parse(data))) {
          yield event;
          request.signal?.throwIfAborted();
        }
      }
      answer = reply.response();
    } catch (error) {
      request.signal?.throwIfAborted();
      throw streamError(error, call, key);
    }
    yield { type: "done", response: answer };
  }

  /**
   * Starts a call and gives the reply once the server took it, with what an
   * error needs to know: the call, and the key so the server's text can be
   * checked for it.
   */
  async #call(
    request: ChatRequest,
    stream: boolean,
  ): Promise<{ response: Response; call: FailedCall; key: string | undefined }> {
    request.signal?.throwIfAborted();
    const call: FailedCall = {
      providerId: this.id,
      model: request.model,
      offeredTools: (request.tools?.length ?? 0) > 0,
      host: this.#host,
    };
    const key = this.#key === undefined ? undefined : await this.#key();
    const response = await this.#send(request, { stream, call, key });
    return { response, call, key };
  }

  /**
   * Sends the call and gives the reply once its status is OK. An aborted
   * signal rejects with its own reason, a network failure as offline, and an
   * error status with what it means.
   */
  async #send(
    request: ChatRequest,
    { stream, call, key }: { stream: boolean; call: FailedCall; key: string | undefined },
  ): Promise<Response> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (key !== undefined) headers["authorization"] = `Bearer ${key}`;
    const body = toWireBody(request, { maxTokensField: this.#maxTokensField, stream });
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

/** The {@link ModelCallError} a stream ends with after `error`. */
function streamError(error: unknown, call: FailedCall, key: string | undefined): ModelCallError {
  if (error instanceof StreamedErrorEvent) return errorForStreamedError(error.event, call, key);
  if (error instanceof BodyTooLargeError) return errorForSize(error, call);
  const unreadable = error instanceof SyntaxError || error instanceof ReplyFormatError;
  return unreadable ? errorForReply(error, call) : errorForNetwork(error, call);
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
