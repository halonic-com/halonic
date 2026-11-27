import {
  AgentHostError,
  AgentHostPaperclipKey,
  type AgentHostTransport,
  type PaperclipConnectionRef,
} from "@halonicjs/adapter-agent-host-client";

/** One Paperclip connection's key, with the address and company it was made for. */
export interface ShellKeyHandOver extends PaperclipConnectionRef {
  readonly key: string;
  readonly address: string;
  readonly company: string;
}

/**
 * Studio's side of a Paperclip key, for the host's tests. The shell hands a
 * kept key back itself, on `POST /v1/paperclip/key`, a route no page may
 * name (`studio.src-tauri.paperclip-key-keep`, HAL-20278), so this sends it
 * straight to the host as the shell does. Disconnect is the page's, through
 * the client.
 */
export class ShellPaperclipKey {
  readonly #url: string;
  readonly #token: string;
  readonly #page: AgentHostPaperclipKey;
  readonly #answers: string[];

  /** @param answers - where each answer body the host sent goes, as text, with the page's */
  constructor(url: string, token: string, page: AgentHostTransport, answers: string[]) {
    this.#url = url;
    this.#token = token;
    this.#page = new AgentHostPaperclipKey(page);
    this.#answers = answers;
  }

  /**
   * Hands `entry` over, as the shell's restore does.
   *
   * @throws {@link AgentHostError} with the host's status and kind when it refuses
   */
  async handOver(entry: ShellKeyHandOver): Promise<void> {
    const { workspace, connection, key, address, company } = entry;
    const response = await fetch(`${this.#url}/v1/paperclip/key`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.#token}`,
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify({ workspace, connection, key, address, company }),
    });
    const text = await response.text();
    this.#answers.push(text);
    if (response.status === 200) return;
    const body = JSON.parse(text) as { error?: { kind?: string; message?: string } };
    throw new AgentHostError(
      response.status,
      body.error?.kind ?? "answer_invalid",
      body.error?.message ?? "The host refused the key.",
    );
  }

  /** The page's Disconnect, through the client. */
  disconnect(ref: PaperclipConnectionRef): Promise<{ revoked: boolean }> {
    return this.#page.disconnect(ref);
  }
}
