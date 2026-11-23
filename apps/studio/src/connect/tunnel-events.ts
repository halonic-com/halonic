import type { ComputerId, PhoneStatus } from "@halonicjs/studio-feature-remote/phone";
import { type TauriCallbacks, TauriChannel, type TauriIpc } from "@halonicjs/studio-services";
import { type Report, readTunnelEvent, type TunnelEvent } from "./phone-tunnel-answers.ts";

/** Told about every event the shell sends, for every computer. */
export type TunnelEventListener = (event: TunnelEvent) => void;

/**
 * The page's one `phone_tunnel_watch` channel, shared by the screens' statuses and every
 * computer's gateway client. It opens for the first listener and stays open for the page's
 * life: the shell has no unwatch and keeps every channel it was handed until the page loads
 * again, so a channel per listener would send each event once per listener the page ever had.
 * The shell sends only while the window is on the app's own page (H1 on HAL-15181).
 *
 * It keeps each computer's latest status and open session, so a later listener starts from
 * them, as the first one did from the shell's own replay. Host messages aren't kept: one that
 * came before a listener belongs to no one.
 */
export class TunnelEvents {
  readonly #ipc: TauriIpc & TauriCallbacks;
  readonly #report: Report;
  readonly #listeners = new Set<TunnelEventListener>();
  readonly #latest = new Map<ComputerId, PhoneStatus>();
  readonly #open = new Map<ComputerId, number>();
  #watching = false;

  constructor(ipc: TauriIpc & TauriCallbacks, report: Report) {
    this.#ipc = ipc;
    this.#report = report;
  }

  /**
   * Tells `listener` each computer's latest status, then each open session, then every event.
   * Returns the unsubscribe; the channel stays open when the last listener goes, so the next
   * one doesn't open another.
   */
  listen(listener: TunnelEventListener): () => void {
    this.#listeners.add(listener);
    for (const [computer, status] of this.#latest) listener({ kind: "status", computer, status });
    for (const [computer, generation] of this.#open) {
      listener({ kind: "session-opened", computer, generation });
    }
    if (!this.#watching) this.#watch();
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** The page ended the session of `generation`, so a later listener isn't handed it. */
  sessionEnded(computer: ComputerId, generation: number): void {
    if (this.#open.get(computer) === generation) this.#open.delete(computer);
  }

  #watch(): void {
    // Set before the answer and never cleared: a refused watch isn't asked again. The shell
    // refuses only off the app's own page, and this adapter runs only on that page.
    this.#watching = true;
    const channel = new TauriChannel(this.#ipc, (event) => this.#receive(event));
    this.#ipc.invoke("phone_tunnel_watch", { onEvent: channel.argument }).then(
      (watching) => {
        if (watching !== true) this.#report("phone_tunnel_watch refused the watch");
      },
      () => this.#report("phone_tunnel_watch was refused"),
    );
  }

  #receive(raw: unknown): void {
    const event = readTunnelEvent(raw, this.#report);
    if (event === undefined) return;
    this.#note(event);
    for (const listener of [...this.#listeners]) listener(event);
  }

  #note(event: TunnelEvent): void {
    switch (event.kind) {
      case "status":
        this.#latest.set(event.computer, event.status);
        if (endsSession(event.status)) this.#open.delete(event.computer);
        return;
      case "session-opened":
        this.#open.set(event.computer, event.generation);
        return;
      case "message":
        return;
    }
  }
}

/**
 * Whether the connection's session is gone with this status: the same rule as the shell's
 * `on_status`, which keeps a session only while `connecting` or `connected`. On `paused` the
 * tunnel has already dropped the connection, so a session kept past it would be a dead one.
 */
function endsSession(status: PhoneStatus): boolean {
  return status.state !== "connecting" && status.state !== "connected";
}
