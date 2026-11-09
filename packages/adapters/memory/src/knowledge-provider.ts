import type {
  KnowledgeCapabilities,
  KnowledgeDoc,
  KnowledgeHit,
  KnowledgeProvider,
} from "@halonicjs/ports";
import { copyJson } from "./copy.ts";

/** How a {@link MemoryKnowledgeProvider} is set up. */
export interface MemoryKnowledgeOptions {
  /** Its id; `memory` unless set. */
  id?: string;
  /** Whether it offers search; `true` unless set. */
  search?: boolean;
}

/** How many hits a search gives when the caller sets no limit. */
const defaultLimit = 10;

/** How many characters of the document a hit shows around the first matching word. */
const snippetLength = 80;

/**
 * A knowledge source held in memory, for tests and the browser demo. Search
 * counts whole words, ignoring case: each time a query word appears in a
 * document's title or content adds one to its score.
 */
export class MemoryKnowledgeProvider implements KnowledgeProvider {
  readonly id: string;
  readonly capabilities: KnowledgeCapabilities;
  readonly untrusted = false;
  readonly #docs: Map<string, KnowledgeDoc>;

  constructor(docs: readonly KnowledgeDoc[], options: MemoryKnowledgeOptions = {}) {
    this.id = options.id ?? "memory";
    this.capabilities = { search: options.search ?? true, semantic: false, ingest: false };
    this.#docs = new Map(docs.map((doc) => [doc.ref, copyJson(doc)]));
  }

  async search(query: string, options: { limit?: number } = {}): Promise<KnowledgeHit[]> {
    const queryWords = new Set(wordsOf(query));
    const hits: KnowledgeHit[] = [];
    for (const doc of this.#docs.values()) {
      const score = wordsOf(`${doc.title} ${doc.content}`).filter((word) =>
        queryWords.has(word),
      ).length;
      if (score > 0)
        hits.push({ ref: doc.ref, title: doc.title, snippet: snippetOf(doc, queryWords), score });
    }
    // Best first; equal scores by ref, so the order never depends on insertion.
    hits.sort((a, b) => b.score - a.score || (a.ref < b.ref ? -1 : 1));
    return hits.slice(0, options.limit ?? defaultLimit);
  }

  async get(ref: string): Promise<KnowledgeDoc | null> {
    const doc = this.#docs.get(ref);
    return doc === undefined ? null : copyJson(doc);
  }

  async list(): Promise<{ ref: string; title: string }[]> {
    return [...this.#docs.values()].map(({ ref, title }) => ({ ref, title }));
  }
}

/** A word: a run of letters and digits in any script. */
const wordPattern = /[\p{L}\p{N}]+/gu;

/** The words in `text`, lower-cased. */
function wordsOf(text: string): string[] {
  return [...text.matchAll(wordPattern)].map(([word]) => word.toLowerCase());
}

/**
 * Up to {@link snippetLength} characters of the content, from the first query
 * word in it, or from the start when only the title matched. The word is
 * found in the original text, because lower-casing can change its length.
 */
function snippetOf(doc: KnowledgeDoc, queryWords: ReadonlySet<string>): string {
  for (const match of doc.content.matchAll(wordPattern)) {
    if (queryWords.has(match[0].toLowerCase())) {
      return doc.content.slice(match.index, match.index + snippetLength);
    }
  }
  return doc.content.slice(0, snippetLength);
}
