/**
 * The phone's tunnel as its screens use it (shape agreed with D6 on HAL-15166). The Android
 * shell implements it with Tauri commands (`tauriPhoneTunnel`, HAL-15157). The page sees only
 * opaque ids, the check code, names and states: no key or pairing secret ever comes back out.
 * Kinds are the shell's kebab-case wire names; the screens map them in `problemScreen` and
 * {@link phoneStatusLabelState}.
 */
import type { PhoneState } from "./phone-status.ts";

/** A pairing in progress, named by the shell. */
export type PairingId = string & { readonly __pairing: unique symbol };
/** A paired computer, named by the shell. It stays the same when paired again. */
export type ComputerId = string & { readonly __computer: unique symbol };

/** How the connection failed: `network-down` only when the phone's own network is down. */
export type ReachFailure = "network-down" | "timeout" | "refused" | "unreachable";

/**
 * Where a pairing starts: the scanned QR text (the shell decodes it again), or a typed code
 * with the picked computer's `host[:port]`. `again` replaces that computer's entry; an `again`
 * that names no listed computer (forgotten on another screen) answers `bad-start`.
 */
export type TunnelPairingStart =
  | { readonly route: "qr"; readonly scanned: string; readonly again?: ComputerId }
  | {
      readonly route: "typed";
      readonly code: string;
      readonly endpoint: string;
      readonly again?: ComputerId;
    };

/**
 * Why a pairing stopped. `code-ended` also follows the fifth wrong try; `handshake-failed`
 * is a computer that isn't the one in the scanned QR code; `unreadable` is an answer from
 * the computer the phone can't read; `bad-start` is a code or key from the page that isn't
 * one, a bug the screens don't meet, because the scanner filters other codes.
 */
export type TunnelPairingProblem =
  | { readonly kind: "wrong-code"; readonly triesLeft: number }
  | { readonly kind: "code-ended" | "code-used" | "rate-limited" | "handshake-failed" }
  | { readonly kind: "cant-reach"; readonly reason: ReachFailure }
  | { readonly kind: "unreadable" | "bad-start" };

/**
 * The phone itself stops the call (microcopy 28), so the screens show it whatever the call was:
 *
 * - `no-local-network`: Android's Nearby devices was turned down for a computer on this Wi-Fi.
 *   `askAgain` is true while Android would still ask (Try again), false when only the phone's
 *   Settings can allow it (Open settings), as in G23 and G24.
 * - `key-unreadable`: the phone can't read the key it saved for that computer. Nothing is
 *   cleared; the person pairs again or forgets the computer.
 * - `keys-unavailable`: the phone's key storage doesn't work at all, so nothing that needs a
 *   key can be done (Try again).
 */
export type PhoneKeyProblem =
  | { readonly kind: "no-local-network"; readonly askAgain: boolean }
  | { readonly kind: "key-unreadable" }
  | KeysUnavailable;

/** The phone's key storage (Keystore) doesn't work; any call that needs it answers this. */
export interface KeysUnavailable {
  readonly kind: "keys-unavailable";
}

/** A computer on the paired list. A removed one keeps its entry until {@link PhoneTunnel.forget}. */
export interface PairedComputer {
  readonly id: ComputerId;
  readonly name: string;
  /** ISO times. */
  readonly pairedAt: string;
  readonly lastConnectedAt?: string;
  readonly endpoints: readonly string[];
  readonly standing: "paired" | "removed" | "cant-confirm";
}

/**
 * A listed computer whose saved details the phone can't read: it has no name, no times and no
 * endpoints, and is listed only so it can be forgotten.
 */
export interface UnreadableComputer {
  readonly id: ComputerId;
  readonly standing: "unreadable";
}

/** An entry on the paired list, readable or not. */
export type ListedComputer = PairedComputer | UnreadableComputer;

export type PairingStep =
  | {
      readonly kind: "check";
      readonly pairing: PairingId;
      readonly checkCode: string;
      readonly computerName: string;
    }
  | TunnelPairingProblem
  | PhoneKeyProblem;

/**
 * A wrong code is known only after the check code shows, so problems can come here too. Saving
 * the new key after Allow can still meet broken key storage.
 */
export type PairingOutcome =
  | { readonly kind: "paired"; readonly computer: PairedComputer }
  | { readonly kind: "refused" | "timeout" }
  | TunnelPairingProblem
  | KeysUnavailable;

export type ConnectOutcome =
  | { readonly kind: "connecting" | "not-paired" }
  | { readonly kind: "cant-reach"; readonly reason: ReachFailure }
  | PhoneKeyProblem;

/** What {@link PhoneTunnel.forget} did. */
export type ForgetOutcome = { readonly kind: "forgotten" } | KeysUnavailable;

/** The connection's state, pushed by the shell. `nextTryAt` is ISO. */
export type PhoneStatus =
  | {
      readonly state: "connecting" | "connected" | "cant-confirm" | "removed" | "paused" | "closed";
    }
  | {
      readonly state: "reconnecting";
      readonly lastTry?: ReachFailure;
      readonly nextTryAt?: string;
    };

export interface PhoneTunnel {
  /** Runs the handshake up to the check code, or says why it stopped. */
  startPairing(start: TunnelPairingStart): Promise<PairingStep>;
  /** After the check code: waits for Allow on the computer (2 minutes). */
  waitForAllow(pairing: PairingId): Promise<PairingOutcome>;
  /** The person left the check-code screen; a waiting call ends. */
  cancelPairing(pairing: PairingId): Promise<void>;
  pairedComputers(): Promise<readonly ListedComputer[] | KeysUnavailable>;
  /** Deletes the entry with its key and everything kept for it. */
  forget(computer: ComputerId): Promise<ForgetOutcome>;
  /** Connects; on a computer already reconnecting, tries at once ("Try now"). */
  connect(computer: ComputerId): Promise<ConnectOutcome>;
  disconnect(computer: ComputerId): Promise<void>;
  /** Sends the current status once, then every change. Returns the unsubscribe. */
  onStatus(listener: (computer: ComputerId, status: PhoneStatus) => void): () => void;
}

/**
 * The header label's state for a status (design decision 16), or `keep` to leave the label as
 * it is (`paused`) and `none` for no label (`closed`). A first `connecting` reads as
 * Reconnecting: no Connecting label was drawn.
 */
export function phoneStatusLabelState(status: PhoneStatus): PhoneState | "keep" | "none" {
  switch (status.state) {
    case "connected":
      return "connected";
    case "connecting":
      return "reconnecting";
    case "reconnecting":
      switch (status.lastTry) {
        case undefined:
          return "reconnecting";
        case "network-down":
          return "phoneOffline";
        default:
          return "unreachable";
      }
    case "removed":
      return "removed";
    case "cant-confirm":
      return "cantConfirm";
    case "paused":
      return "keep";
    case "closed":
      return "none";
  }
}
