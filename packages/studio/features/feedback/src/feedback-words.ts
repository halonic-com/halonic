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
} as const;
