import { s } from "@halonicjs/schema-kit";
import { type AgentHostTransport, readAnswer } from "./transport.ts";

const disconnectAnswer = s.object({ revoked: s.boolean() }).strict();

/** One Paperclip connection: the workspace that holds its file, and the file's name. */
export interface PaperclipConnectionRef {
  /** The workspace's real path; the host binds the key to it. */
  readonly workspace: string;
  /** The connection's name: its file name without `.yaml`. */
  readonly connection: string;
}

/**
 * The page's way to disconnect a Paperclip connection on the agent host.
 * Handing a key over is the shell's alone (`studio.src-tauri.paperclip-key-keep`,
 * HAL-20278): the key never reaches the page, so the page has nothing to hand.
 */
export class AgentHostPaperclipKey {
  readonly #transport: AgentHostTransport;

  constructor(transport: AgentHostTransport) {
    this.#transport = transport;
  }

  /**
   * Disconnects `ref`: the host asks Paperclip to revoke the key, then forgets
   * it and deletes the connection's cache, also when the revoke failed.
   *
   * @returns whether Paperclip revoked the key; when not, it stays valid until its expiry
   * @throws {@link AgentHostError} when the host refuses (`unknown_workspace`…) or can't be reached
   */
  async disconnect(ref: PaperclipConnectionRef): Promise<{ revoked: boolean }> {
    const route = "POST /v1/paperclip/disconnect";
    const { workspace, connection } = ref;
    const answer = await this.#transport.request(route, { workspace, connection });
    return readAnswer(route, answer, disconnectAnswer);
  }
}
