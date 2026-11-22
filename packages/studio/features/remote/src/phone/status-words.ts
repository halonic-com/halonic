/**
 * The words of the phone's status detail sheets (`s-m4`, `s-m5`, `s-m6`, `s-m8`, G14, G17, G24):
 * the `phone.sheet.*` keys of the strings table on HAL-12233, same names in camelCase, a function
 * where a value goes in. `{asOf}` and `{seconds}` come from `phone-forms.ts`.
 */
import { pairWords } from "./pair-words.ts";

/** "the phone can't reach it" in each trouble sheet's Your phone card. */
const cantReach = (computer: string) =>
  `it can't reach ${computer}, show new work or take your answers.`;

export const sheetWords = {
  yourPhone: "Your phone",
  yourAgents: (asOf: string) => `Your agents · as of ${asOf}`,
  tryAgain: "Try again",
  openTailscale: "Open Tailscale",
  openSettings: "Open settings",
  unreachable: {
    title: "Your computer isn't answering",
    phone: (computer: string) =>
      `It is online, but ${computer} doesn't answer, so it can't show new work or take your answers.`,
    check: (computer: string) =>
      `Check that ${computer} is on and awake, Halonic is open, and Tailscale is on there.`,
    /** For a computer reached through this Wi-Fi: the pairing screen's words (`bodyWifi`, G13). */
    checkWifi: (computer: string) =>
      `Check that ${computer} is on and awake, Halonic is open, and both are on the same Wi-Fi.`,
  },
  phoneOffline: {
    title: "Your phone is offline",
    phone: (computer: string) => `It has no internet, so ${cantReach(computer)}`,
    check: "Turn on Wi-Fi or mobile data. It reconnects by itself when it is back online.",
  },
  tailscaleOff: {
    title: "Tailscale is off on this phone",
    phone: (computer: string) => `Its Tailscale is off, so ${cantReach(computer)}`,
    check: "Turn Tailscale on. It reconnects by itself.",
  },
  nearbyOff: {
    title: "Nearby devices isn't allowed for Halonic",
    phone: (computer: string) =>
      `Without the Nearby devices permission, it can't reach ${computer} on this Wi-Fi, show new work or take your answers.`,
    check: "Allow Nearby devices for Halonic in Android settings. It reconnects by itself.",
  },
  reconnecting: {
    title: "Reconnecting…",
    body: (computer: string, seconds: string) =>
      `Looking for ${computer}. Trying again in ${seconds}.`,
    bodyTrying: (computer: string) => `Looking for ${computer}. Trying now…`,
    stale: (asOf: string) =>
      `Last update ${asOf}. What you see may be out of date until it reconnects.`,
    tryNow: "Try now",
  },
  connected: {
    title: "Connected",
    /** `{route}` is "Tailscale" or "this Wi-Fi" ({@link sheetRouteWords}). */
    body: (computer: string, route: string) => `${computer}, through ${route}.`,
    lastUpdate: (asOf: string) => `Last update ${asOf}.`,
    computers: "Paired computers",
  },
} as const;

/**
 * `{route}` in the Connected sheet. Mid-sentence, so "this Wi-Fi" is lower case where the typed
 * route's list label says "This Wi-Fi" (decided by the team).
 */
export const sheetRouteWords = { tailscale: "Tailscale", wifi: "this Wi-Fi" } as const;

/**
 * The words of Removed (`s-m7`) and Can't confirm (`s-m9`): the `phone.removed.*`,
 * `phone.cantConfirm.*`, `phone.pairAgain` and `phone.forgetThisComputer` keys.
 */
export const standingWords = {
  removed: {
    heading: (computer: string) => `Removed from ${computer}`,
    body: "This phone can't see agents there any more. What it saved from that computer is cleared. Your agents there are not affected.",
  },
  cantConfirm: {
    heading: pairWords.cantConfirm.title,
    body: "Its identity changed since you paired, so this phone won't connect. That happens after Halonic is reinstalled or the computer is restored from a backup. If neither happened, check the computer before you pair again.",
    nothingCleared: "Nothing on this phone was cleared.",
  },
  pairAgain: "Pair again",
  forgetThisComputer: "Forget this computer",
} as const;
