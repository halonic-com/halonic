import type { PairingQrPayload } from "@halonicjs/ports";

/**
 * How a computer is reached, as its second line says it. On Android the
 * typed route lists computers on this Wi-Fi and computers paired before,
 * never Tailscale ones (G23); a scanned code is reached through Tailscale.
 */
export type PhoneRoute = "tailscale" | "wifi" | "pairedBefore";

/** A computer in the typed route's list. */
export interface FoundComputer {
  /** Stable while the list is open, for the radio row. */
  readonly id: string;
  /** The computer's own name: "Tim's laptop". */
  readonly name: string;
  readonly route: Exclude<PhoneRoute, "tailscale">;
}

/** Where a pairing starts: a scanned QR code, or a typed code for a chosen computer. */
export type PairingStart =
  | { readonly kind: "scanned"; readonly payload: PairingQrPayload }
  | { readonly kind: "typed"; readonly computer: FoundComputer; readonly code: string };

/**
 * Why a pairing stopped, from what the phone can tell (the gateway's
 * `pair-refused` frame and message, and the transport's errors):
 *
 * - `wrongCode`: the typed code didn't match; `triesLeft` is 1 to 4.
 * - `codeEnded`: the code ran out, had its fifth wrong try, or its window
 *   was closed.
 * - `codeUsed`: another phone used the code first.
 * - `rateLimited`: the computer had too many failed tries this minute.
 * - `denied`: Don't allow was pressed on the computer.
 * - `timedOut`: Allow wasn't pressed within 2 minutes.
 * - `cantConfirm`: the computer that answered isn't the one in the QR code.
 * - `unreachable`: the computer didn't answer, or refused the connection.
 * - `phoneOffline`: the phone's own network is down.
 */
export type PairingProblem =
  | { readonly kind: "wrongCode"; readonly triesLeft: number }
  | {
      readonly kind:
        | "codeEnded"
        | "codeUsed"
        | "rateLimited"
        | "denied"
        | "timedOut"
        | "cantConfirm"
        | "unreachable"
        | "phoneOffline";
    };

/** The handshake is done: both screens show the same check code until Allow or Don't allow. */
export interface PairingCheck {
  readonly kind: "check";
  /** The computer's own name, from the handshake. */
  readonly computer: string;
  /** The 6 characters, without the group separator: "4F72KQ". */
  readonly checkCode: string;
}

/**
 * The phone's side of a pairing, which the Android shell drives with the
 * `halonic-tunnel` crate. One pairing at a time.
 */
export interface PhonePairing {
  /** Connects to the computer and runs the handshake up to the check code. */
  start(from: PairingStart): Promise<PairingCheck | PairingProblem>;
  /** After {@link start} gave the check code: waits for Allow on the computer. */
  waitForAllow(): Promise<{ readonly kind: "paired"; readonly computer: string } | PairingProblem>;
  /** Ends the pairing the phone started; nothing is kept. A waiting call gives `codeEnded`. */
  cancel(): Promise<void>;
}

/**
 * The screen a pairing problem leads to (`p-m6` to `p-m10`):
 *
 * - `typedWrong`: the typed route's screen again, with the tries left in the
 *   field's error. A wrong code on the scanned route can only be a code that
 *   changed since the scan, so it reads as `ended`.
 * - `ended`: This code no longer works; `noAllow` when Allow wasn't pressed in time.
 * - `used`: This code was already used.
 * - `refused`: The computer didn't allow this phone.
 * - `unreachable`: Can't reach the computer; `wifi` when it was found on this Wi-Fi.
 * - `rateLimited`, `cantConfirm`: not drawn in the design yet; their words
 *   are a wording gap on the task.
 */
export type PairingProblemScreen =
  | { readonly screen: "typedWrong"; readonly triesLeft: number }
  | { readonly screen: "ended"; readonly noAllow: boolean }
  | { readonly screen: "used" | "refused" | "rateLimited" | "cantConfirm" }
  | { readonly screen: "unreachable"; readonly wifi: boolean };

/** Which problem screen a pairing problem shows, for the route it started on. */
export function problemScreen(problem: PairingProblem, from: PairingStart): PairingProblemScreen {
  switch (problem.kind) {
    case "wrongCode":
      return from.kind === "typed"
        ? { screen: "typedWrong", triesLeft: problem.triesLeft }
        : { screen: "ended", noAllow: false };
    case "codeEnded":
      return { screen: "ended", noAllow: false };
    case "timedOut":
      return { screen: "ended", noAllow: true };
    case "codeUsed":
      return { screen: "used" };
    case "denied":
      return { screen: "refused" };
    case "rateLimited":
    case "cantConfirm":
      return { screen: problem.kind };
    case "unreachable":
    case "phoneOffline":
      return {
        screen: "unreachable",
        wifi: from.kind === "typed" && from.computer.route === "wifi",
      };
  }
}
