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
   * @throws when the provider can't be reached, refuses the call or `request.signal` aborts it
   */
  chat(request: ChatRequest): Promise<ChatResponse>;
  /**
   * Makes one model call and yields the answer as it is written, ending
   * with a `done` event that holds the full {@link ChatResponse}. Present
   * only when `capabilities.streaming` is true; callers check both and
   * fall back to `chat()`. Aborting `request.signal` ends the stream with
   * an error.
   */
  stream?(request: ChatRequest): AsyncIterable<ChatStreamEvent>;
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
