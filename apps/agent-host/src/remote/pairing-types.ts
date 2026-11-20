import type { GatewayPairDeniedReason, PairRefusedReason, PhonePlatform } from "@halonicjs/ports";

/*
 * The words the pairing desk and its two sides share: the dialog that shows
 * a pairing, and the gateway (B3) that runs the handshakes.
 */

/** A phone as its pairing message 3 told the host, once that message decrypted. */
export interface PairingPhone {
  /** Its static X25519 public key, 32 bytes. */
  readonly publicKey: Uint8Array;
  readonly name: string;
  readonly platform: PhonePlatform;
}

/**
 * Why a pairing ended without a phone. `phone-left` is the phone's
 * connection closing while the host waited for Allow.
 */
export type DeskEndReason =
  | "denied"
  | "allow-timed-out"
  | "code-expired"
  | "too-many-tries"
  | "closed"
  | "phone-left";

/** What the side that shows the pairing (the Pair a phone dialog) hears. */
export interface PairingWatcher {
  /** A phone used the code: show the check code with its name until `allowBy`. */
  check(check: { checkCode: string; phone: PairingPhone; allowBy: Date }): void;
  /** Allow was pressed: keep the phone. The phone hears `paired` once this resolves. */
  paired(phone: PairingPhone): Promise<void>;
  /** The pairing ended without a phone. Comes once, and nothing comes after it. */
  ended(reason: DeskEndReason): void;
}

/** A cleartext refusal, as the gateway writes it in a `pair-refused` frame. */
export interface PairRefusal {
  readonly reason: PairRefusedReason;
  readonly triesLeft: number;
}

/** What the phone hears, encrypted, once it used the code: `paired`, or `pair-refused`. */
export type PairingVerdict =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: GatewayPairDeniedReason };

/** One open pairing, as the dialog drives it. */
export interface OpenPairing {
  /** The pairing code, 12 symbols. */
  readonly code: string;
  /** When the code stops working, unless a phone used it first. */
  readonly expiresAt: Date;
  /** Pairs the phone. Rejects unless a phone used the code and Allow is awaited. */
  allow(): Promise<void>;
  /** Ends the pairing with `denied`. Throws unless a phone used the code and Allow is awaited. */
  deny(): void;
  /** Ends the pairing with `closed`. Does nothing once it has ended. */
  close(): void;
}
