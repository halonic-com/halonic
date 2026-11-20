import type { PairRefusedReason } from "@halonicjs/ports";

/**
 * What the gateway asks of the host's pairing service (B2) and its store of
 * paired phones, and all it asks. The rules about codes, tries and Allow live
 * there, in one place: the gateway only says what happened in a handshake and
 * sends the phone what the service answers (ADR "Pairing and the end-to-end
 * session").
 */

/** A refusal the host sends in cleartext before a pairing's message 3 decrypted. */
export interface PairingRefusal {
  readonly reason: PairRefusedReason;
  /** 1 to 4 for `wrong-code`, 0 for every other reason. */
  readonly triesLeft: number;
}

/** A phone whose pairing message 3 decrypted with the code and matched its commitment. */
export interface PairingPhone {
  /** Its static X25519 public key, 32 bytes, which the host keeps once Allow is pressed. */
  readonly publicKey: Uint8Array;
  /** The name it gave, at most 64 bytes of UTF-8, as it sent it. */
  readonly name: string;
  readonly platform: "android" | "ios";
  /** The check code both screens show. */
  readonly checkCode: string;
}

/**
 * How a pairing ended once the phone's message 3 decrypted. `allowed` and the
 * person's `denied` or `timed-out` go to the phone encrypted; `refused` (the
 * code was used by another phone meanwhile) goes in cleartext, like every
 * refusal before message 3.
 */
export type PairingAnswer =
  | { readonly kind: "allowed" }
  | { readonly kind: "denied" }
  | { readonly kind: "timed-out" }
  | { readonly kind: "refused"; readonly refusal: PairingRefusal };

/** One pairing handshake against the open code, from its message 1. */
export interface PairingAttempt {
  /**
   * The host didn't answer with message 2, because message 1 couldn't be
   * read. This isn't a try: nothing about the code was tested.
   */
  drop(): void;
  /**
   * A wrong try: message 3 didn't decrypt, its commitment didn't match, or
   * the handshake closed, dropped or timed out after the host's message 2.
   * Gives what to tell the phone; when it already left, nobody is told.
   */
  wrongTry(): PairingRefusal;
  /**
   * Message 3 decrypted and matched: the code is used. Resolves with the
   * person's answer. `signal` aborts when the phone leaves first, which ends
   * the pairing.
   */
  decrypted(phone: PairingPhone, signal: AbortSignal): Promise<PairingAnswer>;
}

/** What the pairing service answers to a pairing message 1. */
export type PairingStart =
  /** The code the handshake is tried against, and the attempt to report on. */
  | { readonly kind: "open"; readonly code: string; readonly attempt: PairingAttempt }
  /** No code to try: none is open, it is used or ended, or the host is rate limited. */
  | { readonly kind: "refused"; readonly refusal: PairingRefusal };

/** The host's pairing service, as the gateway uses it. */
export interface GatewayPairing {
  /** A pairing message 1 arrived. */
  begin(): PairingStart;
}

/** A paired phone's live session, as the store tracks it. */
export interface ConnectedPhone {
  /** The session ended, for any reason. */
  end(): void;
}

/** The host's identity and its paired phones, as the gateway uses them. */
export interface GatewayPhones {
  /** The host's static X25519 private key, 32 bytes, as a fresh copy: the session zeroes it. */
  hostPrivateKey(): Uint8Array;
  /** The name the host gives in pairing message 2. */
  hostName(): string;
  /** Whether a phone with this static public key is paired. */
  isPaired(publicKey: Uint8Array): boolean;
  /**
   * A paired phone's first transport message decrypted, so it is connected;
   * never on handshake message 1 alone, which anyone could replay. The store
   * calls `onRevoked` once if the phone is revoked while connected.
   */
  connected(publicKey: Uint8Array, onRevoked: () => void): ConnectedPhone;
}
