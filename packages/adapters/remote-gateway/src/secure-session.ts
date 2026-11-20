import type { NoiseSession } from "@halonicjs/adapter-e2e-noise";
import {
  encodeCleartextFrame,
  type GatewayHostMessage,
  type GatewayPairDeniedReason,
  gatewaySessionLimits,
} from "@halonicjs/ports";
import { type E2eFrame, readE2eFrame } from "./e2e-frames.ts";
import type { GatewayConnection, GatewayTransport } from "./gateway-connection.ts";
import {
  finishPairing,
  type HandshakeDeps,
  openPairing,
  openReconnect,
  type PairingInProgress,
} from "./host-handshake.ts";
import type { ConnectedPhone, PairingAnswer, PairingRefusal } from "./phone-access.ts";
import { type E2eWire, SecureChannel } from "./secure-channel.ts";

export interface SecureSessionDeps extends HandshakeDeps {
  readonly wire: E2eWire;
  /** Makes the gateway connection that runs inside the session once it is open. */
  openConnection(transport: GatewayTransport): GatewayConnection;
  /** How long an open session may go without the phone's `hello`. */
  readonly helloTimeoutMs: number;
  /** How long the handshake may take; the ADR's 10 seconds unless a test shortens it. */
  readonly handshakeTimeoutMs?: number;
  /**
   * Gets an error the session met outside any caller's stack: in its own
   * timers or while the person decided. The session has closed by then.
   */
  onError(error: unknown): void;
}

/** Where the session is. Each state takes only the frames listed for it. */
type State =
  | { readonly name: "handshake" }
  | { readonly name: "pairing"; readonly pairing: PairingInProgress }
  | { readonly name: "waiting-for-allow"; readonly abort: AbortController }
  | { readonly name: "open"; readonly connection: GatewayConnection; readonly phoneKey: Uint8Array }
  /** A last frame is on its way and the connection closes after it: nothing more is read. */
  | { readonly name: "ending" }
  | { readonly name: "closed" };

const { handshakeTimeoutMs, rekeyAfterMs, sessionMaxMs } = gatewaySessionLimits;
const encoder = new TextEncoder();

/**
 * One phone's connection as the host sees it on the wire: the end-to-end
 * session of the ADR "Pairing and the end-to-end session" around one
 * {@link GatewayConnection}. No gateway message is read or sent outside a
 * Noise transport message; the only cleartext the host sends is
 * `handshake-failed` and `pair-refused`, and then it closes.
 *
 * - A pairing (`pair1`…`pair3`) waits for the person's answer once message 3
 *   decrypted and matched, then sends `paired` and opens the session, or an
 *   encrypted `pair-refused` and closes.
 * - A reconnect (`resume1`, `resume2`) sends an encrypted `not-paired` and
 *   closes when the phone isn't paired, after message 2 has proved the host.
 * - The phone counts as connected only once its first transport message
 *   decrypts and it is still paired then, and gets `not-paired` at once if it
 *   is revoked before or after.
 * - The handshake must end within 10 seconds of the connection's start, and
 *   the session ends 24 hours after it opened.
 */
export class SecureSession {
  readonly #deps: SecureSessionDeps;
  #state: State = { name: "handshake" };
  #noise: NoiseSession | undefined;
  #channel: SecureChannel | undefined;
  #phone: ConnectedPhone | undefined;
  readonly #timers: ReturnType<typeof setTimeout>[] = [];

