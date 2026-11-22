/**
 * The words of the phone's Paired computers screens (`d-m1` to `d-m3`): the `phone.computers.*`
 * keys of the strings table on HAL-12233, same names in camelCase, a function where a value goes
 * in. A row's state uses the short forms of the header labels (G16).
 */
import { pairWords } from "./pair-words.ts";
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
  note: "Forget only removes a computer from this phone. To cut this phone off for good, use Revoke in Settings › Remote on the computer.",
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
    /** Microcopy 28: the shell's `keys-unavailable` shows that problem's line instead. */
    keysUnavailable: pairWords.phoneKeys.keysUnavailable.body,
  },
  /** Said politely once a row leaves the list (microcopy 28). */
  forgotten: (computer: string) => `${computer} forgotten.`,
  /**
   * Microcopy 28: a computer whose saved details this phone can't read. It has no name, route or
   * day, and is listed only so it can be forgotten.
   */
  unreadable: {
    name: "A computer this phone can't read",
    body: "Its name and address can't be read. Forget it, then pair that computer again.",
    forgetName: "Forget the computer this phone can't read",
    /**
     * Decided by the team on HAL-12248: with several, each Forget is numbered in list order, so
     * a screen reader tells them apart.
     */
    forgetNameOf: (index: number, count: number) =>
      count > 1
        ? `Forget the computer this phone can't read, ${index} of ${count}`
        : "Forget the computer this phone can't read",
    forget: {
      title: "Forget this computer?",
      body: "This phone clears what it saved for it.",
      stillPaired:
        "A computer may still list this phone as paired. To cut it off there, use Revoke in Settings › Remote.",
      failed: "Couldn't forget this computer. Try again.",
    },
    forgotten: "Computer forgotten.",
  },
  /** Microcopy 28: the list can't be read because the phone's key storage doesn't work. */
  keysUnavailable: {
    title: pairWords.phoneKeys.keysUnavailable.title,
    body: pairWords.phoneKeys.keysUnavailable.body,
    tryAgain: "Try again",
  },
  empty: {
    title: "No computers paired",
    body: "Pair with a computer to see your agents, approve and send prompts.",
  },
} as const;

/** `{route}` on the phone: the tunnel provider, or the local network. */
export type ComputerRoute = "Tailscale" | "This Wi-Fi";

const tailnetSuffix = ".ts.net";

/** Tailscale's IPv6 range, `fd7a:115c:a1e0::/48`: its first three groups. */
const tailnetIpv6 = [0xfd7a, 0x115c, 0xa1e0];

/** The host of a URL (`tcp://`, `wss://`) or a typed `host[:port]`; an IPv6 one without brackets. */
function hostOf(endpoint: string): string {
  const rest = endpoint.replace(/^[a-z]+:\/\//, "").toLowerCase();
  if (rest.startsWith("[")) return rest.slice(1, rest.indexOf("]"));
  const host = rest.split("/")[0] ?? "";
  // Two colons or more: a bare IPv6 address, which has no port.
  return host.split(":").length > 2 ? host : (host.split(":")[0] ?? "");
}

/**
 * How an endpoint is reached: Tailscale for a `.ts.net` name, an address in `100.64/10`, the
 * shared range Tailscale's IPv4 addresses sit in, or one in `fd7a:115c:a1e0::/48`, else this
 * Wi-Fi. Takes a URL (`tcp://`, `wss://`) as the QR code carries it, or a typed route's
 * `host[:port]`, with an IPv6 host in brackets.
 */
export function routeOf(endpoint: string): ComputerRoute {
  const host = hostOf(endpoint);
  if (host.endsWith(tailnetSuffix)) return "Tailscale";
  if (host.includes(":")) {
    // A `::` among the first three groups makes one of them empty, so it can't match.
    const groups = host.split(":").slice(0, 3);
    const tailnet = groups.every(
      (group, index) => /^[0-9a-f]{1,4}$/.test(group) && parseInt(group, 16) === tailnetIpv6[index],
    );
    return tailnet ? "Tailscale" : "This Wi-Fi";
  }
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
