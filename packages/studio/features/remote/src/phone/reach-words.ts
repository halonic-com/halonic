/**
 * The words of the phone's first reach and its Check this connection sheet (first-run-progress
 * section 6 and 9 on HAL-7986, approved by the board on 19 Nov). "{computer} isn't answering" is
 * the header label's and the banner's name for that state (C672), so the give-up uses it too.
 */
import { sheetWords } from "./status-words.ts";

/** The waiting line while the phone hasn't reached its computer yet, and its give-up. */
export const reachWords = {
  reaching: (computer: string) => `Reaching ${computer}…`,
  /** The line's reason, from 10 seconds. */
  reason: "Halonic has to be open there. This can take a moment.",
  somethingWrong: "Something wrong?",
  cantReach: {
    title: sheetWords.unreachable.title,
    /** The two likely causes, by the way the phone reaches the computer. */
    causes: {
      tailscale: "Halonic may be closed there, or Tailscale may be off on that computer.",
      wifi: "Halonic may be closed there, or your phone and that computer may not be on the same Wi-Fi.",
    },
    tryAgain: "Try again",
    check: "Check this connection",
  },
} as const;

/** The Check this connection sheet's words: what the phone can see, and nothing more. */
export const checkWords = {
  title: "Check this connection",
  intro: "Checks only what this phone can see. It changes nothing and sends nothing.",
  checking: "Checking the connection",
  noProblems: "No problems found",
  checkAgain: "Check again",
  copyReport: "Copy report",
  copied: "Copied the report.",
  notCopied: "Couldn't copy it. Open Show the report and copy it from there.",
  showReport: "Show the report",
  hideReport: "Hide the report",
  reportNote: "This is all the report holds. No names, no addresses, no keys and no agents' work.",
  notChecked:
    "Not checked here: Halonic's engine, models and sandbox. They need your computer first.",
  phone: {
    label: "Phone",
    online: { tailscale: "Online, through Tailscale", wifi: "Online, through this Wi-Fi" },
    offline: "Offline: it has no internet.",
    offlineFix: sheetWords.phoneOffline.check,
    notKnown: "Not known yet: nothing has come back so far.",
  },
  computer: {
    label: "Your computer",
    answers: (computer: string) => `${computer} answers.`,
    notAnswering: (computer: string) => `${computer} isn't answering.`,
    fix: { tailscale: sheetWords.unreachable.check, wifi: sheetWords.unreachable.checkWifi },
    untilOnline: "Not checked until your phone is online.",
    noAnswerYet: "No answer yet.",
  },
} as const;
