import type {
  PairingEndReason,
  PairingEvent,
  PairingSession,
  TunnelReason,
} from "@halonicjs/ports";
import { AsyncFeed } from "@halonicjs/std";

/** What a pairing session asks of the host that opened it. */
export interface PairingSessionOwner {
  /** Allow or Don't allow was pressed while the session showed `check`. */
  decide(session: HostPairingSession, allow: boolean): Promise<void>;
  newCode(session: HostPairingSession): Promise<void>;
  close(session: HostPairingSession): Promise<void>;
}

/**
 * One Pair a phone dialog's session, as the port shapes it: every event so
 * far to each new reader, then each new one, until `paired` or `ended`. The
 * host's rules live in its owner; this keeps the events and refuses what the
 * last event doesn't allow.
 */
export class HostPairingSession implements PairingSession {
  readonly #owner: PairingSessionOwner;
  readonly #seen: PairingEvent[] = [];
  readonly #readers = new Set<AsyncFeed<PairingEvent>>();

  constructor(owner: PairingSessionOwner) {
    this.#owner = owner;
  }

  /** The last event, if any. */
  get last(): PairingEvent | undefined {
    return this.#seen.at(-1);
  }

  /** Whether the session has ended, with `paired` or `ended`. */
  get over(): boolean {
    return this.last?.type === "paired" || this.last?.type === "ended";
  }

  events(): AsyncIterable<PairingEvent> {
    const feed = new AsyncFeed<PairingEvent>((left) => this.#readers.delete(left));
    for (const event of this.#seen) feed.push(event);
    if (this.over) feed.end();
    else this.#readers.add(feed);
    return feed;
  }

  allow(): Promise<void> {
    return this.#answer(true);
  }

  deny(): Promise<void> {
    return this.#answer(false);
  }

  newCode(): Promise<void> {
    if (this.over) return Promise.reject(new Error("An ended pairing gives no new code."));
    return this.#owner.newCode(this);
  }

  close(): Promise<void> {
    if (this.over) return Promise.resolve();
    return this.#owner.close(this);
  }

  /** Sends an event to every reader; after `paired` or `ended`, the streams end. Nothing follows the end. */
  push(event: PairingEvent): void {
    if (this.over) return;
    this.#seen.push(event);
    for (const reader of this.#readers) reader.push(event);
    if (!this.over) return;
    for (const reader of this.#readers) reader.end();
    this.#readers.clear();
  }

  /** Ends the session without a phone; `tunnelReason` says why the tunnel went down. */
  end(reason: PairingEndReason, tunnelReason: TunnelReason = "provider-error"): void {
    if (reason === "tunnel-down") this.push({ type: "ended", reason, tunnelReason });
    else this.push({ type: "ended", reason });
  }

  #answer(allow: boolean): Promise<void> {
    if (this.last?.type !== "check") {
      return Promise.reject(new Error("Allow and Don't allow wait for a phone's check code."));
    }
    return this.#owner.decide(this, allow);
  }
}
