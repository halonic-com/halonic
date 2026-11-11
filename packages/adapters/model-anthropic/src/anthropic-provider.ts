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
import { toWireBody } from "./request.ts";
import { readServerSentEvents } from "./server-sent-events.ts";
import { MessageStreamReader, StreamedVendorError } from "./stream-reply.ts";

/** Anthropic's own address; the provider adds `/v1/messages`. */
export const anthropicBaseUrl = "https://api.anthropic.com";

/**
 * The base address without a trailing `/` or `/v1`, so that both
 * `https://proxy.example` and `https://proxy.example/v1/` reach
 * `https://proxy.example/v1/messages` instead of `/v1/v1/messages`.
 */
function apiRoot(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
}

/** The Messages API version every call asks for. */
const apiVersion = "2023-06-01";

/** The largest reply read, 10 MiB, as `integration-kit` allows a response by default. */
const maxReplyBytes = 10 * 1024 * 1024;

/** The largest error reply read: only its first few hundred characters reach the message. */
const maxErrorBytes = 64 * 1024;

/** Settings for an {@link AnthropicProvider}. */
export interface AnthropicProviderOptions {
  /** The provider's id in the workspace. */
  id: string;
  /** The adapter type it was configured as; "anthropic" when left out. */
  type?: string;
  /**
   * The API's address, such as a proxy's; Anthropic's own when left out.
   * Written without `/v1`, as in Anthropic's own docs, but a trailing `/v1`
   * is accepted too, the way OpenAI-compatible addresses are written.
   */
  baseUrl?: string;
  http: HttpClient;
  /**
   * Gives the API key for one call. The key only ever goes into the
   * `x-api-key` header.
   *
   * @throws {ModelCallError} with `no-key` when the key isn't set
   */
  key: () => Promise<string>;
  /** How long one call may wait; {@link defaultCallLimits} when left out. */
  limits?: CallLimits;
}

/**
 * A model provider that speaks Anthropic's Messages API
 * (`POST {baseUrl}/v1/messages`) on the {@link HttpClient} port, with no SDK.
 * Tools go over the native `tools` and `tool_use` blocks, and `stream()`
 * reads the API's server-sent events.
 *
 * @example
 * const model = new AnthropicProvider({ id: "claude", http: { fetch }, key: readKey });
 * const answer = await model.chat({
 *   model: "claude-sonnet-5-5",
 *   messages: [{ role: "user", content: "Hi" }],
 * });
 */
export class AnthropicProvider implements LlmProvider {
  readonly id: string;
  readonly type: string;
  readonly capabilities: LlmCapabilities = {
    tools: true,
    // The Messages API has no plain JSON mode, only one that needs a schema.
    jsonOutput: false,
    vision: false,
    streaming: true,
  };
  readonly #endpoint: string;
  /** The endpoint's host and port, for an `offline` error. */
  readonly #host: string | undefined;
  readonly #http: HttpClient;
  readonly #key: () => Promise<string>;
  readonly #limits: CallLimits;

  constructor(options: AnthropicProviderOptions) {
    this.id = options.id;
    this.type = options.type ?? "anthropic";
    this.#endpoint = `${apiRoot(options.baseUrl ?? anthropicBaseUrl)}/v1/messages`;
    this.#host = hostOf(this.#endpoint);
    this.#http = options.http;
    this.#key = options.key;
    this.#limits = options.limits ?? defaultCallLimits;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    request.signal?.throwIfAborted();
    const call = this.#failedCall(request);
    const key = await this.#key();
    const timer = new CallTimer(this.#limits, request.signal);
    let body: unknown;
    try {
      const response = await this.#send(request, call, key, timer, { stream: false });
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
   * Streams the answer as the API writes it, then ends with `done`, which
   * equals what {@link AnthropicProvider.chat} gives for the same reply.
   * Stopping early cancels the reply's body, so the call closes. The reply
   * has the same size limit as in `chat()`.
   */
  async *stream(request: ChatRequest): AsyncGenerator<ChatStreamEvent> {
    request.signal?.throwIfAborted();
    const call = this.#failedCall(request);
    const key = await this.#key();
    const timer = new CallTimer(this.#limits, request.signal);
    const reader = new MessageStreamReader();
    try {
      const response = await this.#send(request, call, key, timer, { stream: true });
      const body = await bodyWithin(response, maxReplyBytes);
      if (body === null) throw new ReplyFormatError("no body");
      for await (const event of readServerSentEvents(body)) {
        for (const piece of reader.read(event.data)) {
          yield piece;
          // The caller may have aborted while it handled the piece.
          request.signal?.throwIfAborted();
        }
      }
    } catch (error) {
      request.signal?.throwIfAborted();
      if (timer.timedOut !== undefined) throw errorForTimeout(timer.timedOut, call);
      if (error instanceof ModelCallError) throw error;
      throw errorForStreamFailure(error, call, key);
    } finally {
      timer.end();
    }
    let answer: ChatResponse;
    try {
      answer = reader.finish();
    } catch (error) {
      throw errorForReply(error, call);
    }
    yield { type: "done", response: answer };
  }

  #failedCall(request: ChatRequest): FailedCall {
    return { providerId: this.id, model: request.model, host: this.#host };
  }

  /**
   * Sends the call and gives the reply, watched by `timer`, once its status
   * is OK. An aborted signal rejects with its own reason, a network failure
   * as offline, and an error status with what it means. The caller turns a
   * passed time limit into its error.
   */
  async #send(
    request: ChatRequest,
    call: FailedCall,
    key: string,
    timer: CallTimer,
    options: { stream: boolean },
  ): Promise<Response> {
    const headers = {
      "content-type": "application/json",
      "anthropic-version": apiVersion,
      "x-api-key": key,
    };
    let response: Response;
    try {
      response = await this.#http.fetch(this.#endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(toWireBody(request, options)),
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

/**
 * What a stream that failed after it started fails with: the API's own
 * `error` event, a reply over the size limit, a body we can't read, or else
 * a dropped connection. `key` is the key the call was sent with, kept out of
 * the API's text.
 */
function errorForStreamFailure(error: unknown, call: FailedCall, key: string): unknown {
  if (error instanceof StreamedVendorError) {
    return errorForStreamedError(error.vendorType, error.vendorText, call, key);
  }
  if (error instanceof BodyTooLargeError) return errorForSize(error, call);
  if (error instanceof ReplyFormatError) return errorForReply(error, call);
  return errorForNetwork(error, call);
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
