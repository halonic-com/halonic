import { day, type Ending, timeOfDay } from "./connections-words.ts";

// Every string the Messaging engine row and the Pair with a server dialog show: Sofia's flow on
// HAL-18622, with Mara's five replacements from her copy check on HAL-18641. Strings Sofia marked
// "copy" come from `connections-words.ts`. The ones marked HAL-18747 are new in S8b.

/** The row: its label, its two options and the line under it. */
export const ENGINE_LABEL = "Messaging engine";
export const THIS_COMPUTER = "This computer";
export const SERVER = "Server";
export const ENGINE_LINE =
  "Where this workspace reaches Paperclip. Saved on this computer, not in the workspace's files.";
/** The Server option's note when the host has no keychain (HAL-18747). */
export const KEYCHAIN_NEEDED =
  "Needs this computer's keychain, which Halonic can't use in this window.";

/** The row's meta line once paired: "Checked 14:02 · pairing ends 23 Feb 2027". */
export const connectedMeta = (checkedAt: string, endsAt: string): string =>
  `Checked ${timeOfDay(checkedAt)} · pairing ends ${day(endsAt)}`;
/** The server's offline callout (Sofia's flow, HAL-18622): Connect's, with "The server" for "Paperclip". */
export const SERVER_OFFLINE_CALLOUT =
  "The server isn't answering. Inbox and Messenger show what was read last; answering is off until it's back.";
/** The row's meta line while signed out. */
export const SIGNED_OUT_META = "pairing expired or removed";
export const signedOutCallout = (host: string): string =>
  `This computer's pairing with ${host} has ended. Pair again to keep reading and answering. Until then, Inbox and Messenger show what was read last.`;
export const KEYCHAIN_UNREADABLE =
  "Halonic couldn't read this computer's pairing from the keychain. Unlock it and reopen Settings, or pair again.";
/** The callout's button, and the dialog's title from it. */
export const PAIR_AGAIN = "Pair again";

/** The dialog: P1. */
export const PAIR_TITLE = "Pair with a server";
export const PAIR_LEAD =
  "On the server, run `halonic serve pair`. It shows the server's address and a pairing code.";
export const SERVER_ADDRESS_LABEL = "Server address";
export const SERVER_ADDRESS_HINT = "The address `halonic serve pair` shows.";
export const SERVER_ADDRESS_PLACEHOLDER = "https://halonic.example.com";
export const CODE_LABEL = "Pairing code";
export const CODE_HINT = "8 letters and digits. Case, spaces and dashes don't matter.";
export const CODE_PLACEHOLDER = "7KQ2 M9XF";
export const NAME_LABEL = "This computer's name";
export const NAME_HINT = "The server shows this name next to Allow and in its device list.";
/** The name filled in when Halonic doesn't know the computer's own (HAL-18747). */
export const NAME_FALLBACK = "Halonic Studio";
export const STARTING_PAIRING = "Starting pairing…";
export const CODE_FORMAT = "A pairing code is 8 letters and digits, like 7KQ2 M9XF.";
export const SERVER_UNREACHABLE =
  "Halonic couldn't reach a server at this address. Check it and try again.";
export const NOT_HALONIC =
  "This address didn't answer like a Halonic server. Use the address `halonic serve pair` shows.";
export const CODE_REFUSED =
  "This code didn't work. It may be mistyped, used already or older than 10 minutes. Run `halonic serve pair` for a new one.";
/** "Too many wrong codes. Try again in 5 minutes.", or "in a few minutes" without a time. */
export const tooManyCodes = (minutes: number | undefined): string =>
  `Too many wrong codes. Try again in ${minutes === undefined ? "a few minutes" : `${minutes} ${minutes === 1 ? "minute" : "minutes"}`}.`;
export const PAIR_START_FAILED = "Halonic couldn't start the pairing. Try again.";

/** Cloudflare Access service token fields (HAL-19107), in the pairing dialog and the row's update dialog. */
export const ACCESS_ID_LABEL = "Access client ID";
export const ACCESS_SECRET_LABEL = "Access client secret";
export const ACCESS_HINT =
  "Only if the server sits behind Cloudflare Access. Leave both empty otherwise.";
export const ACCESS_BOTH = "Fill in both, or leave both empty.";
/** The access check refused this computer, in the dialog's alert or the row's callout. */
export const ACCESS_REFUSED =
  "The server's access check refused this computer. Check the Access client ID and secret.";
