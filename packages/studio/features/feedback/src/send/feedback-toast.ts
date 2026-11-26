import type { ToastMessage } from "@halonicjs/studio-kit";
import { feedbackWords } from "../feedback-words.ts";
import type { SubmitOutcome } from "../outbox.ts";

/**
 * The toast for what pressing Send came to (`feedback.send-toasts`, sketch on HAL-18562 §3):
 * "Feedback sent" with "Open task", or "Feedback saved" with when it sends by itself. A refused
 * or full outcome has no toast in the sketch yet, so it gets `undefined` and the caller logs it.
 *
 * @param title the task's title, for the sent toast's line
 * @param openTask opens the task's page in the browser
 */
export function feedbackToast(
  outcome: SubmitOutcome,
  title: string,
  openTask: (taskUrl: string) => void,
): ToastMessage | undefined {
  if (outcome.kind === "sent") {
    return {
      tone: "success",
      title: feedbackWords.sentTitle,
      text: feedbackWords.sentLine(outcome.taskId, title),
      action: { label: feedbackWords.openTask, onClick: () => openTask(outcome.taskUrl) },
    };
  }
  if (outcome.kind === "saved") {
    return {
      tone: "info",
      title: feedbackWords.savedTitle,
      text:
        outcome.until === "online"
          ? feedbackWords.savedUntilOnline
          : feedbackWords.savedUntilConnected,
    };
  }
  return undefined;
}

/** "Feedback discarded" with "Undo", after Cancel with text typed. */
export function discardedToast(undo: () => void): ToastMessage {
  return {
    tone: "info",
    title: feedbackWords.discardedTitle,
    action: { label: feedbackWords.undo, onClick: undo },
  };
}
