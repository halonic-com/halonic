import type { ChatRequest, ChatResponse } from "./chat.ts";
import type { HttpClient } from "./http-client.ts";
import type { Secrets } from "./secrets.ts";

/** Version of the {@link LlmProvider} and {@link LlmProviderFactory} ports. A breaking change bumps it and comes with an ADR. */
export const llmProviderVersion = 1;

/** What a provider's models can do. */
export interface LlmCapabilities {
  tools: boolean;
  jsonOutput: boolean;
  vision: boolean;
  streaming: boolean;
}

/** A model provider (OpenAI, Gemini, Ollama, the scripted test model …) as one workspace configures it. */
export interface LlmProvider {
  /** The provider's id in the workspace's providers. */
  readonly id: string;
  /** The adapter type, such as "openai". */
  readonly type: string;
  readonly capabilities: LlmCapabilities;
  /**
   * Makes one model call.
   *
   * @throws when the provider can't be reached, refuses the call or `request.signal` aborts it
   */
  chat(request: ChatRequest): Promise<ChatResponse>;
}

/** A provider as the workspace's YAML configures it. */
export interface ProviderConfig {
  id: string;
  type: string;
  baseUrl?: string;
  /** Name of the secret that holds the API key. */
  secret?: string;
  local: boolean;
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
