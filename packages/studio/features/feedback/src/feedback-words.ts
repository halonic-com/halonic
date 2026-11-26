/**
 * The words the feedback feature shows, as Sofia's sketch gives them
 * (HAL-18562, decided with the team under the board's go-ahead on HAL-10).
 */
export const feedbackWords = {
  /** The overlay's hint, before the Esc key. */
  dragHint: "Drag to select an area",
  /** The overlay's hint, after the Esc key. */
  escHint: "to cancel",
  /**
   * Where no still can be taken yet, such as macOS or Linux on Wayland. The one string no
   * sketch had; Sofia checks it on HAL-18970.
   */
  unavailable: "Studio can't take a screenshot for feedback on this system yet.",
  /** Closes the not-available window. */
  notNow: "Not now",
  /** Under the text field when Send is pressed with nothing written. */
  emptyText: "Write a line about what you saw.",
  /** The Send feedback window's title, and its two buttons. */
  sendTitle: "Send feedback",
  cancel: "Cancel",
  send: "Send",
  placeholder: "What did you notice? The first line becomes the title.",
  /** Under the text field: where the task goes and what it carries. */
  footnote: (project: string, assignee: string) =>
    `Goes to ${project} as a task for ${assignee}, with the app, window, time and Studio version.`,
  /** After the Ctrl Enter (⌘ ↩) keys at the footnote's right. */
  sendKeyHint: "send",
  /** The toasts after Send, from the sketch's §3. */
  sentTitle: "Feedback sent",
  sentLine: (taskId: string, title: string) => `${taskId} · ${title}`,
  openTask: "Open task",
  savedTitle: "Feedback saved",
  savedUntilOnline: "It sends by itself once Studio is back online.",
  savedUntilConnected: "It sends by itself once Studio is connected to Paperclip.",
  discardedTitle: "Feedback discarded",
  undo: "Undo",
} as const;
