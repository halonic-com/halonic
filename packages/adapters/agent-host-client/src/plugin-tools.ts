import { type Schema, s } from "@halonicjs/schema-kit";
import { type AgentHostTransport, readAnswer } from "./transport.ts";

const toolsSchema = s.object({ inThisBuild: s.boolean() }).strict() satisfies Schema<{
  readonly inThisBuild: boolean;
}>;

/**
 * Whether the agent host's build runs plugin tools at all (HAL-17815). The
 * shipped single executable doesn't, so Studio leaves out the plugin cards and
 * commands it would only refuse, and says it once on the Plugins page.
 *
 * @example
 * if (!(await new AgentHostPluginTools(transport).inThisBuild())) hidePluginCards();
 */
export class AgentHostPluginTools {
  readonly #transport: AgentHostTransport;

  constructor(transport: AgentHostTransport) {
    this.#transport = transport;
  }

  /**
   * `false` when this build of the host has no plugin tools.
   *
   * @throws {@link AgentHostError} when the host can't be reached or answers something else
   */
  async inThisBuild(): Promise<boolean> {
    const route = "GET /v1/plugins/tools";
    return readAnswer(route, await this.#transport.request(route), toolsSchema).inThisBuild;
  }
}
