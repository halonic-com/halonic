import { useEffect } from "react";
import { endFeedback, type FeedbackIpc } from "./feedback-ipc.ts";

/** Ends the feedback when Esc is pressed anywhere in the window, as every feedback window does. */
export function useEscapeEnds(ipc: FeedbackIpc): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") endFeedback(ipc);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ipc]);
}
