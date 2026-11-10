import type {
  ChatRequest,
  ChatResponse,
  HttpClient,
  LlmCapabilities,
  LlmProvider,
} from "@halonicjs/ports";
import { errorForNetwork, errorForReply, errorForStatus, type FailedCall } from "./call-error.ts";
import { readReply } from "./reply.ts";
import { toWireBody } from "./request.ts";

/** Anthropic's own address; the provider adds `/v1/messages`. */
export const anthropicBaseUrl = "https://api.anthropic.com";

/** The Messages API version every call asks for. */
const apiVersion = "2023-06-01";

/** Settings for an {@link AnthropicProvider}. */
export interface AnthropicProviderOptions {
  /** The provider's id in the workspace. */
  id: string;
  /** The adapter type it was configured as; "anthropic" when left out. */
  type?: string;
  /** The API's address without `/v1`, such as a proxy's; Anthropic's own when left out. */
  baseUrl?: string;
  http: HttpClient;
  /**
   * Gives the API key for one call. The key only ever goes into the
   * `x-api-key` header.
   *
   * @throws {ModelCallError} with `no-key` when the key isn't set
   */
  key: () => Promise<string>;
}

/**
 * A model provider that speaks Anthropic's Messages API
 * (`POST {baseUrl}/v1/messages`) on the {@link HttpClient} port, with no SDK.
 * Tools go over the native `tools` and `tool_use` blocks. Streaming comes in
 * the next pull request of HAL-2921.
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
    streaming: false,
  };
  readonly #endpoint: string;
  readonly #http: HttpClient;
  readonly #key: () => Promise<string>;

  constructor(options: AnthropicProviderOptions) {
    this.id = options.id;
    this.type = options.type ?? "anthropic";
    this.#endpoint = `${(options.baseUrl ?? anthropicBaseUrl).replace(/\/+$/, "")}/v1/messages`;
    this.#http = options.http;
    this.#key = options.key;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    request.signal?.throwIfAborted();
    const call = this.#failedCall(request);
    const response = await this.#send(request, call);
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

  #failedCall(request: ChatRequest): FailedCall {
    return { providerId: this.id, model: request.model };
  }

  /**
   * Sends the call and gives the reply once its status is OK. An aborted
   * signal rejects with its own reason, a network failure as offline, and an
   * error status with what it means.
   */
  async #send(request: ChatRequest, call: FailedCall): Promise<Response> {
    const headers = {
      "content-type": "application/json",
      "anthropic-version": apiVersion,
      "x-api-key": await this.#key(),
    };
    let response: Response;
    try {
      response = await this.#http.fetch(this.#endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(toWireBody(request, { stream: false })),
        // A redirect would carry the key to another address.
        redirect: "error",
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      });
    } catch (error) {
      request.signal?.throwIfAborted();
      throw errorForNetwork(error, call);
    }
    if (!response.ok) throw errorForStatus(response.status, await textOrEmpty(response), call);
    return response;
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
