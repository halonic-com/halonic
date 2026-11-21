/** The words of the Pair a phone dialog, from the design "Tunnel phase B screens" (HAL-12206). */
import type { PhonePlatform } from "@halonicjs/ports";
import { providerName } from "../tunnel-words.ts";

export const TITLE = "Pair a phone";
export const STARTING = "Making a code…";

export const STEP_OPEN = "On your phone, open Halonic and tap Pair with a computer.";
export const STEP_SCAN = "Scan this code.";
export const STEP_CHECK = "Check the code on both screens, then press Allow here.";

export const QR_LABEL = "QR code to pair your phone. Can't scan it? Type a code instead.";
export const TYPE_INSTEAD = "Can't scan? Type a code";
export const NEW_CODE = "New code";
export const COPY_CODE = "Copy the pairing code";
export const PAIRING_CODE = "Pairing code";

/** "On your phone, tap Type a code instead, choose Tim's laptop and enter": the typed route. */
export const typeLine = (hostName: string): string =>
  `On your phone, tap Type a code instead, choose ${hostName} and enter`;

export const SAFETY =
  "Your code stays on your computer. A paired phone can view agents, approve and send prompts. Shell, files and secrets stay here, and you can revoke a phone at any time.";

/** "Reached through Tailscale": the dialog's footnote. */
export const reachedThrough = (provider: string): string =>
  `Reached through ${providerName(provider)}`;

/** "4:32": minutes and seconds left, never below 0:00. */
export function clockOf(leftMs: number): string {
  const seconds = Math.max(0, Math.ceil(leftMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** "The code works once and ends in 4:32." The timer is text, not a ticking announcement. */
export const endsIn = (leftMs: number): string =>
  `The code works once and ends in ${clockOf(leftMs)}.`;

export const CHECK_TITLE = "Check the code";
export const CHECK_QUESTION = "Is this your phone? It shows the same code now.";
export const CHECK_CODE = "Check code";
export const CHECK_WARNING =
  "Press Allow only if your own phone shows this code. If your phone showed no code, press Don't allow: someone else may have scanned it first. Nothing is shared until you allow.";
export const ALLOW = "Allow";
export const ALLOWING = "Allowing…";
export const DONT_ALLOW = "Don't allow";

const platformNames: Record<PhonePlatform, string> = { android: "Android", ios: "iOS" };

/** "Android · reached through Tailscale": the line under the phone's name. */
export const checkPhoneLine = (platform: PhonePlatform, provider: string): string =>
  `${platformNames[platform]} · reached through ${providerName(provider)}`;

/** "Pixel 8 is paired". */
export const pairedTitle = (name: string): string => `${name} is paired`;
export const PAIRED_CAN =
  "It can view your agents, approve and send prompts. Risky approvals wait for you here.";
export const PAIRED_CAN_RISKY =
  "It can view your agents, approve (risky ones too) and send prompts.";
export const PAIRED_REVOKE = "To cut a phone off, use Revoke in Settings › Remote.";
export const DONE = "Done";

// The words the design doesn't draw are design decision 28 (HAL-13132).
export const START_FAILED = "Couldn't make a code";
/** "Couldn't pair Pixel 8. Try again.": Allow failed, like "Couldn't revoke Pixel 8" (decision 27). */
export const allowFailed = (name: string): string => `Couldn't pair ${name}. Try again.`;
/** Don't allow failed: one verb per job (decision 15), and the safe fact for a scared moment. */
export const denyFailed = (name: string): string =>
  `Don't allow didn't go through. Try again: ${name} isn't let in unless you press Allow.`;

export const NOTHING_SHARED =
  "Nothing is shared until you press Allow. Remote stays off until a phone is paired.";
export const MAKE_NEW_CODE = "Make a new code";
export const TRY_AGAIN = "Try again";
/** A tunnel problem with no action of its own re-checks the tunnel, as every other one does. */
export const CHECK_AGAIN = "Check again";

/** A pairing that ended without a phone: what happened, and the one thing to do. */
export interface EndedWords {
  readonly title: string;
  readonly line: string;
  /** The button that makes a new code, on a new pairing if this one ended. */
  readonly action: string;
}

export const RAN_OUT: EndedWords = {
  title: "The code ran out",
  line: "A code works once and for 5 minutes, and Allow waits 2 minutes after the scan. Make a new one, then scan again.",
  action: MAKE_NEW_CODE,
};

/** Shown above the new code after Don't allow. */
export const NOT_ALLOWED_TITLE = "Pairing was not allowed";
export const NOT_ALLOWED_LINE =
  "You pressed Don't allow, so nothing was shared. If your phone showed no code, someone else may have scanned it: they were not let in. Here is a new code.";

export const TOO_MANY_TRIES: EndedWords = {
  title: "Too many wrong tries",
  line: "The code was typed wrong 5 times, so it no longer works. Nothing was shared. Make a new code, then try again.",
  action: MAKE_NEW_CODE,
};
export const BUSY: EndedWords = {
  title: "Pair a phone is already open",
  line: "Only one phone can pair at a time. Close Pair a phone in the other window, then try again.",
  action: TRY_AGAIN,
};
export const REMOTE_TURNED_OFF: EndedWords = {
  title: "Remote was turned off",
  line: "The code stopped working. Make a new code to turn remote on again.",
  action: MAKE_NEW_CODE,
};
