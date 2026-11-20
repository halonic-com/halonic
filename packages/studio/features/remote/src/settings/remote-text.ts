/** The words of Settings › Remote, from the design "Tunnel phase B screens" (HAL-12206). */

export const DESCRIPTION =
  "See your agents, approve and send prompts from your phone. Your code stays on this computer.";

export const REACH_TITLE = "Let phones reach this computer";
export const REACH_LINE = "Off until you turn it on. Your agents keep running either way.";

export const CONNECTION_TITLE = "Connection";
export const CONNECTION_OFF_LINE = "Nothing reaches this computer";

export const RISKY_TITLE = "Let phones answer risky approvals";
export const RISKY_LINE =
  "Risky means a shell command, a file change, a secret or leaving the sandbox. Off: they wait for you here.";

export const EMPTY_TITLE = "No phones paired";
export const EMPTY_LINE_OFF =
  "Remote is off. Pair a phone to see your agents, approve and send prompts from it.";
export const EMPTY_LINE_ON = "Pair a phone to see your agents, approve and send prompts from it.";
export const EMPTY_STAYS = "Shell, files and secrets always stay on this computer.";
export const PAIR = "Pair a phone";

/** The summary line: "Off" (even with phones paired), or "On · no phone", "On · 2 phones". */
export function summary(on: boolean, phones: number): string {
  if (!on) return "Off";
  if (phones === 0) return "On · no phone";
  return `On · ${phones} ${phones === 1 ? "phone" : "phones"}`;
}

export const CHECKING = "Checking…";
export const TURN_ON_FAILED = "Couldn't turn remote on. Try again.";
export const TURN_OFF_FAILED = "Couldn't turn remote off. Try again.";
export const RISKY_FAILED = "Couldn't save the risky approvals setting. Try again.";

export const PHONES_TITLE = "Paired phones";
export const CAN = "Can: view agents, approve, send prompts";
export const CONNECTED_NOW = "Connected now";
export const REMOTE_IS_OFF = "Remote is off";
export const NOT_SEEN_YET = "Not connected yet";
export const REVOKE = "Revoke";
export const REVOKE_ALL = "Revoke all";
export const REVOKING = "Revoking…";

/** "Paired phones · 2": the list's heading. */
export const phonesHeading = (count: number): string => `${PHONES_TITLE} · ${count}`;

/** "Revoke Pixel 8?": the title of the dialog that revokes one phone. */
export const revokeTitle = (name: string): string => `Revoke ${name}?`;
export const revokeLine = (name: string): string =>
  `${name} is cut off now: its open sessions close and it can't reconnect. Your agents keep running on this computer, and anything waiting for an answer waits for you here.`;
export const REVOKE_AGAIN = "To use it again, pair it again.";
export const revokeFailed = (name: string): string => `Couldn't revoke ${name}. Try again.`;
export const revoked = (name: string): string => `${name} revoked.`;

/** "Revoke all 2 phones?": the title of the dialog that revokes every phone. */
export const revokeAllTitle = (count: number): string => `Revoke all ${count} phones?`;
export function revokeAllLine(count: number): string {
  const who =
    count === 2
      ? "Both phones are cut off now: open sessions close and neither can reconnect."
      : `All ${count} phones are cut off now: open sessions close and none can reconnect.`;
  return `${who} Your agents keep running on this computer, and anything waiting for an answer waits for you here.`;
}
export const REVOKE_ALL_AGAIN = "To use a phone again, pair it again.";
export const REVOKE_ALL_FAILED = "Couldn't revoke the phones. Try again.";
export const ALL_REVOKED = "All phones revoked.";
