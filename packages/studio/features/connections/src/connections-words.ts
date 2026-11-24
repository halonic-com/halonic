import type { MessagingSourceState } from "@halonicjs/ports";
import type { SignInRefusal } from "@halonicjs/studio-services";

// Every string the Connect dialog and Settings › Connections show. The two fixed lines come from
// HAL-17497; the rest is a first draft until Noah's screens (HAL-17498) replace it.

/** The section's name in Settings. */
export const SECTION_TITLE = "Connections";
/** The line under the section's name. */
export const SECTION_LINE = "Where Halonic reads your agents, their cards and their chats.";
/** The section with no connection yet. */
export const NONE_YET = "No connections yet.";

/** The button that opens the dialog, and the dialog's title for a new connection. */
export const CONNECT = "Connect Paperclip";
/** The button on a signed-out connection, and the dialog's title for it. Fixed (HAL-17497). */
export const SIGN_IN_AGAIN = "Sign in again";

/** What a board key can do, under every connection. Fixed (HAL-17497). */
export const KEY_POWER = "This key can do everything the board can in Paperclip";
/** The section when the engine couldn't list the connections. */
export const LIST_FAILED =
  "Halonic couldn't read the connections. Close Settings and open it again.";
/** After closing the dialog, when the engine couldn't cancel its sign-in. */
export const CANCEL_FAILED =
  "Halonic couldn't cancel the sign-in. Don't approve it in Paperclip: it ends by itself within 10 minutes.";
/** "Halonic couldn't disconnect Paperclip · Halonic. Try again." */
export const disconnectFailed = (label: string): string =>
  `Halonic couldn't disconnect ${label}. Try again.`;

/** The row's button. */
export const DISCONNECT = "Disconnect";
/** The row's button while it runs. */
export const DISCONNECTING = "Disconnecting…";

/** The address field. */
export const ADDRESS_LABEL = "Paperclip address";
/** Under the address field. */
export const ADDRESS_HINT = "The address you open Paperclip at in your browser.";
/** The address field's example. */
export const ADDRESS_PLACEHOLDER = "https://paperclip.example.com";
/** An address that isn't a web address. */
export const ADDRESS_INVALID = "Enter a web address that starts with https://.";
/** The confirming button of the address step, and while it runs. */
export const START = "Connect";
export const STARTING = "Starting sign-in…";

/** The waiting step's lines. */
export const PHRASE_LINE = "Approve the sign-in in Paperclip only if it shows these words:";
export const OPEN_APPROVAL = "Open the approval page";
export const CANCEL = "Cancel";

/** "9:59": minutes and seconds left, never below 0:00. */
export function clockOf(leftMs: number): string {
  const seconds = Math.max(0, Math.ceil(leftMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** "Time left to approve: 9:59". A timer read as text, not a ticking announcement. */
export const timeLeft = (leftMs: number): string => `Time left to approve: ${clockOf(leftMs)}`;

/** The ending steps. */
export const EXPIRED_TITLE = "The sign-in ended";
export const EXPIRED_LINE = "Nobody approved it within 10 minutes. Start again for new words.";
export const CANCELLED_TITLE = "The sign-in was cancelled";
export const CANCELLED_LINE = "Start again to sign in.";
export const START_AGAIN = "Start again";
export const DONE = "Done";
export const START_FAILED = "Halonic couldn't start the sign-in. Try again.";

/** "Connected to Paperclip · Halonic." */
export const connectedTo = (label: string): string => `Connected to ${label}.`;

/** Why a sign-in was refused, in a title and a line. */
export const refusals: Record<SignInRefusal, { readonly title: string; readonly line: string }> = {
  "address-not-allowed": {
    title: "Halonic can't sign in at this address",
    line: "Use the address you open Paperclip at in your browser.",
  },
  unreachable: {
    title: "Paperclip didn't answer",
    line: "Check the address and your connection, then start again.",
  },
  "other-company": {
    title: "That account isn't in this company",
    line: "Approve with an account of the company this connection is for.",
  },
};

/** A connection's state in a word or two: "Connected", "Offline, as of 14:02", "Signed out". */
export function stateWords(state: MessagingSourceState): string {
  switch (state.kind) {
    case "online":
      return "Connected";
    case "offline":
      return `Offline, as of ${timeOfDay(state.asOf)}`;
    case "signed-out":
      return "Signed out";
  }
}

/** What the section says after Disconnect: the revoke worked, or the key stays valid a while. */
export function disconnectedLine(
  label: string,
  result: { readonly revoked: true } | { readonly revoked: false; readonly validUntil: string },
): string {
  if (result.revoked) return `Disconnected ${label}. Paperclip has revoked its key.`;
  return `Disconnected ${label}. Its key stays valid until ${day(result.validUntil)}; you can revoke it in Paperclip.`;
}

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "14:02" in the computer's time zone. */
function timeOfDay(iso: string): string {
  const at = new Date(iso);
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

/** "24 Dec 2026" in the computer's time zone. */
function day(iso: string): string {
  const at = new Date(iso);
  return `${at.getDate()} ${months[at.getMonth()]} ${at.getFullYear()}`;
}
