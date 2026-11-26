import { Button } from "@halonicjs/studio-kit";
import { endFeedback, type FeedbackIpc } from "../feedback-ipc.ts";
import { feedbackWords } from "../feedback-words.ts";
import { useEscapeEnds } from "../use-escape-ends.ts";

/** Props for {@link CaptureUnavailable}. */
export interface CaptureUnavailableProps {
  /** The shell, to close the window. */
  readonly ipc: FeedbackIpc;
}

/**
 * The small window a press opens where no still can be taken yet, such as macOS or Linux on
 * Wayland (`feedback.unavailable`): it says so, and "Not now" or Esc closes it. "Send without a
 * screenshot" joins it with the Send feedback window (HAL-18563 PR C2).
 */
export function CaptureUnavailable({ ipc }: CaptureUnavailableProps) {
  useEscapeEnds(ipc);
  return (
    <div className="fixed inset-0 flex flex-col justify-between gap-4 bg-app-panel p-6 text-fg">
      <p className="text-body">{feedbackWords.unavailable}</p>
      <div className="flex justify-end">
        <Button variant="secondary" onClick={() => endFeedback(ipc)}>
          {feedbackWords.notNow}
        </Button>
      </div>
    </div>
  );
}
