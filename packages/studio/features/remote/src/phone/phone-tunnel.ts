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
 * with the picked computer's `host[:port]`. `again` replaces that computer's entry.
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
 * includes a QR key that isn't this computer's; `unreadable` is a guard the screens don't
 * meet, because the scanner filters other codes.
 */
export type TunnelPairingProblem =
  | { readonly kind: "wrong-code"; readonly triesLeft: number }
  | { readonly kind: "code-ended" | "code-used" | "rate-limited" | "handshake-failed" }
  | { readonly kind: "cant-reach"; readonly reason: ReachFailure }
  | { readonly kind: "unreadable" };

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

export type PairingStep =
  | {
      readonly kind: "check";
      readonly pairing: PairingId;
      readonly checkCode: string;
      readonly computerName: string;
    }
  | TunnelPairingProblem;

/** A wrong code is known only after the check code shows, so problems can come here too. */
export type PairingOutcome =
  | { readonly kind: "paired"; readonly computer: PairedComputer }
  | { readonly kind: "refused" | "timeout" }
  | TunnelPairingProblem;

export type ConnectOutcome =
  | { readonly kind: "connecting" | "not-paired" }
  | { readonly kind: "cant-reach"; readonly reason: ReachFailure };

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
  pairedComputers(): Promise<readonly PairedComputer[]>;
  /** Deletes the entry with its key and everything kept for it. */
  forget(computer: ComputerId): Promise<void>;
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
