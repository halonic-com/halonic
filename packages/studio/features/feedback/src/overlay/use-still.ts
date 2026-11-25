import { type RefObject, useEffect, useState } from "react";
import { endFeedback, type FeedbackIpc, feedbackCommands } from "../feedback-ipc.ts";
import { readStill, type StillImage } from "./still.ts";

/**
 * This overlay's still, drawn on `canvas` once the shell gave it. Without one, such as after two
 * minutes, the feedback ends: an overlay over nothing would hide the screen for no reason.
 */
export function useStill(
  ipc: FeedbackIpc,
  canvas: RefObject<HTMLCanvasElement | null>,
): StillImage | undefined {
  const [still, setStill] = useState<StillImage>();
  useEffect(() => {
    let current = true;
    ipc
      .invoke(feedbackCommands.still)
      .then((answer) => {
        if (current) setStill(readStill(answer));
      })
      .catch((error: unknown) => {
        console.error("The overlay has no still:", error);
        endFeedback(ipc);
      });
    return () => {
      current = false;
    };
  }, [ipc]);
  useEffect(() => {
    if (still !== undefined && canvas.current !== null) drawStill(canvas.current, still);
  }, [still, canvas]);
  return still;
}

/** Draws the still at its own size; the canvas's CSS stretches it over the window. */
function drawStill(canvas: HTMLCanvasElement, still: StillImage): void {
  canvas.width = still.width;
  canvas.height = still.height;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("The overlay's canvas has no 2D context.");
  const image = context.createImageData(still.width, still.height);
  image.data.set(still.rgba);
  context.putImageData(image, 0, 0);
}
