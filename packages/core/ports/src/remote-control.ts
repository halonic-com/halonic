import type { TunnelReason, TunnelStatus } from "./tunnel-provider.ts";

/** Version of the {@link RemoteControl} port. A breaking change bumps it and comes with an ADR. */
export const remoteControlVersion = 1;

/** The platforms a paired phone can report. */
export const phonePlatforms = ["android", "ios"] as const;

/** One of {@link phonePlatforms}. */
export type PhonePlatform = (typeof phonePlatforms)[number];

/** A phone this computer has paired. Only public data: the host keeps no secret of the phone's. */
export interface PairedPhone {
  /** The device id: a hash of the phone's public key, stable for as long as it stays paired. */
  readonly id: string;
  /** The name the phone gave, with " (2)", " (3)" and so on when another paired phone has it already. */
  readonly name: string;
  readonly platform: PhonePlatform;
  /** When Allow was pressed, as an ISO 8601 time. */
  readonly pairedAt: string;
  /** When its last session ended, refreshed about once a minute while one is open; absent before the first ends. */
  readonly lastSeenAt?: string;
  /** Whether a session with it is open now. */
  readonly connected: boolean;
}

/** What Settings › Remote and the status bar show, as one snapshot. */
export interface RemoteState {
  /**
   * Whether this host offers remote at all. While it is `false`, Studio shows
   * no Remote section, and `setRemote(true)` and `startPairing` reject.
   */
  readonly available: boolean;
  /** Whether the person turned remote on. Phones stay paired while it is off. */
  readonly on: boolean;
  /** The tunnel provider's id, such as "tailscale", so Studio can word its reasons. */
  readonly tunnelProviderId: string;
  /** The tunnel's state and reason; `down` with `stopped` while remote is off. */
  readonly tunnel: TunnelStatus;
  /** "Let phones answer risky approvals": off by default, and settable while remote is off. */
  readonly allowRiskyRemotely: boolean;
  /** The paired phones, oldest pairing first. */
  readonly phones: readonly PairedPhone[];
  /** Whether a pairing is open now; there is at most one at a time. */
  readonly pairing: boolean;
}

/** Why a pairing ended without a phone. */
export const pairingEndReasons = [
  /** Pressed Don't allow. */
  "denied",
  /** Allow wasn't pressed within the wait. */
  "allow-timed-out",
  /** No phone came within the code's life. */
  "code-expired",
  /** The code took its last wrong try. */
  "too-many-tries",
  /** The dialog was closed, or `close` was called. */
  "closed",
  /** Remote was turned off. */
  "remote-off",
  /** The tunnel didn't come up or went down; the event says why. */
  "tunnel-down",
  /** Another pairing is already open. */
  "busy",
] as const;

/** One of {@link pairingEndReasons}. */
export type PairingEndReason = (typeof pairingEndReasons)[number];

/**
 * One step of a pairing. It starts with `code` (unless it ends at once),
 * then `check` once a phone has used the code, and ends with exactly one of
 * `paired` or `ended`.
 */
export type PairingEvent =
  | {
      /** Show this code and QR code; waiting for a phone. */
      readonly type: "code";
      /** The pairing code, in its plain 12-symbol form. */
      readonly code: string;
      /** The QR code's text, `halonic-pair:…`. */
      readonly qr: string;
      /** The name this computer gives itself, for "choose Tim's laptop". */
      readonly hostName: string;
      /** When the code stops working, as an ISO 8601 time. */
      readonly expiresAt: string;
    }
  | {
      /** A phone used the code: show the check code and wait for Allow. */
      readonly type: "check";
      /** The check code, in its plain 6-symbol form. */
      readonly checkCode: string;
      readonly phoneName: string;
      readonly platform: PhonePlatform;
      /** When the wait for Allow ends, as an ISO 8601 time. */
      readonly allowBy: string;
    }
  | { readonly type: "paired"; readonly phone: PairedPhone }
  | { readonly type: "ended"; readonly reason: Exclude<PairingEndReason, "tunnel-down"> }
  | {
      readonly type: "ended";
      readonly reason: "tunnel-down";
      /** Why, as the tunnel said it; remote may be off again by the time Studio shows it. */
      readonly tunnelReason: TunnelReason;
    };

/** One open pairing, as the Pair a phone dialog drives it. */
export interface PairingSession {
  /**
   * Every event so far, then each new one; the stream ends after `paired`
   * or `ended`. Each call gives a new stream.
   */
  events(): AsyncIterable<PairingEvent>;
  /** Pairs the phone. Rejects unless the last event is `check`. */
  allow(): Promise<void>;
  /** Ends the pairing with `denied`. Rejects unless the last event is `check`. */
  deny(): Promise<void>;
  /** Ends the pairing with `closed`. Does nothing once it has ended. */
  close(): Promise<void>;
}

/**
 * How Studio turns remote on and off, pairs and revokes phones and sets the
 * risky-approvals switch, on loopback to the host (requirement
 * `ports.remote-control`). The host does the work and keeps the rules
 * (ADR "Pairing and the end-to-end session"); Studio only shows and asks.
 *
 * `startPairing` turns remote on when it was off, and a pairing that ends
 * without a phone turns it off again if it did so and no phone is paired.
 * Revoking a phone closes its session at once; its agents keep running.
 *
 * @example
 * const pairing = await remote.startPairing();
 * for await (const event of pairing.events()) dialog.show(event);
 */
export interface RemoteControl {
  /** The current state first, then every change. Each call gives a new stream. */
  state(): AsyncIterable<RemoteState>;
  /** Turns remote on or off. Turning it off ends an open pairing with `remote-off`. */
  setRemote(on: boolean): Promise<void>;
  /** Opens a pairing; a second one while one is open ends at once with `busy`. */
  startPairing(): Promise<PairingSession>;
  /** Unpairs one phone. An id that isn't paired does nothing. */
  revoke(phoneId: string): Promise<void>;
  /** Unpairs every phone. */
  revokeAll(): Promise<void>;
  setAllowRiskyRemotely(allow: boolean): Promise<void>;
}
