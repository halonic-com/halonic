/**
 * The shell's commands for the feedback windows (`feedback_capture.rs`). Each window's capability
 * grants only its own: an overlay `still`, `select` and `end`, the not-available window `end`.
 */
export const feedbackCommands = {
  /** The calling overlay's still: width and height as two little-endian u32s, then RGBA rows. */
  still: "plugin:feedback|still",
  /** Keeps the crop of a box of the calling overlay's still, in its device pixels. */
  select: "plugin:feedback|select",
  /** Ends the feedback: closes every feedback window and keeps nothing. */
  end: "plugin:feedback|end",
} as const;

/** The shell's IPC as the feedback windows use it; Studio's `TauriIpc` is one. */
export interface FeedbackIpc {
  /** Calls a shell command with its arguments; rejects with whatever the shell refuses with. */
  invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
}

/** Ends the feedback; a shell that can't says why in the console, since the page has nowhere else. */
export function endFeedback(ipc: FeedbackIpc): void {
  ipc.invoke(feedbackCommands.end).catch((error: unknown) => {
    console.error("The feedback didn't end:", error);
  });
}
