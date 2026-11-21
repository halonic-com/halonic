import { type Schema, s } from "@halonicjs/schema-kit";
import { type AgentHostTransport, readAnswer } from "./transport.ts";

/**
 * Whether a plugin's runner stopped because the sandbox failed while it ran
 * (A23), as the agent host keeps it for this session, and since when.
 */
export type PluginRunState =
  | { readonly stopped: true; readonly stoppedAt: string }
  | { readonly stopped: false };

const runStateSchema = s.union([
  s.object({ stopped: s.literal(true), stoppedAt: s.string().min(1) }).strict(),
  s.object({ stopped: s.literal(false) }).strict(),
]) satisfies Schema<PluginRunState>;

/**
 * The plugin page's R15 (HAL-15113): whether the host stopped a plugin
 * because the sandbox failed, and **Check again**. The page sends only the
 * plugin's id; the host keeps the stop in memory and starts nothing here.
 *
 * @example
 * const states = new AgentHostPluginRunStates(transport);
 * if ((await states.runState("weather")).stopped) showStopped();
 */
export class AgentHostPluginRunStates {
  readonly #transport: AgentHostTransport;

  constructor(transport: AgentHostTransport) {
    this.#transport = transport;
  }

  /**
   * Whether the plugin `plugin`'s runner stopped because the sandbox failed.
   *
   * @throws {@link AgentHostError} when the host can't be reached or answers something else
   */
  async runState(plugin: string): Promise<PluginRunState> {
    const route = "POST /v1/plugins/run-state";
    return readAnswer(route, await this.#transport.request(route, { plugin }), runStateSchema);
  }

  /**
   * **Check again**: the host forgets the stop, so the next call tries the sandbox again.
   *
   * @returns the state after it, which is not stopped
   * @throws {@link AgentHostError} when the host can't be reached or answers something else
   */
  async checkAgain(plugin: string): Promise<PluginRunState> {
    const route = "POST /v1/plugins/run-state/check-again";
    return readAnswer(route, await this.#transport.request(route, { plugin }), runStateSchema);
  }
}
