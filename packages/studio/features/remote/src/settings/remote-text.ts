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
