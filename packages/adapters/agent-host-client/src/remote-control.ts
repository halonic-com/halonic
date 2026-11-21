import type { PairingEvent, PairingSession, RemoteControl, RemoteState } from "@halonicjs/ports";
import { AsyncFeed } from "@halonicjs/std";
import { pairingEventSchema, pairingOpenedSchema, remoteStateSchema } from "./remote-schemas.ts";
import {
  type AgentHostRequestRoute,
  type AgentHostTransport,
  answerError,
  checked,
} from "./transport.ts";

const stateRoute = "GET /v1/remote/state";
const pairingRoute = "POST /v1/remote/pairing";

/**
 * The agent host's `RemoteControl` over its `/v1/remote/*` routes
 * (requirement `agent-host-client.remote-control`), so Settings › Remote
 * drives the host's: the state and a pairing come as streams, each step as
 * one call. A step the host refuses rejects with an `AgentHostError`.
 *
 * @example
 * const remote = new AgentHostRemoteControl(transport);
 * const pairing = await remote.startPairing();
 */
export class AgentHostRemoteControl implements RemoteControl {
  readonly #transport: AgentHostTransport;

  constructor(transport: AgentHostTransport) {
    this.#transport = transport;
  }

  /** A new stream from the host per call; leaving it hangs up, which the host takes as the reader gone. */
  async *state(): AsyncGenerator<RemoteState> {
    const leave = new AbortController();
    try {
      const answer = await this.#transport.stream(stateRoute, null, { signal: leave.signal });
      if (!answer.ok) throw answerError(stateRoute, answer.answer);
      for await (const line of answer.lines) {
        yield checked(stateRoute, line, remoteStateSchema) as RemoteState;
      }
    } finally {
      leave.abort();
    }
  }

  setRemote(on: boolean): Promise<void> {
    return step(this.#transport, "POST /v1/remote/on", { on });
  }

  /**
   * Opens a pairing whose stream stays open until it ends: closing the
   * session, or the page going away, hangs up, and the host closes it.
   */
  async startPairing(): Promise<PairingSession> {
    const leave = new AbortController();
    const answer = await this.#transport.stream(pairingRoute, {}, { signal: leave.signal });
    if (!answer.ok) throw answerError(pairingRoute, answer.answer);
    const lines = answer.lines[Symbol.asyncIterator]();
    try {
      const first = await lines.next();
      if (first.done === true)
        throw new Error("The agent host ended the pairing before it opened.");
      const { pairing } = checked(pairingRoute, first.value, pairingOpenedSchema);
      return new RelayedPairing(this.#transport, pairing, lines, leave);
    } catch (error) {
      // Without the pairing's id nothing can close it, so hang up: the host closes it then.
      leave.abort();
      throw error;
    }
  }

  revoke(phoneId: string): Promise<void> {
    return step(this.#transport, "POST /v1/remote/revoke", { phone: phoneId });
  }

  revokeAll(): Promise<void> {
    return step(this.#transport, "POST /v1/remote/revoke-all", {});
  }

  setAllowRiskyRemotely(allow: boolean): Promise<void> {
    return step(this.#transport, "POST /v1/remote/allow-risky", { allow });
  }
}

/**
 * One pairing the host streams: its lines go to every reader, each of which
 * gets every event so far first, as the port asks. A stream that breaks
 * before `paired` or `ended` ends with `closed`, so no reader waits forever.
 */
class RelayedPairing implements PairingSession {
  readonly #transport: AgentHostTransport;
  readonly #id: string;
  readonly #leave: AbortController;
  readonly #seen: PairingEvent[] = [];
  readonly #readers = new Set<AsyncFeed<PairingEvent>>();

  constructor(
    transport: AgentHostTransport,
    id: string,
    lines: AsyncIterator<unknown>,
    leave: AbortController,
  ) {
    this.#transport = transport;
    this.#id = id;
    this.#leave = leave;
    void this.#relay(lines);
  }

  get #over(): boolean {
    const last = this.#seen.at(-1);
    return last?.type === "paired" || last?.type === "ended";
  }

  events(): AsyncIterable<PairingEvent> {
    const feed = new AsyncFeed<PairingEvent>((left) => this.#readers.delete(left));
    for (const event of this.#seen) feed.push(event);
    if (this.#over) feed.end();
    else this.#readers.add(feed);
    return feed;
  }

  allow(): Promise<void> {
    return this.#step("POST /v1/remote/pairing/answer", { allow: true });
  }

  deny(): Promise<void> {
    return this.#step("POST /v1/remote/pairing/answer", { allow: false });
  }

  newCode(): Promise<void> {
    return this.#step("POST /v1/remote/pairing/new-code", {});
  }

  /** Asks the host to close it, then hangs up; closing an ended pairing does nothing. */
  async close(): Promise<void> {
    if (this.#over) return;
    try {
      await this.#step("POST /v1/remote/pairing/close", {});
    } finally {
      this.#leave.abort();
    }
  }

  #step(route: AgentHostRequestRoute, body: object): Promise<void> {
    return step(this.#transport, route, { pairing: this.#id, ...body });
  }

  async #relay(lines: AsyncIterator<unknown>): Promise<void> {
    try {
      for (let line = await lines.next(); line.done !== true; line = await lines.next()) {
        this.#push(checked(pairingRoute, line.value, pairingEventSchema) as PairingEvent);
      }
    } catch {
      // A line the host shouldn't send, or a stream that broke: the pairing is over either way.
    } finally {
      this.#push({ type: "ended", reason: "closed" });
      this.#leave.abort();
    }
  }

  #push(event: PairingEvent): void {
    if (this.#over) return;
    this.#seen.push(event);
    for (const reader of this.#readers) reader.push(event);
    if (!this.#over) return;
    for (const reader of this.#readers) reader.end();
    this.#readers.clear();
  }
}

/** Calls a step's route, and rejects with the host's error unless it answers 200. */
async function step(
  transport: AgentHostTransport,
  route: AgentHostRequestRoute,
  body: object,
): Promise<void> {
  const answer = await transport.request(route, body);
  if (answer.status !== 200) throw answerError(route, answer);
}
