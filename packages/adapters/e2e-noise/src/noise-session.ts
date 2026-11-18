import { randomFillSync } from "node:crypto";
import { gatewayNoisePrologue, noiseMaxMessageBytes } from "@halonicjs/ports";
import { type InstantiateNoise, instantiateNoise, type NoiseExports } from "./noise-wasm.ts";

/** `gatewayPairingPattern` or `gatewayReconnectPattern`. */
export type NoiseHandshake = "pairing" | "reconnect";

/** The phone starts both handshakes, so the host is always the responder. */
export type NoiseRole = "initiator" | "responder";

export interface NoiseSessionOptions {
  readonly handshake: NoiseHandshake;
  readonly role: NoiseRole;
  /** This side's static X25519 private key, 32 bytes. Zeroed once the session has it. */
  readonly localPrivateKey: Uint8Array;
  /** The psk, 32 bytes: required for pairing, refused for reconnect. Zeroed once the session has it. */
  readonly psk?: Uint8Array;
  /** The pinned host key, 32 bytes: only for a reconnect's initiator. */
  readonly remotePublicKey?: Uint8Array;
  /** Defaults to `gatewayNoisePrologue`; only the published vectors use another. */
  readonly prologue?: Uint8Array;
  /** Fills its argument with random bytes. Defaults to `crypto.randomFillSync`. */
  readonly randomFill?: (bytes: Uint8Array) => void;
}

/**
 * Thrown by every call on a session that failed or ended. The message never
 * says why: the session is over either way.
 */
export class NoiseSessionError extends Error {
  constructor() {
    super("The Noise session failed or ended");
    this.name = "NoiseSessionError";
  }
}

const keyBytes = 32;
const handshakeCodes: Readonly<Record<NoiseHandshake, number>> = { pairing: 0, reconnect: 1 };
const roleCodes: Readonly<Record<NoiseRole, number>> = { initiator: 0, responder: 1 };

/**
 * One end of one Noise session, in its own WebAssembly instance of `snow`
 * (B1, HAL-12236; Julian's conditions on HAL-12355).
 *
 * - The instance is this session's alone. `end()`, and any failure, zero
 *   its whole memory and drop it, so no key `snow` copied stays behind.
 * - After any failure, from `snow`, a trap or a throwing random function,
 *   every call throws {@link NoiseSessionError}. Nothing is retried.
 * - The instance never sees a pointer from here: bytes go into its input
 *   buffer and a length goes with them. Views of its memory are made again
 *   for every call, because a memory that grows detaches the old ones.
 */
export class NoiseSession {
  #exports: NoiseExports | undefined;

  private constructor(instantiate: InstantiateNoise, randomFill: (bytes: Uint8Array) => void) {
    const exports = instantiate((pointer, length) => {
      randomFill(new Uint8Array(exports.memory.buffer, pointer, length));
      return 1;
    });
    this.#exports = exports;
  }

  /**
   * Starts a handshake. Throws {@link NoiseSessionError} when the keys don't
   * fit the handshake and role. The private key and the psk are zeroed
   * either way.
   */
  static start(
    options: NoiseSessionOptions,
    instantiate: InstantiateNoise = instantiateNoise,
  ): NoiseSession {
    try {
      const session = new NoiseSession(instantiate, options.randomFill ?? randomFillSync);
      session.#begin(options);
      return session;
    } catch {
      throw new NoiseSessionError();
    } finally {
      options.localPrivateKey.fill(0);
      options.psk?.fill(0);
    }
  }

