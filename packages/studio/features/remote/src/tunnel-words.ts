import type { TunnelReason, TunnelStatus } from "@halonicjs/ports";

/** A button a tunnel's problem offers: a page of the provider's, or turning remote on again. */
export type TunnelAction =
  | {
      readonly kind: "open";
      readonly label: string;
      readonly url: string;
      /** Where it leaves Studio for: "Opens Tailscale's website". */
      readonly opens: string;
    }
  | { readonly kind: "check-again"; readonly label: string };

/** How Studio words a tunnel's reason (design "Tunnel phase B screens", reason table). */
export interface ReasonWords {
  /** The callout's title, such as "Tailscale is signed out". */
  readonly title: string;
  /** The line under it, or `undefined` for none. */
  readonly line?: string;
  readonly actions: readonly TunnelAction[];
  /** The short state on the Connection line, such as "Signed out". */
  readonly state: string;
}

/** The names people know the providers by; any other id is shown as it is. */
const providerNames: Readonly<Record<string, string>> = { tailscale: "Tailscale" };

/**
 * Where "Open Tailscale setup" and "How to turn Funnel off" go. Both are web pages: a web page
 * can't open the Tailscale app (design decision 26).
 */
export const tailscaleSetupUrl = "https://tailscale.com/download";
export const tailscaleFunnelOffUrl =
  "https://tailscale.com/docs/reference/tailscale-cli/funnel#turn-tailscale-funnel-off";

/** The provider's name, such as "Tailscale" for `tailscale`. */
export function providerName(id: string): string {
  return providerNames[id] ?? id;
}

const checkAgain: TunnelAction = { kind: "check-again", label: "Check again" };

/** The words for a tunnel that is `degraded` or `down` for `reason`, through `provider`. */
export function reasonWords(reason: TunnelReason, provider: string): ReasonWords {
  const name = providerName(provider);
  const opens = `Opens ${name}'s website`;
  switch (reason) {
    case "not-installed":
      return {
        title: `${name} isn't installed`,
        line: `Halonic reaches your phone through ${name}. Install it on this computer and on your phone, sign in on both, then check again.`,
        actions: [
          { kind: "open", label: `Open ${name} setup`, url: tailscaleSetupUrl, opens },
          checkAgain,
        ],
        state: "Not installed",
      };
    case "signed-out":
      return {
        title: `${name} is signed out`,
        line: `Phones can't reach this computer until you sign in to ${name} on it again. Your agents keep running.`,
        actions: [checkAgain],
        state: "Signed out",
      };
    case "offline":
      return {
        title: "This computer is offline",
        line: "Phones can't reach it until it is back online. Your agents keep running.",
        actions: [],
        state: "Offline",
      };
    case "provider-error":
      return {
        title: `${name} reported a problem`,
        line: "Phones may not reach this computer. Your agents keep running.",
        actions: [checkAgain],
        state: "Problem",
      };
    case "public-refused":
      return {
        title: `${name} Funnel is on`,
        line: `Funnel would put Halonic's remote port on the public internet, so Halonic refuses to use it. Turn Funnel off in ${name}.`,
        actions: [
          { kind: "open", label: "How to turn Funnel off", url: tailscaleFunnelOffUrl, opens },
          checkAgain,
        ],
        state: "Funnel on",
      };
    case "stopped":
      return { title: "Remote is off", actions: [], state: "Off" };
  }
}

/** The tunnel's problem to show, or `undefined` while it starts, is ready or is stopped. */
export function tunnelProblem(tunnel: TunnelStatus, provider: string): ReasonWords | undefined {
  if (!("reason" in tunnel) || tunnel.reason === "stopped") return undefined;
  return reasonWords(tunnel.reason, provider);
}

/** The short state on the Connection line: "Ready", "Starting…", or the reason's. */
export function tunnelState(tunnel: TunnelStatus, provider: string): string {
  if ("reason" in tunnel) return reasonWords(tunnel.reason, provider).state;
  return tunnel.state === "ready" ? "Ready" : "Starting…";
}
