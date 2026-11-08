import type { DefinitionSource } from "./definition-store.ts";
import type { HttpClient } from "./http-client.ts";
import type { Secrets } from "./secrets.ts";

/** Version of the {@link KnowledgeProvider} and {@link KnowledgeProviderFactory} ports. A breaking change bumps it and comes with an ADR. */
export const knowledgeProviderVersion = 1;

/** One search result. */
export interface KnowledgeHit {
  ref: string;
  title: string;
  snippet: string;
  score: number;
}

/** One whole document. */
export interface KnowledgeDoc {
  ref: string;
  title: string;
  content: string;
}

/** What a knowledge source can do. */
export interface KnowledgeCapabilities {
  search: boolean;
  semantic: boolean;
  ingest: boolean;
}

/** A knowledge source agents can search and read. */
export interface KnowledgeProvider {
  readonly id: string;
  readonly capabilities: KnowledgeCapabilities;
  /**
   * Whether hits and documents may hold text someone outside the workspace
   * wrote, such as a remote server's answers. Halonic fences that text off
   * like an untrusted tool result, so instructions in it aren't followed.
   * Leaving it out counts as `true`: only a source whose content the
   * workspace itself wrote, such as its own files, says `false`.
   */
  readonly untrusted?: boolean;
  /** The best matches first. */
  search(query: string, options?: { limit?: number }): Promise<KnowledgeHit[]>;
  /** The document, or `null` when there is no such ref. */
  get(ref: string): Promise<KnowledgeDoc | null>;
  /** Every document's ref and title, when the provider can list them (for prompts and summaries). */
  list?(): Promise<{ ref: string; title: string }[]>;
}

/** What a factory may use to build a knowledge source. */
export interface KnowledgeProviderContext {
  /** The workspace files; read-only, because a knowledge source never edits them. */
  store: DefinitionSource;
  /** The folder of the hub or workspace the source belongs to, relative to the store. */
  basePath: string;
  http: HttpClient;
  secrets: Secrets;
}

/** Creates knowledge sources of one type from their config. */
export interface KnowledgeProviderFactory {
  readonly type: string;
  create(
    source: { id: string; config: Record<string, unknown> },
    context: KnowledgeProviderContext,
  ): KnowledgeProvider;
}
