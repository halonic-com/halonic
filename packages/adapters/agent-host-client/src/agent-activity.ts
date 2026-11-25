import type { PullRequestList, TeamRuns, TeamRunsQuery } from "@halonicjs/ports";
import { s } from "@halonicjs/schema-kit";
import { type AgentHostTransport, readAnswer } from "./transport.ts";

const itemsAnswer = s.object({ items: s.array(s.unknown()) }).strict();

/**
 * The desktop engine's reads for the Messenger's activity panel, for one
 * workspace (requirement `agent-host-client.agent-activity`): each connected
 * source's runs and pull requests, from the agent host, which runs the
 * providers and holds their keys. The host is Halonic's own, so its lists are
 * passed on as it sends them. Studio provides it as `AgentActivityService`.
 *
 * @example
 * const activity = new AgentHostActivity(transport, "/work/acme");
 * const runs = await activity.runs({ agent: "paperclip:halonic:agent:ada", since });
 */
export class AgentHostActivity {
  readonly #transport: AgentHostTransport;
  readonly #workspace: string;

  constructor(transport: AgentHostTransport, workspace: string) {
    this.#transport = transport;
    this.#workspace = workspace;
  }

  /** Each source's live runs and, with `since`, its runs that started since then; of `agent` only when given. */
  async runs(query: TeamRunsQuery): Promise<readonly TeamRuns[]> {
    const route = "POST /v1/messaging/runs";
    const answer = await this.#transport.request(route, { workspace: this.#workspace, ...query });
    return readAnswer(route, answer, itemsAnswer).items as TeamRuns[];
  }

  /** Each source's open and recent pull requests. */
  async pullRequests(): Promise<readonly PullRequestList[]> {
    const route = "POST /v1/messaging/pull-requests";
    const answer = await this.#transport.request(route, { workspace: this.#workspace });
    return readAnswer(route, answer, itemsAnswer).items as PullRequestList[];
  }
}