  /**
   * Copies the keys and the prologue into the instance, in the order it
   * reads them: the private key, then the psk or the pinned host key, then
   * the prologue.
   */
  #begin(options: NoiseSessionOptions): void {
    const { handshake, role, localPrivateKey, psk, remotePublicKey } = options;
    const prologue = options.prologue ?? new TextEncoder().encode(gatewayNoisePrologue);
    const wantsPsk = handshake === "pairing";
    const wantsRemote = handshake === "reconnect" && role === "initiator";
    const second = wantsPsk ? psk : remotePublicKey;
    const keys = second === undefined ? [localPrivateKey] : [localPrivateKey, second];
    const fits =
      (psk !== undefined) === wantsPsk &&
      (remotePublicKey !== undefined) === wantsRemote &&
      keys.every((key) => key.length === keyBytes);
    this.#call((noise) => {
      if (!fits) return -1;
      const input = this.#input(noise, keys.length * keyBytes + prologue.length);
      let at = 0;
      for (const bytes of [...keys, prologue]) {
        input.set(bytes, at);
        at += bytes.length;
      }
      return noise.noise_start(handshakeCodes[handshake], roleCodes[role], prologue.length);
    });
  }

  /** Writes the next message, a handshake message or then a transport message. */
  writeMessage(payload: Uint8Array): Uint8Array {
    const length = this.#call((noise) => {
      this.#input(noise, payload.length).set(payload);
      return noise.noise_write(payload.length);
    });
    return this.#output(length);
  }

  /** Reads the next message and returns its payload. */
  readMessage(message: Uint8Array): Uint8Array {
    const length = this.#call((noise) => {
      this.#input(noise, message.length).set(message);
      return noise.noise_read(message.length);
    });
    return this.#output(length);
  }

  /** Whether the handshake is over and transport messages flow. */
  get isTransport(): boolean {
    return this.#call((noise) => noise.noise_is_transport()) === 1;
  }

  /** The handshake hash, 32 bytes, once the handshake is over. */
  handshakeHash(): Uint8Array {
    return this.#output(this.#call((noise) => noise.noise_handshake_hash()));
  }

  /** The other side's static key, 32 bytes, once the handshake is over. */
  remoteStaticKey(): Uint8Array {
    return this.#output(this.#call((noise) => noise.noise_remote_static()));
  }

  /** Rekeys the sending direction, after sending a `rekey` frame. */
  rekeyOutgoing(): void {
    this.#call((noise) => noise.noise_rekey_outgoing());
  }

  /** Rekeys the receiving direction, after reading a `rekey` frame. */
  rekeyIncoming(): void {
    this.#call((noise) => noise.noise_rekey_incoming());
  }

  /** Whether the session ended or failed. */
  get ended(): boolean {
    return this.#exports === undefined;
  }

  /** Zeroes the instance's whole memory and drops it. Calling it again does nothing. */
  end(): void {
    if (this.#exports === undefined) return;
    new Uint8Array(this.#exports.memory.buffer).fill(0);
    this.#exports = undefined;
  }

  /** Runs one call; a failure, a trap or a throw ends the session. */
  #call(run: (noise: NoiseExports) => number): number {
    const noise = this.#live();
    let result: number;
    try {
      result = run(noise);
    } catch {
      result = -1;
    }
    if (result < 0) {
      this.end();
      throw new NoiseSessionError();
    }
    return result;
  }

  /** The input buffer, refusing more bytes than it holds. */
  #input(noise: NoiseExports, length = 0): Uint8Array {
    if (length > noiseMaxMessageBytes) throw new NoiseSessionError();
    return memoryView(noise, noise.noise_input(), noiseMaxMessageBytes);
  }

  /** A copy of the output's first `length` bytes. */
  #output(length: number): Uint8Array {
    const noise = this.#live();
    return memoryView(noise, noise.noise_output(), length).slice();
  }

  /** The instance, or a throw once the session has ended. */
  #live(): NoiseExports {
    if (this.#exports === undefined) throw new NoiseSessionError();
    return this.#exports;
  }
}

/**
 * A view of `length` bytes at `pointer` in the instance's memory. Takes the
 * pointer first: the first call that asks for a buffer allocates both
 * buffers, which grows the memory and detaches any view made before it.
 */
function memoryView(noise: NoiseExports, pointer: number, length: number): Uint8Array {
  return new Uint8Array(noise.memory.buffer, pointer, length);
}
