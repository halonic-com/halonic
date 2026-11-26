/**
 * The words of Settings → Keyboard and Settings → Feedback, from §5 of Sofia's sketch on HAL-18562,
 * and Quick ask's row from section 7 of the HAL-18594 design.
 * The failed save follows Settings' own line ("Couldn't save … on this computer.").
 */
export const settingsWords = {
  keyboardTitle: "Keyboard",
  feedbackTitle: "Feedback",
  /** The shortcut's row in Keyboard. */
  sendFeedback: "Send feedback",
  /** Quick ask's row in Keyboard (design HAL-18594, section 7). */
  quickAsk: "Quick ask",
  /** Under Quick ask's row where the desktop lets no app take a key, before the command. */
  waylandLine:
    "Your desktop doesn't let apps add a shortcut. Add one in your desktop's settings that runs:",
  /** The command a desktop shortcut runs to open the box. */
  askCommand: "halonic-studio --app ask",
  change: "Change",
  /** The row while it records a shortcut. */
  recording: "Press the new shortcut",
  /** After the Esc key while recording. */
  escToStop: "to stop",
  project: "Project",
  assignTo: "Assign to",
} as const;

/** "Ctrl+Alt+K is taken by another app. Choose another." */
export function takenLine(shortcut: string): string {
  return `${shortcut} is taken by another app. Choose another.`;
}

/** "Ctrl+Alt+Space is taken by another app. Pick another key.", Quick ask's words (HAL-18594 §7). */
export function askKeysTakenLine(shortcut: string): string {
  return `${shortcut} is taken by another app. Pick another key.`;
}

/**
 * Help's and Ctrl K's entry for the box: "Quick ask (Ctrl+Alt+Space)", and plain "Quick ask" while
 * its keys don't work, so it never names keys that do nothing (HAL-19400).
 */
export function quickAskEntry(keys: string | undefined): string {
  return keys === undefined ? settingsWords.quickAsk : `${settingsWords.quickAsk} (${keys})`;
}

/** "Couldn't save "Send feedback" on this computer.", as Settings says a failed save. */
export function notSavedLine(name: string): string {
  return `Couldn't save "${name}" on this computer.`;
}

/** "3 waiting to send". */
export function waitingLine(count: number): string {
  return `${count} waiting to send`;
}
