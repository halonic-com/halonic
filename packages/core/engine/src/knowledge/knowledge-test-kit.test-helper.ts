import type { KnowledgeSource } from "@halonicjs/format";
import type {
  KnowledgeCapabilities,
  KnowledgeDoc,
  KnowledgeHit,
  KnowledgeProvider,
  KnowledgeProviderContext,
} from "@halonicjs/ports";
import { secretsWith } from "../agent/turn-test-kit.test-helper.ts";
import type { AgentKnowledgeOptions } from "./agent-knowledge.ts";

/** How a {@link FakeSource} is set up beyond its hits. */
export interface FakeSourceSetup {
  /** As the port has it; left out, the source counts as untrusted. */
  readonly untrusted?: boolean;
  /** Whether it can search; `true` when left out. */
  readonly search?: boolean;
}

/** A knowledge source that finds the same hits for every query and notes each one. */
export class FakeSource implements KnowledgeProvider {
  readonly id: string;
  readonly capabilities: KnowledgeCapabilities;
  readonly untrusted?: boolean;
  readonly queries: { query: string; limit: number | undefined }[] = [];
  readonly #hits: readonly KnowledgeHit[];

  constructor(id: string, hits: readonly KnowledgeHit[], setup: FakeSourceSetup = {}) {
    this.id = id;
    this.capabilities = { search: setup.search ?? true, semantic: false, ingest: false };
    if (setup.untrusted !== undefined) {
      this.untrusted = setup.untrusted;
    }
    this.#hits = hits;
  }

  async search(query: string, options: { limit?: number } = {}): Promise<KnowledgeHit[]> {
    this.queries.push({ query, limit: options.limit });
    return [...this.#hits];
  }

  async get(): Promise<KnowledgeDoc | null> {
    return null;
  }
}

/** A hit with the given ref, a title and a snippet made from it. */
export function hit(ref: string, snippet = `About ${ref}`): KnowledgeHit {
  return { ref, title: `Title of ${ref}`, snippet, score: 1 };
}

/** A knowledge source file with the `fake` provider. */
export function sourceFile(id: string, fields: Partial<KnowledgeSource> = {}): KnowledgeSource {
  return { version: 1, id, provider: "fake", config: { name: id }, ...fields };
}

/** What a factory was asked to build: the source, its config and the base path of its context. */
export interface BuiltSource {
  readonly id: string;
  readonly config: Record<string, unknown>;
  readonly basePath: string;
}

/**
 * Knowledge options with one `fake` factory that builds the given sources by
 * id, and notes what it built. A chat turn's agent gets `chatSources`.
 */
export function fakeKnowledge(
  sources: readonly FakeSource[],
  chatSources: readonly KnowledgeSource[] = [],
) {
  const built: BuiltSource[] = [];
  const options: AgentKnowledgeOptions = {
    factories: [
      {
        type: "fake",
        create: (source, context) => {
          built.push({ id: source.id, config: source.config, basePath: context.basePath });
          const found = sources.find((each) => each.id === source.id);
          if (found === undefined) throw new Error(`No fake source "${source.id}".`);
          return found;
        },
      },
    ],
    contextOf: (hubId) => contextFor(`hubs/${hubId}`),
    chatSourcesOf: async () => chatSources,
  };
  return { options, built };
}

function contextFor(basePath: string): KnowledgeProviderContext {
  return {
    store: {
      location: "memory:test",
      list: async () => [],
      read: async () => null,
      version: async () => "v1",
    },
    basePath,
    http: {
      fetch: async () => {
        throw new Error("The fake sources don't go online.");
      },
    },
    secrets: secretsWith(),
  };
}
