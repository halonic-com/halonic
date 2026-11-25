import type { MessagingSourceState } from "@halonicjs/ports";

// Every string the Connect dialog and Settings › Connections show, from Noah's wording table on
// HAL-17498. "This key can do everything the board can in Paperclip", "Sign in again" and
// "Offline, as of <HH:MM>" were fixed before it (HAL-17497).

/** The section's name in Settings. */
export const SECTION_TITLE = "Connections";
/** The line under the section's name. */
export const SECTION_LINE =
  "Where this workspace reads agents, cards and chats from. Nothing from them is saved in the workspace; Halonic keeps a small cache on this computer.";
/** The section with no connection yet. */
export const NONE_TITLE = "No connections";
export const NONE_LINE =
  "Connect Paperclip to answer your agents' cards and chat with them from Inbox and Messenger.";

/** The button that opens the dialog, and the dialog's title for a new connection. */
export const CONNECT = "Connect Paperclip";
/** The button on a signed-out connection, and the dialog's title for it. Fixed (HAL-17497). */
export const SIGN_IN_AGAIN = "Sign in again";

/** The button on a connected Paperclip, and the dialog's title for another account on it (HAL-18670). */
export const ADD_ACCOUNT = "Add another account";

/** What a board key can do, under every connection. Fixed (HAL-17497). */
export const KEY_POWER = "This key can do everything the board can in Paperclip";
/** The section when the engine couldn't list the connections. */
export const LIST_FAILED =
  "Halonic couldn't read the connections. Close Settings and open it again.";
/** The button under {@link LIST_FAILED} that reads the connections again. */
export const TRY_AGAIN = "Try again";
/** After closing the dialog, when the engine couldn't cancel its sign-in. */
export const CANCEL_FAILED =
  "Halonic couldn't cancel the sign-in. Don't approve it in Paperclip: it ends by itself within 10 minutes.";
/** "Couldn't disconnect Paperclip · Halonic. Try again." */
export const disconnectFailed = (label: string): string =>
  `Couldn't disconnect ${label}. Try again.`;

/** The address step for a new connection, above the field. */
export const CONNECT_LEAD =
  "Answer your agents' cards and chat with them from Halonic Inbox and Messenger. Everything stays in Paperclip; Halonic reads it live.";
/** The address step for another account on a connected Paperclip, above the field. */
export const ADD_ACCOUNT_LEAD =
  "Connect another account on this Paperclip. Approve the sign-in in a browser where you're signed in to Paperclip as that account.";
/** The address step when signing in again, above the field. */
export const signInAgainLead = (label: string): string =>
  `The key for ${label} has expired or was revoked. Sign in again to keep reading and answering.`;
/** The address field. */
export const ADDRESS_LABEL = "Paperclip address";
/** Under the address field. */
export const ADDRESS_HINT = "The address you open Paperclip at in your browser.";
/** The address field's example. */
export const ADDRESS_PLACEHOLDER = "https://paperclip.example.com";
/** An address that isn't https, nor plain http on this computer. */
export const ADDRESS_HTTPS_ONLY =
  "Use an https address. Plain http works only for this computer (localhost).";
/** Nothing answered at the address. */
export const ADDRESS_UNREACHABLE =
  "Halonic couldn't reach Paperclip at this address. Check it and try again.";
/** The engine may not sign in there, or what answered isn't Paperclip. */
export const ADDRESS_NOT_PAPERCLIP =
  "This address didn't answer like Paperclip. Use the address you open Paperclip at in your browser.";
/** The address step's confirming button, and while it runs. */
export const CONTINUE = "Continue";
export const STARTING = "Starting sign-in…";
/** The engine couldn't be asked at all. */
export const START_FAILED = "Halonic couldn't start the sign-in. Try again.";

/** The waiting step. */
export const WORDS_LEAD = "Open the approval page. Approve only if Paperclip shows these words:";
export const WORDS_LABEL = "Sign-in words";
export const WAITING = "Waiting for you to approve in Paperclip…";
export const KEY_NOTE =
  "The key Halonic gets can do everything the board can in Paperclip. It is kept in this computer's keychain.";
export const OPEN_APPROVAL = "Open the approval page";

