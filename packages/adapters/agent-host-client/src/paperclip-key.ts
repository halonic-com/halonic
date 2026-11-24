import { s } from "@halonicjs/schema-kit";
import { inPlainWords } from "./plugins.ts";
import { AgentHostError, type AgentHostTransport, readAnswer } from "./transport.ts";

const answerSchema = s.object({ kept: s.literal(true) }).strict();

/** One Paperclip connection's key, with the address and company it was made for. */
export interface PaperclipKeyHandOver {
  /** The connection's name: its file name without `.yaml`. */
  readonly connection: string;
  readonly key: string;
  readonly address: string;
  readonly company: string;
}

/**
 * The page's way to hand a Paperclip connection's key to the agent host when
 * the person connects: the keychain, where Studio keeps it, is one the host
 * can't read. The host keeps it in memory only and uses it only for the
 * address and company it was made for (ADR 2026-11-24, agent messaging).
 */
export class AgentHostPaperclipKey {
  readonly #transport: AgentHostTransport;

  constructor(transport: AgentHostTransport) {
    this.#transport = transport;
  }

  /**
   * Hands over `entry`, replacing the key the host held for its connection.
   *
   * @throws {@link AgentHostError} whose message says why: the host refused it (`secret_from_other_site`, `body_invalid`…), it can't be reached, or it answered something else. No message holds the key
   */
  async handOver(entry: PaperclipKeyHandOver): Promise<void> {
    const route = "POST /v1/paperclip/key";
    const { connection, key, address, company } = entry;
    const answer = await this.#transport.request(route, { connection, key, address, company });
    try {
      readAnswer(route, answer, answerSchema);
    } catch (error) {
      if (error instanceof AgentHostError && error.kind === "secret_from_other_site") {
        throw new AgentHostError(
          error.status,
          error.kind,
          "Halonic takes a Paperclip key only from its own window.",
        );
      }
      throw inPlainWords(error);
    }
  }
}
