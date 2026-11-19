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
