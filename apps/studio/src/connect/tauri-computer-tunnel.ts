import {
  type ComputerId,
  type ComputerTunnel,
  type ComputerTunnelEvent,
  type ComputerTunnelSendResult,
  phoneStatusLabelState,
} from "@halonicjs/studio-feature-remote/phone";
import type { TauriIpc } from "@halonicjs/studio-services";
import { notOpen, type Report, readSendAnswer, type TunnelEvent } from "./phone-tunnel-answers.ts";
import type { TunnelEvents } from "./tunnel-events.ts";

/**
 * The gateway client's tunnel to one paired computer in the Android app (D7a, HAL-15177): sends
 * go to the shell's `tunnel_send`, which checks and seals them (`src-tauri/src/phone_tunnel.rs`,
 * granted to the phone's own page only), and events come from the page's one watch channel.
 *
 * - **Never rejects:** the client settles every answer and prompt from a send's result, so a
 *   command the shell refuses, or an answer the page doesn't know, resolves `not-open`, the
 *   same as a session that ended while sending. `endSession` doesn't reject either.
 * - **No text in the log:** only fixed lines go to `report`, never a message or the error a
 *   refused command came with.
 * - **Statuses** become the header label's state; `paused` keeps the label and `closed` has
 *   none, so neither reaches the client.
 */
export class TauriComputerTunnel implements ComputerTunnel {
  readonly #ipc: TauriIpc;
  readonly #events: TunnelEvents;
  readonly #computer: ComputerId;
  readonly #report: Report;

  constructor(ipc: TauriIpc, events: TunnelEvents, computer: ComputerId, report: Report) {
    this.#ipc = ipc;
    this.#events = events;
    this.#computer = computer;
    this.#report = report;
  }

  async send(generation: number, text: string): Promise<ComputerTunnelSendResult> {
    const args = { computer: this.#computer, generation, text };
    let answer: unknown;
    try {
      answer = await this.#ipc.invoke("tunnel_send", args);
    } catch {
      this.#report("tunnel_send was refused");
      return notOpen;
    }
    return readSendAnswer(answer, this.#report);
  }

  async endSession(generation: number): Promise<void> {
    this.#events.sessionEnded(this.#computer, generation);
    try {
      await this.#ipc.invoke("tunnel_end_session", { computer: this.#computer, generation });
    } catch {
      this.#report("tunnel_end_session was refused");
    }
  }

  subscribe(listener: (event: ComputerTunnelEvent) => void): () => void {
    return this.#events.listen((event) => {
      if (event.computer !== this.#computer) return;
      const forClient = clientEvent(event);
      if (forClient !== undefined) listener(forClient);
    });
  }
}

/** An event as the client reads it, without the computer; `undefined` when it gets none. */
export function clientEvent(event: TunnelEvent): ComputerTunnelEvent | undefined {
  switch (event.kind) {
    case "status": {
      const state = phoneStatusLabelState(event.status);
      return state === "keep" || state === "none" ? undefined : { kind: "status", state };
    }
    case "session-opened":
      return { kind: "session-opened", generation: event.generation };
    case "message":
      return { kind: "message", generation: event.generation, text: event.text };
  }
}
