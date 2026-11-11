import type {
  ChatRequest,
  ChatResponse,
  ChatStreamEvent,
  HttpClient,
  LlmCapabilities,
  LlmProvider,
} from "@halonicjs/ports";
import { ModelCallError } from "@halonicjs/ports";
import {
  errorForNetwork,
  errorForReply,
  errorForSize,
  errorForStatus,
  errorForStreamedError,
  errorForTimeout,
  type FailedCall,
} from "./call-error.ts";
import { type CallLimits, CallTimer, defaultCallLimits } from "./call-timer.ts";
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
  /** How long one call may wait; {@link defaultCallLimits} when left out. */
  limits?: CallLimits;
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
  readonly #limits: CallLimits;

  constructor(options: OpenAiCompatibleProviderOptions) {
    this.id = options.id;
    this.type = options.type;
    this.#endpoint = `${options.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    this.#host = hostOf(this.#endpoint);
    this.#http = options.http;
    this.#key = options.key;
    this.#maxTokensField = options.maxTokensField ?? "max_tokens";
    this.#limits = options.limits ?? defaultCallLimits;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const { call, key } = await this.#prepare(request);
    const timer = new CallTimer(this.#limits, request.signal);
    let body: unknown;
    try {
      const response = await this.#send(request, { stream: false, call, key, timer });
      body = JSON.parse(await readTextWithin(response, maxReplyBytes));
    } catch (error) {
      request.signal?.throwIfAborted();
      if (timer.timedOut !== undefined) throw errorForTimeout(timer.timedOut, call);
      if (error instanceof BodyTooLargeError) throw errorForSize(error, call);
      if (error instanceof ModelCallError) throw error;
      throw errorForReply(error, call);
    } finally {
      timer.end();
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
    const { call, key } = await this.#prepare(request);
    const timer = new CallTimer(this.#limits, request.signal);
    const reply = new StreamedReply();
    let answer: ChatResponse;
    try {
      const response = await this.#send(request, { stream: true, call, key, timer });
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
      if (timer.timedOut !== undefined) throw errorForTimeout(timer.timedOut, call);
      if (error instanceof ModelCallError) throw error;
      throw streamError(error, call, key);
    } finally {
      timer.end();
    }
    yield { type: "done", response: answer };
  }

  /**
   * What a call and its errors need before it is sent: the call, and the key
   * so the server's text can be checked for it.
   */
  async #prepare(request: ChatRequest): Promise<{ call: FailedCall; key: string | undefined }> {
    request.signal?.throwIfAborted();
    const call: FailedCall = {
      providerId: this.id,
      model: request.model,
      offeredTools: (request.tools?.length ?? 0) > 0,
      host: this.#host,
    };
    const key = this.#key === undefined ? undefined : await this.#key();
    return { call, key };
  }

  /**
   * Sends the call and gives the reply, watched by `timer`, once its status
   * is OK. An aborted signal rejects with its own reason, a network failure
   * as offline, and an error status with what it means. The caller turns a
   * passed time limit into its error.
   */
  async #send(request: ChatRequest, sending: Sending): Promise<Response> {
    const { stream, call, key, timer } = sending;
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
        signal: timer.signal,
      });
    } catch (error) {
      if (timer.signal.aborted) throw error;
      throw errorForNetwork(error, call);
    }
    response = timer.watch(response);
    if (response.ok) return response;
    const text = await textOrEmpty(response);
    // Reading the body ends early when the signal aborts; the caller gets the abort, not the status.
    timer.signal.throwIfAborted();
    throw errorForStatus(response.status, text, call, key);
  }
}

/** What {@link OpenAiCompatibleProvider} needs to send one call. */
interface Sending {
  stream: boolean;
  call: FailedCall;
  key: string | undefined;
  timer: CallTimer;
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
