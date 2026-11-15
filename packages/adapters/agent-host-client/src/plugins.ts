import { s } from "@halonicjs/schema-kit";
import { AgentHostError, type AgentHostTransport, readAnswer } from "./transport.ts";

const answerSchema = s.object({ text: s.string() }).strict();

/** What a tool call hands to the plugin: named values, which the host checks again. */
export type PluginToolArgs = Readonly<Record<string, unknown>>;

/**
 * What the page tells the person when the host refuses a call, by the host's
 * `kind`. Each says why and what to do, in plain words; a kind that isn't
 * listed keeps the host's own message.
 */
const refusalMessages: Readonly<Record<string, string>> = {
  not_fenced:
    "Plugin tools can't run on this computer yet: the sandbox that fences a plugin isn't available here (Windows, until it is). Nothing was started.",
  not_in_this_build: "Plugin tools aren't available in this build of Halonic yet.",
  plugin_not_trusted:
    "This computer's trust record doesn't cover this plugin as it is now. Review it and trust it first.",
  too_many_plugins: "Halonic already runs the most plugins it allows. Try again in a moment.",
  host_stopping: "Halonic is shutting down and starts no more plugins.",
  plugin_failed: "The plugin couldn't finish this call. Halonic's log has the detail.",
};

/**
 * The page's way to call a tool of a plugin's backend. The page sends the
 * plugin's id, the tool and its arguments; the agent host checks the trust
 * itself and runs the backend in a sandbox of its own, so plugin code never
 * runs in the page. It fits Studio's `PluginToolCaller` without importing it.
 */
export class AgentHostPluginToolCaller {
  readonly #transport: AgentHostTransport;

  constructor(transport: AgentHostTransport) {
    this.#transport = transport;
  }

  /**
   * @returns the tool's answer as text
   * @throws {@link AgentHostError} whose message says why the call failed: the host refused it (`plugin_not_trusted`, `not_fenced`, `not_in_this_build`, `too_many_plugins`, `host_stopping`, `plugin_failed`), it can't be reached, or it answered something else
   */
  async call(plugin: string, tool: string, args: PluginToolArgs): Promise<string> {
    const route = "POST /v1/plugins/call";
    const answer = await this.#transport.request(route, { plugin, tool, args });
    try {
      return readAnswer(route, answer, answerSchema).text;
    } catch (error) {
      if (!(error instanceof AgentHostError)) throw error;
      const message = refusalMessages[error.kind];
      if (message === undefined || error.status === 200) throw error;
      throw new AgentHostError(error.status, error.kind, message);
    }
  }
}
