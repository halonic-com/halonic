import type { PairingOutcome, TunnelPairingProblem } from "./phone-tunnel.ts";

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

/** The route a pairing started on; `wifi` when the typed route's computer was found on this Wi-Fi. */
export type PairingFrom =
  | { readonly route: "qr" }
  | { readonly route: "typed"; readonly wifi: boolean };

/** Everything that can stop a pairing: a problem, Don't allow (`refused`) or no Allow in time. */
export type PairingStop = TunnelPairingProblem | Exclude<PairingOutcome, { kind: "paired" }>;

/**
 * The screen a pairing problem leads to (`p-m6` to `p-m10`, G25, G26, microcopy 28):
 *
 * - `typedWrong`: the typed route's screen again, with the tries left in the
 *   field's error. A wrong code on the scanned route can only be a code that
 *   changed since the scan, so it reads as `ended`.
 * - `ended`: This code no longer works; `noAllow` when Allow wasn't pressed in time.
 * - `used`: This code was already used.
 * - `refused`: The computer didn't allow this phone.
 * - `rateLimited`: Too many tries on the computer (G25); Try again sends the same code.
 * - `cantConfirm`: Can't confirm it's the computer (G26), with Scan again.
 * - `unreadable`: Couldn't read the computer's answer.
 * - `unreachable`: Can't reach the computer; `wifi` when it was found on this Wi-Fi,
 *   `phoneOffline` when the phone's own network is down, so the check is about the phone.
 * - `generic`: the page sent a code or key that isn't one. That's a bug, not the person's
 *   doing: the screen logs it and shows the generic problem screen.
 */
export type PairingProblemScreen =
  | { readonly screen: "typedWrong"; readonly triesLeft: number }
  | { readonly screen: "ended"; readonly noAllow: boolean }
  | { readonly screen: "used" | "refused" | "rateLimited" | "cantConfirm" | "unreadable" }
  | { readonly screen: "unreachable"; readonly wifi: boolean; readonly phoneOffline: boolean }
  | { readonly screen: "generic" };

/**
 * Which problem screen a pairing stop shows, for the route it started on. A failed handshake
 * and too many tries don't read as "no longer works" (C599 on HAL-15599): the code may still
 * work after a minute, and a new code doesn't help a phone on another network.
 */
export function problemScreen(stop: PairingStop, from: PairingFrom): PairingProblemScreen {
  switch (stop.kind) {
    case "wrong-code":
      return from.route === "typed"
        ? { screen: "typedWrong", triesLeft: stop.triesLeft }
        : { screen: "ended", noAllow: false };
    case "code-ended":
      return { screen: "ended", noAllow: false };
    case "timeout":
      return { screen: "ended", noAllow: true };
    case "rate-limited":
      return { screen: "rateLimited" };
    // Only the scanned route carries the computer's key to check (HAL-15157).
    case "handshake-failed":
      return { screen: "cantConfirm" };
    case "unreadable":
      return { screen: "unreadable" };
    case "bad-start":
      return { screen: "generic" };
    case "code-used":
      return { screen: "used" };
    case "refused":
      return { screen: "refused" };
    case "cant-reach":
      return {
        screen: "unreachable",
        wifi: from.route === "typed" && from.wifi,
        phoneOffline: stop.reason === "network-down",
      };
  }
}
