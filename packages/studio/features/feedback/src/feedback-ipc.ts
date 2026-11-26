/**
 * The shell's commands for the feedback (`feedback_capture.rs`). Each window's capability grants
 * only its own: Studio's main, Inbox and Messenger windows `start`, `select` and `end`, the Send feedback window `crop`
 * and `end`, the not-available window `end`.
 */
export const feedbackCommands = {
  /** Takes a still of the calling window's own area; answers its `{ width, height }` in device pixels. */
  start: "plugin:feedback|start",
  /** Keeps the crop of a box of the calling window's still, in its device pixels. */
  select: "plugin:feedback|select",
  /** The Send feedback window's crop, in the still's format; refused as `gone` once dropped. */
  crop: "plugin:feedback|crop",
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