export const UPDATE_ACCESS = "Update access";
export const UPDATE_ACCESS_TITLE = "Update the Access client ID and secret";
export const UPDATE_ACCESS_LEAD =
  "Paste the new values after rotating the service token at Cloudflare. Leave both empty to stop sending them. They are kept in this computer's keychain.";
export const SAVE = "Save";
export const SAVING = "Saving…";
export const ACCESS_SAVED = "Saved the Access client ID and secret.";
export const ACCESS_CLEARED = "Halonic no longer sends an Access client ID and secret.";
export const ACCESS_NOT_SAVED =
  "Halonic couldn't save them: this computer's keychain didn't take them. Try again.";

/** The dialog: P2. */
export const CHECK_LEAD =
  "On the server, allow this computer only if it shows the same check code:";
export const CHECK_CODE_LABEL = "Check code";
export const WAITING_FOR_ALLOW = "Waiting for Allow on the server…";
export const STILL_TRYING = "Can't reach the server. Still trying…";
/** The note under the countdown, as three sentences: the first names the computer. */
export const waitNote = (name: string): readonly [string, string, string] => [
  "The server sees this computer as ",
  name,
  ". The pairing is kept in this computer's keychain. The Paperclip key stays on the server.",
];
export const CANCEL = "Cancel";

/** What a screen reader hears once paired and the dialog closed by itself. */
export const pairedLine = (host: string): string =>
  `Paired with ${host}. Inbox and Messenger now read from the server.`;

/** The endings E1–E5. */
export const PAIR_EXPIRED: Ending = {
  heading: "The pairing code expired",
  text: "It wasn't allowed within 10 minutes, so nothing changed. Run `halonic serve pair` on the server for a new code, then start again.",
};
export const PAIR_REFUSED: Ending = {
  heading: "The server didn't allow this computer",
  text: "Nothing changed. If the check codes matched, ask the server's owner to pair it again with a new code.",
};
export const PAIR_TAKEN_OVER: Ending = {
  heading: "Another request used this code",
  text: "The server cancelled this pairing because a second request used the same code. Nothing changed. If that wasn't you, tell the server's owner. Start again with a new code.",
};
export const PAIR_NOT_SAVED: Ending = {
  heading: "Halonic couldn't save the pairing",
  text: "This computer's keychain didn't take it, so Halonic ended the pairing on the server and kept nothing. Start again.",
};
export const pairNotSavedStillOn = (name: string): Ending => ({
  heading: "Halonic couldn't save the pairing",
  text: `This computer's keychain didn't take it, and Halonic couldn't reach the server to end the pairing. Remove ${name} with \`halonic serve devices\` on the server, then start again.`,
});
export const pairLost = (name: string): Ending => ({
  heading: "The pairing didn't finish",
  text: `The server stopped answering for this request, so nothing changed here. If \`halonic serve devices\` lists ${name}, remove it there, then start again.`,
});

/** After Cancel, when the server couldn't be told. */
export const PAIR_CANCEL_FAILED =
  "Halonic couldn't cancel the pairing. Don't allow it on the server: it ends by itself within 10 minutes.";

/** Switching back to This computer. */
export const SWITCH_BACK_TITLE = "Use this computer for messaging?";
/** The host is between backticks, so the dialog shows it in mono, as the row does. */
export const switchBackText = (host: string): string =>
  `Halonic ends this computer's pairing with \`${host}\` and deletes it from the keychain. Inbox and Messenger then use the Paperclip connection on this computer. If there is none, connect Paperclip below. To use the server again, you need a new pairing code.`;
export const USE_THIS_COMPUTER = "Use this computer";
export const SWITCHING = "Switching…";
export const switchedBack = (host: string): string =>
  `Switched to this computer. The pairing with ${host} has ended.`;
export const switchedStillValid = (host: string, name: string): Ending => ({
  heading: "Switched to this computer. The pairing is still valid on the server.",
  text: `Halonic deleted it from this computer but couldn't reach ${host} to end it. Remove ${name} with \`halonic serve devices\`, or it ends by itself after 30 days unused.`,
});
/** The keychain kept its entry: the setting is This computer all the same (HAL-18747). */
export const SWITCHED_KEYCHAIN_KEPT: Ending = {
  heading: "Switched, but the keychain still holds the pairing.",
  text: "Halonic couldn't delete it from this computer's keychain. Unlock the keychain and remove the entry whose name starts with `server-pairing`.",
};
/** The host couldn't be asked at all: nothing changed (HAL-18747). */
export const SWITCH_FAILED = "Halonic couldn't switch to this computer. Try again.";
