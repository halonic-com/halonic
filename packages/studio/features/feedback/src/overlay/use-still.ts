import { type RefObject, useEffect, useState } from "react";
import { endFeedback, type FeedbackIpc, feedbackCommands } from "../feedback-ipc.ts";
import { readStill, type StillImage } from "./still.ts";

/**
 * This overlay's still, or with `command` set to `crop` the Send feedback window's crop, drawn on
 * `canvas` once the shell gave it. Without one, such as after two minutes, or a canvas that can't
 * draw, the feedback ends: a window over nothing would hide the screen for no reason.
 */
export function useStill(
  ipc: FeedbackIpc,
  canvas: RefObject<HTMLCanvasElement | null>,
  command: typeof feedbackCommands.still | typeof feedbackCommands.crop = feedbackCommands.still,
): StillImage | undefined {
  const [still, setStill] = useState<StillImage>();
  useEffect(() => {
    let current = true;
    ipc
      .invoke(command)
      .then((answer) => {
        if (current) setStill(readStill(answer));
      })
      .catch((error: unknown) => {
        console.error("The window has no picture:", error);
        endFeedback(ipc);
      });
    return () => {
      current = false;
    };
  }, [ipc, command]);
  useEffect(() => {
    if (still === undefined || canvas.current === null) return;
    try {
      drawStill(canvas.current, still);
    } catch (error) {
      console.error("The picture wasn't drawn:", error);
      endFeedback(ipc);
    }
  }, [still, canvas, ipc]);
  return still;
}

/** Draws the still at its own size; the canvas's CSS stretches it over the window. */
function drawStill(canvas: HTMLCanvasElement, still: StillImage): void {
  canvas.width = still.width;
  canvas.height = still.height;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("The canvas has no 2D context.");
  const image = context.createImageData(still.width, still.height);
  image.data.set(still.rgba);
  context.putImageData(image, 0, 0);
}
