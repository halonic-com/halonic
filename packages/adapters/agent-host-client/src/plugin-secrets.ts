import { s } from "@halonicjs/schema-kit";
import { inPlainWords } from "./plugins.ts";
import { AgentHostError, type AgentHostTransport, readAnswer } from "./transport.ts";

const answerSchema = s.object({ kept: s.number().int().min(0) }).strict();

/** What the page tells the person when the host refuses a hand-over for a reason of its own. */
const handOverMessages: Readonly<Record<string, string>> = {
  secret_not_declared:
    "The plugin doesn't declare one of these secrets, so Halonic didn't pass any of them on.",
  secret_from_other_site: "Halonic takes a plugin's secrets only from its own window.",
};

/**
 * The page's way to hand a plugin its own secrets, right before it asks the
 * agent host to use them: the keychain, where Studio keeps them, is one the
 * host can't read. The host checks the trust itself, builds the name it
 * keeps each value under, and keeps them in memory only (ADR 2026-11-19,
 * "Studio hands a plugin its secrets").
 */
export class AgentHostPluginSecrets {
  readonly #transport: AgentHostTransport;

  constructor(transport: AgentHostTransport) {
    this.#transport = transport;
  }

  /**
   * Hands over `secrets` for `plugin`, replacing what the host held for it;
   * an empty `secrets` makes the host forget them.
   *
   * @param secrets - each value by the name the plugin declares, never by the name it is kept under
   * @returns how many the host kept
   * @throws {@link AgentHostError} whose message says why: the host refused it (`plugin_not_trusted`, `not_in_this_build`, `host_stopping`, `secret_not_declared`, `body_invalid`…), it can't be reached, or it answered something else. No message holds a value
   */
  async handOver(plugin: string, secrets: Readonly<Record<string, string>>): Promise<number> {
    const route = "POST /v1/plugins/secrets";
    const answer = await this.#transport.request(route, { plugin, secrets });
    try {
      return readAnswer(route, answer, answerSchema).kept;
    } catch (error) {
      if (error instanceof AgentHostError && error.status !== 200) {
        const message = handOverMessages[error.kind];
        if (message !== undefined) throw new AgentHostError(error.status, error.kind, message);
      }
      throw inPlainWords(error);
    }
  }
}
