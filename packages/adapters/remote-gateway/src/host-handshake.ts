import {
  checkCode,
  NoiseSession,
  pairCommit,
  pairingPsk,
  sameBytes,
} from "@halonicjs/adapter-e2e-noise";
import { gatewayHostName, gatewayMaxHandshakeBytes } from "@halonicjs/ports";
import { encodeE2eFrame } from "./e2e-frames.ts";
import { encodeHostPayload, readCommitPayload, readPhonePayload } from "./handshake-payloads.ts";
import type {
  GatewayPairing,
  GatewayPhones,
  PairingAttempt,
  PairingPhone,
  PairingRefusal,
} from "./phone-access.ts";

/**
 * The host's side of the two handshakes (ADR "Pairing and the end-to-end
 * session"), one message at a time. Each step gives what happened and the
 * frame to send, if any; the session decides what follows.
 */

/** What the host needs for a handshake. */
export interface HandshakeDeps {
  readonly phones: GatewayPhones;
  readonly pairing: GatewayPairing;
}

/** A pairing after the host's message 2: what message 3 is checked against. */
export interface PairingInProgress {
  readonly noise: NoiseSession;
  readonly attempt: PairingAttempt;
  /** The phone's commitment from message 1. */
  readonly commit: string;
}

/** What the host made of pairing message 1. */
export type PairingOpening =
  | { readonly kind: "answered"; readonly reply: Uint8Array; readonly pairing: PairingInProgress }
  | { readonly kind: "refused"; readonly refusal: PairingRefusal }
  /** Message 1 couldn't be read; the host says nothing and closes. */
  | { readonly kind: "unreadable" };

/** What the host made of pairing message 3. */
export type PairingEnd =
  | { readonly kind: "decrypted"; readonly phone: PairingPhone }
  /** It didn't decrypt, its commitment didn't match or its payload broke the rules. */
  | { readonly kind: "wrong-try" };

/** What the host made of reconnect message 1. */
export type ReconnectOpening =
  | {
      readonly kind: "answered";
      readonly reply: Uint8Array;
      readonly noise: NoiseSession;
      readonly phoneKey: Uint8Array;
    }
  /** It didn't decrypt to this host's key: the phone pinned another one. */
  | { readonly kind: "handshake-failed" }
  /** It decrypted but broke the rules (a payload, where there is none). */
  | { readonly kind: "unreadable" };

const encoder = new TextEncoder();
const nothing = new Uint8Array(0);

/**
 * Pairing message 1: asks the pairing service for the open code, reads the
 * phone's commitment and answers message 2 with the host's name. Message 1
 * that can't be read sends nothing and costs no try.
 */
export function openPairing(body: Uint8Array, deps: HandshakeDeps): PairingOpening {
  if (body.length > gatewayMaxHandshakeBytes) return { kind: "unreadable" };
  const start = deps.pairing.begin();
  if (start.kind === "refused") return start;
  let noise: NoiseSession | undefined;
  let psk: Uint8Array | undefined;
  try {
    psk = pairingPsk(start.code);
    // The session zeroes the psk and the key copy, also when it can't start.
    noise = NoiseSession.start({
      handshake: "pairing",
      role: "responder",
      localPrivateKey: deps.phones.hostPrivateKey(),
      psk,
    });
    const commitment = readCommitPayload(noise.readMessage(body));
    if (commitment === undefined) throw new RangeError("not a commitment");
    const hostName = gatewayHostName(deps.phones.hostName());
    const reply = encodeE2eFrame("pair2", noise.writeMessage(encodeHostPayload({ hostName })));
    return {
      kind: "answered",
      reply,
      pairing: { noise, attempt: start.attempt, commit: commitment.commit },
    };
  } catch {
    psk?.fill(0);
    noise?.end();
    start.attempt.drop();
    return { kind: "unreadable" };
  }
}

/**
 * Pairing message 3: decrypts it with the code, checks the commitment from
 * message 1 in constant time, and reads the phone's name and platform. Only
 * then is the code used. The session's Noise state is left in transport mode
 * for the answer; after a wrong try it has ended.
 */
export function finishPairing(body: Uint8Array, pairing: PairingInProgress): PairingEnd {
  const { noise } = pairing;
  try {
    if (body.length > gatewayMaxHandshakeBytes) throw new RangeError("too large");
    const payload = noise.readMessage(body);
    const phoneKey = noise.remoteStaticKey();
    const expected = encoder.encode(pairCommit(phoneKey, payload));
    const phone = readPhonePayload(payload);
    if (!sameBytes(expected, encoder.encode(pairing.commit)) || phone === undefined) {
      throw new RangeError("not the committed message 3");
    }
    if (!noise.isTransport) throw new RangeError("the handshake isn't over");
    const code = checkCode(noise.handshakeHash());
    return {
      kind: "decrypted",
      phone: { publicKey: phoneKey, name: phone.name, platform: phone.platform, checkCode: code },
    };
  } catch {
    noise.end();
    return { kind: "wrong-try" };
  }
}

/**
 * Reconnect message 1: decrypts it to the host's static key, which proves the
 * phone pinned this host, and answers message 2, which proves the host to the
 * phone. Whether the phone is paired is the session's to ask after this.
 */
export function openReconnect(body: Uint8Array, deps: HandshakeDeps): ReconnectOpening {
  if (body.length > gatewayMaxHandshakeBytes) return { kind: "unreadable" };
  let noise: NoiseSession;
  try {
    noise = NoiseSession.start({
      handshake: "reconnect",
      role: "responder",
      localPrivateKey: deps.phones.hostPrivateKey(),
    });
  } catch {
    // The host's own key is at fault, not the phone's pin: say nothing.
    return { kind: "unreadable" };
  }
  let payload: Uint8Array;
  try {
    payload = noise.readMessage(body);
  } catch {
    return { kind: "handshake-failed" };
  }
  try {
    if (payload.length !== 0) throw new RangeError("a reconnect's payload is empty");
    const reply = encodeE2eFrame("resume2", noise.writeMessage(nothing));
    if (!noise.isTransport) throw new RangeError("the handshake isn't over");
    return { kind: "answered", reply, noise, phoneKey: noise.remoteStaticKey() };
  } catch {
    noise.end();
    return { kind: "unreadable" };
  }
}
