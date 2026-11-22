/**
 * The words of the phone's Paired computers screens (`d-m1` to `d-m3`): the `phone.computers.*`
 * keys of the strings table on HAL-12233, same names in camelCase, a function where a value goes
 * in. A row's state uses the short forms of the header labels (G16).
 */
import { dayOf } from "./phone-forms.ts";
import type { PhoneState } from "./phone-status.ts";
import type { PairedComputer } from "./phone-tunnel.ts";

export const computersWords = {
  title: "Paired computers",
  row: {
    connected: "Connected",
    reconnecting: "Reconnecting…",
    unreachable: "Can't reach",
    phoneOffline: "Phone offline",
    removed: "Removed",
    cantConfirm: "Can't confirm",
    forget: "Forget",
  } satisfies Record<PhoneState | "forget", string>,
  note: "Forget only removes a computer from this phone. To cut this phone off for good, revoke it in Halonic on the computer.",
  pair: "Pair with a computer",
  forget: {
    title: (computer: string) => `Forget ${computer}?`,
    body: "This phone stops trying to reach it and clears what it saved from it.",
    stillPaired:
      "The computer still lists this phone as paired. To cut it off there, use Revoke in Settings › Remote.",
    confirm: "Forget",
    cancel: "Cancel",
    /** Decided by the team on HAL-12248: the kit's busy button needs a label. */
    busy: "Forgetting…",
    /** Decided by the team on HAL-12248: the shell couldn't delete the entry. */
    failed: (computer: string) => `Couldn't forget ${computer}. Try again.`,
  },
  empty: {
    title: "No computers paired",
    body: "Pair with a computer to see your agents, approve and send prompts.",
  },
} as const;

/** `{route}` on the phone: the tunnel provider, or the local network. */
export type ComputerRoute = "Tailscale" | "This Wi-Fi";

const tailnetSuffix = ".ts.net";

/**
 * How an endpoint is reached: Tailscale for a `.ts.net` name or an address in `100.64/10`, the
 * shared range Tailscale's addresses sit in, else this Wi-Fi. Takes a URL (`tcp://`, `wss://`)
 * as the QR code carries it, or a typed route's `host[:port]`.
 */
export function routeOf(endpoint: string): ComputerRoute {
  const host = (endpoint.replace(/^[a-z]+:\/\//, "").split(/[:/]/)[0] ?? "").toLowerCase();
  if (host.endsWith(tailnetSuffix)) return "Tailscale";
  const parts = host.split(".").map(Number);
  const [first, second] = parts;
  const ipv4 = parts.length === 4 && parts.every((part) => Number.isInteger(part));
  return ipv4 && first === 100 && second !== undefined && second >= 64 && second < 128
    ? "Tailscale"
    : "This Wi-Fi";
}

/**
 * A row's second line, `{route}` · Paired `{pairedOn}`, through the endpoint it was last reached
 * at (the shell lists the latest first). Without one, only the day.
 */
export function computerMeta(computer: PairedComputer, now: Date): string {
  const paired = `Paired ${dayOf(new Date(computer.pairedAt), now)}`;
  const latest = computer.endpoints[0];
  return latest === undefined ? paired : `${routeOf(latest)} · ${paired}`;
}
