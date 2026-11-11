// What the local executor works with: everything comes in through these
// options, so the executor has no registry and no adapters.

import type { Agent, Connector } from "@halonicjs/format";
import type {
  ChatTurnRequest,
  Clock,
  ConnectorClient,
  RecordStore,
  Secrets,
} from "@halonicjs/ports";
import type { ResolvedModel } from "./agent/model-chain.ts";
import type { HalonicTool } from "./agent/turn-tools.ts";
import type { AgentKnowledgeOptions } from "./knowledge/agent-knowledge.ts";
import type { LocalRunsOptions } from "./run/local-runs-options.ts";

/** What a {@link LocalExecutor} works with. Everything comes in here: no registry, no adapters. */
export interface LocalExecutorOptions {
  /**
   * Picks the model of a chat turn from its request: `alias`, `agentId` and
   * the unsaved `agent` settings, with the alias's own fallbacks. The
   * workspace package plugs in here once it has model aliases.
   *
   * @throws when no model fits; `chatTurn` then rejects with that error
   */
  resolveModel(request: ChatTurnRequest): Promise<ResolvedModel>;
  /** Halonic's own tools, offered after the caller's. */
  readonly halonicTools: readonly HalonicTool[];
  /**
   * Where agents keep their notes and their collections' records. With it,
   * a run's model call, and a chat turn that names an agent, also offer that
   * agent's memory tools, after the other Halonic tools; and a run's agent
   * with `collections` gets its records tools.
   */
  readonly memory?: RecordStore;
  /**
   * Builds agents' knowledge sources. With it, a run's agent and a chat
   * turn's agent get the sources their `knowledge` lists; without it, none.
   */
  readonly knowledge?: AgentKnowledgeOptions;
  /**
   * The connected servers, whose tools are offered last: in chat turns, and
   * in every run when `runs.runConnectors` isn't given.
   */
  readonly connectors: readonly ConnectorClient[];
  /** Where a turn checks that a model's key is set, to skip the model before calling it when it isn't. */
  readonly secrets: Secrets;
  readonly clock: Clock;
  /** The most model calls one chat turn makes; 20 when left out. */
  readonly maxRounds?: number;
  /** What runs need. Without it, the executor runs chat turns only and refuses runs. */
  readonly runs?: LocalRunsOptions;
  /**
   * The file of a chat turn's agent as the workspace has it now; `undefined`
   * for an agent that has none. With it, a chat with an agent whose file
   * names a harness program runs in that harness, with `runs.harnesses`;
   * without it, every chat turn runs in Halonic's own loop.
   */
  chatAgentOf?(request: ChatTurnRequest): Promise<Agent | undefined>;
  /**
   * Each connector file's `tools` lists by connector id, as the workspace
   * has them now, for a chat turn. With it, a chat offers each connector
   * only the tools its file's `allow` names, and refuses a call to one its
   * `approve` names, as a run does (HAL-5503); a connector with no lists
   * here isn't offered. Without it, a chat turn offers every tool its
   * connectors list and checks only the risk the servers give.
   */
  chatConnectorToolsOf?(
    request: ChatTurnRequest,
  ): Promise<Readonly<Record<string, Connector["tools"]>>>;
  /**
   * Local-only workspace (`privacy.localOnly`): Halonic's own loop skips models that aren't
   * `local` (a run left with none fails `local-only`) and uses only `local` connectors, also
   * those of `runs.runConnectors`. An agent in a harness program (`runs.harnesses`) is
   * refused before it starts.
   */
  readonly localOnly?: boolean;
}