/** "9:42 left": minutes and seconds, never below 0:00. */
export function timeLeft(leftMs: number): string {
  const seconds = Math.max(0, Math.ceil(leftMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} left`;
}

/** The ending steps' buttons. */
export const CLOSE = "Close";
export const START_AGAIN = "Start again";

/** Why a sign-in ended without connecting, in a heading and a text. */
export interface Ending {
  readonly heading: string;
  readonly text: string;
}

export const EXPIRED: Ending = {
  heading: "The sign-in expired",
  text: "It wasn't approved within 10 minutes, so nothing was connected. Start again to get new words.",
};
export const CANCELLED: Ending = {
  heading: "The sign-in was cancelled in Paperclip",
  text: "Nothing was connected. If you didn't cancel it yourself, start again and check the words before you approve.",
};
/** The board approved, but the keychain didn't take the key; Halonic revoked it (HAL-17439). */
export const KEY_NOT_SAVED: Ending = {
  heading: "Halonic couldn't save the key",
  text: "This computer's keychain didn't take it, so Halonic revoked the key and kept nothing. Start again.",
};
/** The approver isn't in the connection's company; "this company" when the engine didn't say. */
export function companyMismatch(company: string | undefined): Ending {
  const name = company ?? "this company";
  return {
    heading: `This account isn't in ${name}`,
    text: `The account that approved isn't a member of ${name} in Paperclip, so Halonic revoked the key and kept nothing. Start again and approve with an account in ${name}.`,
  };
}

/** The row's parts. */
export const READ_ONLY = "Read-only";
export const DISCONNECT = "Disconnect";
export const DISCONNECTING = "Disconnecting…";
export const OFFLINE_CALLOUT =
  "Paperclip isn't answering. Inbox and Messenger show what was read last; answering is off until it's back.";
export const SIGNED_OUT_CALLOUT =
  "Sign in again to keep reading and answering. Until then, Inbox and Messenger show what was read last.";

/** A connection's state chip. */
export const stateChips: Record<MessagingSourceState["kind"], string> = {
  online: "Connected",
  offline: "Offline",
  "signed-out": "Signed out",
};

/** What follows the host on the address line: "Checked 14:02 · key expires 24 Dec 2026". */
export function stateMeta(state: MessagingSourceState, keyExpiresAt: string | undefined): string {
  switch (state.kind) {
    case "online": {
      const checked = `Checked ${timeOfDay(state.asOf)}`;
      return keyExpiresAt === undefined ? checked : `${checked} · key expires ${day(keyExpiresAt)}`;
    }
    case "offline":
      return `Offline, as of ${timeOfDay(state.asOf)}`;
    case "signed-out":
      return "key expired or revoked";
  }
}

/** The Disconnect confirmation. */
export const disconnectTitle = (label: string): string => `Disconnect ${label}?`;
export const DISCONNECT_TEXT =
  "Halonic revokes its key in Paperclip and deletes the key and the cache from this computer. Your cards, tasks and chats stay in Paperclip.";

/** What a screen reader hears once a sign-in connected and the dialog closed by itself. */
export const connectedLine = (label: string): string => `Connected ${label}.`;

/** After Disconnect, when Paperclip revoked the key. */
export const disconnectedRevoked = (label: string): string =>
  `Disconnected ${label}. Its key is revoked in Paperclip and deleted from this computer.`;
/** After Disconnect, when the revoke failed: a bold first sentence, then the rest. */
export function disconnectedStillValid(label: string, validUntil: string): Ending {
  return {
    heading: `Disconnected ${label}, but its key is still valid.`,
    text: `Halonic deleted the key and the cache from this computer but couldn't reach Paperclip to revoke it. The key stays valid until ${day(validUntil)}; revoke it in Paperclip to end it sooner.`,
  };
}
export const OPEN_PAPERCLIP = "Open Paperclip";

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

/** The account switcher at the sidebar's bottom left (HAL-18672): its name, its menu's lead and its rows. */
export const accountSwitcherWords = {
  /** The trigger's accessible name: the initials alone don't say what it opens. */
  trigger: (name: string) => `Account: ${name}`,
  /** The menu's quiet first row. */
  lead: "Show Inbox and Messenger for",
  /** After the account the Inbox and Messenger show now. */
  active: "Showing now",
  /** The row that opens Settings › Connections. */
  settings: "Settings › Connections",
} as const;
