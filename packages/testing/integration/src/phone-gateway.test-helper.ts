// The phone's shell, as far as the interop test needs one (HAL-15179): a `ComputerTunnel` over
// the gateway's own test phone, which speaks the real end-to-end session over a real socket.
// The shell's real adapter (HAL-15177) has its own tests; this one only carries the messages.

import type { RawClient } from "@halonicjs/adapter-remote-gateway/testing";
import type {
  ComputerTunnel,
  ComputerTunnelEvent,
  ComputerTunnelSendResult,
  RemoteView,
} from "@halonicjs/studio-feature-remote/phone";

/** The one session this tunnel ever opens. */
const generation = 1;

/** A `ComputerTunnel` over a paired, reconnected `RawClient`. */
export class TestPhoneTunnel implements ComputerTunnel {
  /** What the page sent, parsed, for the test to read. */
  readonly sent: unknown[] = [];
  readonly #client: RawClient;
  readonly #listeners = new Set<(event: ComputerTunnelEvent) => void>();
  #open = true;
  #messagesRead = 0;

  constructor(client: RawClient) {
    this.#client = client;
    // Each chunk may finish frames; the client decrypts them once, in order.
    client.socket.on("data", () => this.#deliver());
    client.socket.once("close", () => this.#closed());
  }

  async send(sessionGeneration: number, text: string): Promise<ComputerTunnelSendResult> {
    if (!this.#open || sessionGeneration !== generation) return { sent: false, reason: "not-open" };
    const message: unknown = JSON.parse(text);
    this.sent.push(message);
    await this.#client.sendJson(message);
    return { sent: true };
  }

  async endSession(sessionGeneration: number): Promise<void> {
    if (sessionGeneration === generation) this.#client.end();
  }

  subscribe(listener: (event: ComputerTunnelEvent) => void): () => void {
    this.#listeners.add(listener);
    listener({ kind: "status", state: this.#open ? "connected" : "reconnecting" });
    if (this.#open) listener({ kind: "session-opened", generation });
    this.#deliver();
    return () => this.#listeners.delete(listener);
  }

  #deliver(): void {
    const messages = this.#client.messages();
    for (; this.#messagesRead < messages.length; this.#messagesRead++) {
      const text = JSON.stringify(messages[this.#messagesRead]);
      this.#emit({ kind: "message", generation, text });
    }
  }

  #closed(): void {
    this.#open = false;
    this.#emit({ kind: "status", state: "reconnecting" });
  }

  #emit(event: ComputerTunnelEvent): void {
    for (const listener of this.#listeners) listener(event);
  }
}

/** What `until` needs of the gateway client. */
interface Viewed {
  view(): RemoteView;
  subscribe(onChange: () => void): () => void;
}

/**
 * Resolves with the client's view once `check` holds for it. It waits on the
 * client's own change notices, not on a timer; the test's timeout ends a
 * wait that never comes true.
 */
export function until(client: Viewed, check: (view: RemoteView) => boolean): Promise<RemoteView> {
  return new Promise((resolve) => {
    const settleIfReady = (): boolean => {
      const view = client.view();
      if (!check(view)) return false;
      unsubscribe();
      resolve(view);
      return true;
    };
    const unsubscribe = client.subscribe(() => {
      settleIfReady();
    });
    settleIfReady();
  });
}
