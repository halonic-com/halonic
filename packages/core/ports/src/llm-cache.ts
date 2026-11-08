import type { ChatResponse } from "./chat.ts";

/** Version of the {@link LlmCache} port. A breaking change bumps it and comes with an ADR. */
export const llmCacheVersion = 1;

/**
 * Model answers by request: a hash of model, messages, tools and settings.
 * A simulation re-run reuses them instead of calling the model again.
 */
export interface LlmCache {
  /** The cached answer, or `null` when there is none. */
  get(key: string): Promise<ChatResponse | null>;
  /** Stores an answer, replacing any answer already stored under the key. */
  set(key: string, response: ChatResponse): Promise<void>;
}