  constructor(deps: SecureSessionDeps) {
    this.#deps = deps;
    this.#after(deps.handshakeTimeoutMs ?? handshakeTimeoutMs, () => {
      if (this.#state.name === "handshake" || this.#state.name === "pairing") this.close();
    });
  }

  /** Handles one binary frame from the phone. A frame the state doesn't take closes the connection. */
  receive(bytes: Uint8Array): void {
    const frame = readE2eFrame(bytes);
    const state = this.#state;
    if (frame === undefined) {
      this.close();
    } else if (state.name === "handshake" && frame.kind === "pair1") {
      this.#pair1(frame.body);
    } else if (state.name === "handshake" && frame.kind === "resume1") {
      this.#resume1(frame.body);
    } else if (state.name === "pairing" && frame.kind === "pair3") {
      this.#pair3(frame.body, state.pairing).catch((error: unknown) => this.#fail(error));
    } else if (state.name === "open") {
      this.#transport(frame, state);
    } else {
      this.close();
    }
  }

  /**
   * Ends the session: wipes its keys, stops its timers and the connection
   * inside it. Every step runs even when the pairing service or the phone
   * store throws, so the keys are always wiped and the wire closed; the first
   * error is thrown afterwards.
   */
  close(): void {
    const state = this.#state;
    if (state.name === "closed") return;
    this.#state = { name: "closed" };
    for (const timer of this.#timers) clearTimeout(timer);
    runAll([
      // A pairing the host answered that ends here, before message 3 decrypted, is a wrong try.
      () => state.name === "pairing" && state.pairing.attempt.wrongTry(),
      () => state.name === "waiting-for-allow" && state.abort.abort(),
      () => state.name === "open" && state.connection.close(),
      () => this.#phone?.end(),
      () => this.#noise?.end(),
      () => this.#deps.wire.close(),
    ]);
  }

  #pair1(body: Uint8Array): void {
    const opening = openPairing(body, this.#deps);
    if (opening.kind === "refused") {
      this.#refuse(opening.refusal);
      return;
    }
    if (opening.kind === "unreadable") {
      this.close();
      return;
    }
    this.#noise = opening.pairing.noise;
    this.#state = { name: "pairing", pairing: opening.pairing };
    this.#deps.wire.send(opening.reply);
  }

  async #pair3(body: Uint8Array, pairing: PairingInProgress): Promise<void> {
    const end = finishPairing(body, pairing);
    if (end.kind === "wrong-try") {
      // The try is counted here, so closing mustn't count it again.
      this.#state = { name: "ending" };
      this.#refuse(pairing.attempt.wrongTry());
      return;
    }
    const abort = new AbortController();
    this.#state = { name: "waiting-for-allow", abort };
    this.#channel = new SecureChannel(pairing.noise, this.#deps.wire);
    let answer: PairingAnswer;
    try {
      answer = await pairing.attempt.decrypted(end.phone, abort.signal);
    } catch {
      this.close();
      return;
    }
    // The phone may have left, or the session timed out, while the person decided.
    if (this.#isClosed()) return;
    if (answer.kind === "allowed") {
      this.#send({ type: "paired" });
      this.#open(end.phone.publicKey);
    } else if (answer.kind === "refused") {
      this.#refuse(answer.refusal);
    } else {
      this.#endWith(pairRefused(answer.kind));
    }
  }

  #resume1(body: Uint8Array): void {
    const opening = openReconnect(body, this.#deps);
    if (opening.kind === "handshake-failed") {
      this.#deps.wire.send(encodeCleartextFrame({ kind: "handshake-failed" }));
    }
    if (opening.kind !== "answered") {
      this.close();
      return;
    }
    this.#noise = opening.noise;
    this.#channel = new SecureChannel(opening.noise, this.#deps.wire);
    this.#deps.wire.send(opening.reply);
    // Only now, after message 2 proved the host, may the phone learn it isn't paired.
    if (this.#deps.phones.isPaired(opening.phoneKey)) {
      this.#open(opening.phoneKey);
    } else {
      this.#endWith({ type: "not-paired" });
    }
  }

  /** The session is open: the gateway protocol runs inside it, starting with `hello`. */
  #open(phoneKey: Uint8Array): void {
    const connection = this.#deps.openConnection({
      send: (json) => this.#send(json),
      bufferedBytes: () => this.#deps.wire.bufferedBytes(),
      close: () => this.close(),
    });
    this.#state = { name: "open", connection, phoneKey };
    this.#after(this.#deps.helloTimeoutMs, () => {
      if (!connection.hasGreeted()) this.close();
    });
    this.#after(sessionMaxMs, () => this.close());
    this.#every(rekeyAfterMs, () => this.#rekeyIfUsed());
  }

  #transport(frame: E2eFrame, state: State & { name: "open" }): void {
    const input = this.#channel?.receive(frame) ?? { kind: "broken" };
    if (input.kind === "broken") {
      this.close();
      return;
    }
    if (input.kind === "rekeyed") return;
    if (this.#phone === undefined && !this.#connect(state.phoneKey)) return;
    state.connection.receive({ binary: false, bytes: input.bytes });
  }

  /**
   * The first message that decrypts, not handshake message 1, makes the phone
   * connected. Gives whether the session is still open afterwards.
   */
  #connect(phoneKey: Uint8Array): boolean {
    // The phone may have been revoked since message 2, before the store could reach this session.
    if (!this.#deps.phones.isPaired(phoneKey)) {
      this.#endWith({ type: "not-paired" });
      return false;
    }
    const phone = this.#deps.phones.connected(phoneKey, () => {
      this.#endWith({ type: "not-paired" });
    });
    this.#phone = phone;
    // A store that called onRevoked straight away closed the session before it had the handle.
    if (this.#isClosed()) {
      phone.end();
      return false;
    }
    return true;
  }

  /** Rekeys the sending key if it was used; a failure closes the session. */
  #rekeyIfUsed(): void {
    try {
      this.#channel?.rekeyIfUsed();
    } catch {
      this.close();
    }
  }

  /** Sends one gateway message inside the session; a failure closes it. */
  #send(message: GatewayHostMessage | string): void {
    if (this.#isClosed()) return;
    const json = typeof message === "string" ? message : JSON.stringify(message);
    try {
      this.#channel?.send(encoder.encode(json));
    } catch {
      this.close();
    }
  }

  /** Sends a last encrypted message and closes. */
  #endWith(message: GatewayHostMessage): void {
    this.#send(message);
    this.close();
  }

  /** Sends a cleartext `pair-refused` and closes. */
  #refuse(refusal: PairingRefusal): void {
    try {
      this.#deps.wire.send(encodeCleartextFrame({ kind: "pair-refused", ...refusal }));
    } finally {
      this.close();
    }
  }

  #isClosed(): boolean {
    return this.#state.name === "closed";
  }

  /**
   * Reports an error nobody above could catch, and closes the session. A
   * throw out of a timer would be an uncaught exception that stops the host.
   */
  #fail(error: unknown): void {
    this.#deps.onError(error);
    try {
      this.close();
    } catch (closeError) {
      this.#deps.onError(closeError);
    }
  }

  /** Runs `run` from a timer; an error goes to {@link SecureSessionDeps.onError}, never out of the timer. */
  #guarded(run: () => void): () => void {
    return () => {
      try {
        run();
      } catch (error) {
        this.#fail(error);
      }
    };
  }

  #after(ms: number, run: () => void): void {
    const timer = setTimeout(this.#guarded(run), ms);
    timer.unref?.();
    this.#timers.push(timer);
  }

  #every(ms: number, run: () => void): void {
    const timer = setInterval(this.#guarded(run), ms);
    timer.unref?.();
    this.#timers.push(timer);
  }
}

function pairRefused(reason: GatewayPairDeniedReason): GatewayHostMessage {
  return { type: "pair-refused", reason };
}

/** Runs every step, also those after one that throws, then throws the first error. */
function runAll(steps: readonly (() => unknown)[]): void {
  const errors: unknown[] = [];
  for (const step of steps) {
    try {
      step();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) throw errors[0];
}
