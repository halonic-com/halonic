// An agent's `knowledge:` sources as the providers a turn searches and
// reads (HAL-4174). The engine builds each one through the factory of its
// `provider` type; the host gives the factories and what they build with.

import type { KnowledgeSource } from "@halonicjs/format";
import type {
  ChatTurnRequest,
  KnowledgeProvider,
  KnowledgeProviderContext,
  KnowledgeProviderFactory,
} from "@halonicjs/ports";

/** What the engine needs to give agents their knowledge sources. */
export interface AgentKnowledgeOptions {
  /** One factory per provider type, such as `files` or `mcp`. */
  readonly factories: readonly KnowledgeProviderFactory[];
  /**
   * What a factory builds one of a hub's sources with: the workspace files,
   * the folder of the hub or workspace the source belongs to, HTTP and secrets.
   */
  contextOf(hubId: string, source: KnowledgeSource): KnowledgeProviderContext;
  /**
   * The sources a chat turn's agent lists, as the workspace has them now; none
   * for a turn without an agent. A run reads them from its kept definitions instead.
   */
  chatSourcesOf(request: ChatTurnRequest): Promise<readonly KnowledgeSource[]>;
}

/** An agent's knowledge sources, built and ready for a turn. */
export interface AgentKnowledge {
  /** Every source, in the order the agent lists them. */
  readonly sources: readonly KnowledgeProvider[];
  /** The sources with `mode: auto`, whose passages go into the prompt before the first model call. */
  readonly auto: readonly KnowledgeProvider[];
}

/** An agent without knowledge sources. */
export const noKnowledge: AgentKnowledge = { sources: [], auto: [] };

/**
 * Builds the providers of an agent's knowledge sources (requirement
 * `engine.agent-knowledge`), each through the factory of its `provider` type.
 *
 * @param ids - the ids in the agent's `knowledge`
 * @param known - the sources the agent's hub can see, by id; an id that isn't here is left out
 * @throws Error naming the source, its type and the types the engine has, when no factory builds that type
 *
 * @example
 * const knowledge = agentKnowledge("support", ["handbook"], definitions.knowledge ?? {}, options);
 * knowledge.sources.map((source) => source.id); // ["handbook"]
 */
export function agentKnowledge(
  hubId: string,
  ids: readonly string[],
  known: Readonly<Record<string, KnowledgeSource>>,
  options: AgentKnowledgeOptions,
): AgentKnowledge {
  const listed = ids.flatMap((id) =>
    Object.hasOwn(known, id) ? [known[id] as KnowledgeSource] : [],
  );
  return openSources(hubId, listed, options);
}

/**
 * Builds the providers of sources the host already picked, as
 * {@link agentKnowledge} does.
 *
 * @throws Error naming the source, its type and the types the engine has, when no factory builds that type
 */
export function openSources(
  hubId: string,
  listed: readonly KnowledgeSource[],
  options: AgentKnowledgeOptions,
): AgentKnowledge {
  if (listed.length === 0) {
    return noKnowledge;
  }
  const sources: KnowledgeProvider[] = [];
  const auto: KnowledgeProvider[] = [];
  for (const source of listed) {
    const provider = factoryOf(source, options.factories).create(
      { id: source.id, config: source.config },
      options.contextOf(hubId, source),
    );
    sources.push(provider);
    if (source.mode === "auto") {
      auto.push(provider);
    }
  }
  return { sources, auto };
}

function factoryOf(
  source: KnowledgeSource,
  factories: readonly KnowledgeProviderFactory[],
): KnowledgeProviderFactory {
  const factory = factories.find((each) => each.type === source.provider);
  if (factory === undefined) {
    const types = factories.map((each) => `"${each.type}"`).join(", ");
    const fix =
      types === ""
        ? `It has no knowledge providers, so take "${source.id}" out of the agent's knowledge.`
        : `Change the source's provider to one it has: ${types}.`;
    throw new Error(
      `The knowledge source "${source.id}" needs the provider "${source.provider}", and this engine doesn't have it. ${fix}`,
    );
  }
  return factory;
}
