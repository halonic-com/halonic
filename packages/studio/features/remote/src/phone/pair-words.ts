/**
 * The words of the phone's pairing screens (`p-m1` to `p-m10`): the `phone.pair.*` keys of the
 * strings table on HAL-12233, same names in camelCase, a function where a value goes in.
 * `**Bold**` marks the name of a control or place; the screens render it semi-bold.
 */
import { triesLeftText } from "./phone-forms.ts";

export const pairWords = {
  title: "Pair with a computer",
  intro:
    "On your computer, open Halonic, go to **Settings › Remote** and choose **Pair a phone**. Then scan the code it shows.",
  safety:
    "This phone can view agents, approve and send prompts. Your code, files and secrets stay on your computer.",
  scan: "Scan code",
  typeInstead: "Type a code instead",
  cameraReason: "Halonic uses the camera only to read this code.",
  connecting: "Connecting…",
  scanner: {
    hint: "Point the camera at the code on your computer",
    notHalonic: "This isn't a Halonic pairing code.",
    close: "Close scanner",
  },
  camera: {
    title: "Halonic can't use the camera",
    body: "Allow camera access in Android settings, or type a code instead.",
    openSettings: "Open settings",
  },
  check: {
    title: "Check the code",
    question: (computer: string) => `Is this the same code as on ${computer}?`,
    hint: (computer: string) =>
      `Press **Allow** on ${computer}. Nothing is shared until you do. If the codes differ, press Cancel.`,
    waiting: (computer: string) => `Waiting for you to press Allow on ${computer}…`,
    cancel: "Cancel",
  },
  done: {
    title: "Paired",
    heading: (computer: string) => `Paired with ${computer}`,
    canLabel: "This phone can",
    can: "View agents · Approve · Send prompts",
    staysLabel: "Stays on the computer",
    stays: "Shell · Files · Secrets",
    open: "Open agents",
  },
  typed: {
    title: "Type a code",
    intro: "Choose your computer, then enter the code from its **Pair a phone** window.",
    computerLabel: "Computer",
    route: { wifi: "This Wi-Fi", pairedBefore: "Paired before" },
    nearbyReason: "Halonic uses Nearby devices only to find your computer on this Wi-Fi.",
    looking: "Looking for computers…",
    noneFound:
      "No computers found yet on this Wi-Fi. Check that the **Pair a phone** window is open on your computer, or enter its address.",
    nearbyOffAsk:
      "Computers on this Wi-Fi show here when Nearby devices is allowed. Open this screen again and choose Allow.",
    nearbyOffSettings:
      "Computers on this Wi-Fi show here when Nearby devices is allowed. In your phone's Settings, open Apps, Halonic, Permissions, Nearby devices and choose Allow.",
    notListed: "Not listed? Enter its address",
    codeLabel: "Code",
    codeHint: "12 characters, from the Pair a phone window",
    pair: "Pair",
    pairReason: "Choose a computer and enter all 12 characters.",
    wrong: (triesLeft: number) => `That code doesn't match. ${triesLeftText(triesLeft)}.`,
  },
  ended: {
    title: "This code no longer works",
    body: "A code works once and for 5 minutes, and stops after 5 wrong tries. On your computer, choose New code, then try again.",
    bodyNoAllow: (computer: string) =>
      `Allow wasn't pressed on ${computer} in time. On your computer, choose New code, then try again.`,
  },
  used: {
    title: "This code was already used",
    body: (computer: string) =>
      `Another phone used it first. If ${computer} asks you to allow a phone now, press **Don't allow**: it isn't yours.`,
    next: "Then choose New code on the computer and scan again.",
    nextTyped: "Then choose New code on the computer and type it in.",
  },
  refused: {
    title: (computer: string) => `${computer} didn't allow this phone`,
    body: "Nothing was shared. If you did mean to pair, start again from the computer.",
  },
  scanAgain: "Scan again",
  typeAgain: "Type a code again",
  unreachable: {
    title: (computer: string) => `Can't reach ${computer}`,
    body: "Check that the computer is on, Halonic is open and Tailscale is on for both. Then try again.",
    bodyWifi:
      "Check that the computer is on, Halonic is open and both are on the same Wi-Fi. Then try again.",
    tryAgain: "Try again",
    cancel: "Cancel",
  },
  rateLimited: {
    title: (computer: string) => `Too many tries on ${computer}`,
    body: "Too many codes were tried in the last minute. Wait a minute, then try again.",
  },
  cantConfirm: {
    /** `phone.cantConfirm.heading`, shared with the status sheet `s-m9`. */
    title: (computer: string) => `Can't confirm it's ${computer}`,
    body: (computer: string) =>
      `The computer that answered isn't the one that showed this code, so nothing was shared. Check that your phone is on the same network as ${computer}, then scan again.`,
  },
  /** Microcopy 28 (C599): the computer's answer can't be read. */
  unreadable: {
    title: (computer: string) => `Couldn't read ${computer}'s answer`,
    body: "Nothing was shared. Make a new code, then try again.",
  },
  /** Microcopy 28 (C599 row 10): `cant-reach` while the phone's own network is down. */
  phoneOffline: {
    /** `phone.sheet.phoneOffline.title`. */
    title: "Your phone is offline",
    body: (computer: string) =>
      `It has no internet, so it can't reach ${computer}. Turn on Wi-Fi or mobile data, then try again.`,
    bodyWifi: (computer: string) =>
      `It isn't on Wi-Fi, so it can't reach ${computer}. Connect to the same Wi-Fi as the computer, then try again.`,
  },
  /**
   * The generic problem screen, for a code or key the page got wrong (a bug, logged). Decided by
   * the team on HAL-12248 until the strings table has its own entry.
   */
  generic: {
    title: "Couldn't start pairing",
    body: "Nothing was shared. On your computer, choose New code, then try again.",
  },
} as const;
