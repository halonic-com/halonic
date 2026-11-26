/**
 * The words of Settings → Keyboard and Settings → Feedback, from §5 of Sofia's sketch on HAL-18562.
 * The failed save follows Settings' own line ("Couldn't save … on this computer.").
 */
export const settingsWords = {
  keyboardTitle: "Keyboard",
  feedbackTitle: "Feedback",
  /** The shortcut's row in Keyboard. */
  sendFeedback: "Send feedback",
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

/** "Couldn't save "Send feedback" on this computer.", as Settings says a failed save. */
export function notSavedLine(name: string): string {
  return `Couldn't save "${name}" on this computer.`;
}

/** "3 waiting to send". */
export function waitingLine(count: number): string {
  return `${count} waiting to send`;
}
