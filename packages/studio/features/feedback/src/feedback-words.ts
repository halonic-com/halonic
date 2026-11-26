/**
 * The words the feedback feature shows, as Sofia's sketch gives them
 * (HAL-18562, decided with the team under the board's go-ahead on HAL-10).
 */
export const feedbackWords = {
  /** The overlay's hint, before the Enter key. */
  dragHint: "Drag to select an area",
  /** The overlay's hint, after the Enter key (Sofia, HAL-19017). */
  enterHint: "for the whole window",
  /** The overlay's hint, after the Esc key. */
  escHint: "to cancel",
  /**
   * Where no still can be taken yet, such as macOS or Linux on Wayland. The one string no
   * sketch had; Sofia checks it on HAL-18970.
   */
  unavailable: "Studio can't take a screenshot for feedback on this system.",
  /** Closes the not-available window. */
  notNow: "Not now",
  /** Under the text field when Send is pressed with nothing written. */
  emptyText: "Write a line about what you saw.",
  /** The Send feedback window's title, and its two buttons. */
  sendTitle: "Send feedback",
  cancel: "Cancel",
  send: "Send",
  placeholder: "What did you notice? The first line becomes the title.",
  /** The text field's name for screen readers: the placeholder's question (design check, HAL-19208). */
  textLabel: "What did you notice?",
  /** Under the text field: where the task goes and what it carries. */
  footnote: (project: string, assignee: string) =>
    `Goes to ${project} as a task in Paperclip for ${assignee}, with the time and Studio version.`,
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
  /**
   * The Send feedback window's fallback states (Noah's design on HAL-19384, words approved with
   * Sofia's changes on HAL-19391). In the crop box when the crop couldn't be loaded:
   */
  cropFailed: "Couldn't load the screenshot.",
  selectAgain: "Select again",
  sendWithoutScreenshot: "Send without a screenshot",
  /** Above the footnote before Send, when Send would save the feedback to send later. */
  offlineTitle: "Studio is offline",
  offlineText:
    "Send saves your feedback on this computer and sends it automatically once Studio is back online.",
  notConnectedTitle: "Studio isn't connected to Paperclip",
  notConnectedText:
    "Send saves your feedback on this computer and sends it automatically once Studio is connected to Paperclip.",
  /** Above the footnote when Paperclip refused the feedback; `reason` has no full stop at its end. */
  refusedTitle: "Couldn't send your feedback",
  refusedText: (reason: string) =>
    `Paperclip said: ${reason}. Your text and screenshot are still here.`,
  tryAgain: "Try again",
  /** Above the footnote when the crop couldn't be made into a PNG. */
  noPngTitle: "Couldn't prepare the screenshot",
  noPngText: "Your text is still here.",
} as const;
