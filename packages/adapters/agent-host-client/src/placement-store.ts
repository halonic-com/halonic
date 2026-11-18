import {
  type AgentPlacementKey,
  type AgentPlacementRecord,
  type AgentPlacementStore,
  isAgentPlacementFor,
} from "@halonicjs/ports";
import { s } from "@halonicjs/schema-kit";
import { type AgentHostTransport, readAnswer } from "./transport.ts";

const placementAnswer = s.object({ placement: s.unknown() }).strict();
const nothing = s.object({}).strict();

/**
 * The engine's `AgentPlacementStore` (it fits it), as a stand-in for the
 * choices the agent host keeps in the person's profile folder, next to the
 * CLI's: a page can't read files. The host serves only a workspace the
 * launcher named, by its real path, and never one inside a workspace.
 *
 * A host that refuses, or can't reach a choice, makes `get` throw, never
 * return `null`, so the caller runs the agent in a sandbox. A choice the
 * host answers that isn't exactly one for the key asked is refused too.
 *
 * @example
 * const store = new AgentHostPlacementStore(transport);
 * await store.get({ location: "/work/acme", agent: "coder" });
 */
export class AgentHostPlacementStore implements AgentPlacementStore {
  readonly #transport: AgentHostTransport;

  constructor(transport: AgentHostTransport) {
    this.#transport = transport;
  }

  /** @throws {@link AgentHostError} `placement_unreadable` with the host's reason, or `unknown_workspace` */
  async get(key: AgentPlacementKey): Promise<AgentPlacementRecord | null> {
    const route = "POST /v1/placements/get";
    const answer = await this.#transport.request(route, { ...keyOf(key) });
    const { placement } = readAnswer(route, answer, placementAnswer);
    if (placement === null) return null;
    if (!isAgentPlacementFor(key, placement)) {
      throw new Error(`${route} answered with a choice that isn't for this agent.`);
    }
    return placement;
  }

  /** @throws {@link AgentHostError} when the host refuses */
  async save(placement: AgentPlacementRecord): Promise<void> {
    const route = "POST /v1/placements/save";
    const { location, agent, runsOn, agentFingerprint, chosenAt } = placement;
    const answer = await this.#transport.request(route, {
      location,
      agent,
      runsOn,
      agentFingerprint,
      chosenAt,
    });
    readAnswer(route, answer, nothing);
  }

  /** @throws {@link AgentHostError} when the host refuses */
  async remove(key: AgentPlacementKey): Promise<void> {
    const route = "POST /v1/placements/remove";
    const answer = await this.#transport.request(route, { ...keyOf(key) });
    readAnswer(route, answer, nothing);
  }
}

/** Only the key's two fields go to the host, even when the caller passes a whole record. */
function keyOf(key: AgentPlacementKey): AgentPlacementKey {
  return { location: key.location, agent: key.agent };
}
