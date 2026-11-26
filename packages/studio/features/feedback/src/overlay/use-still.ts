import { type RefObject, useEffect, useState } from "react";
import { type FeedbackIpc, feedbackCommands } from "../feedback-ipc.ts";
import { readStill, type StillImage } from "./still.ts";

/** Where the window's crop is: on its way, drawn, or not to be had. */
export type StillState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly still: StillImage }
  | { readonly kind: "failed" };

/**
 * The Send feedback window's crop, drawn on `canvas` once the shell gave it. Without one, such as
 * after two minutes, or on a canvas that can't draw, it is `failed`: the window then says so and
 * offers to send the text alone, so nothing typed is lost (Noah's design on HAL-19384).
 */
export function useStill(
  ipc: FeedbackIpc,
  canvas: RefObject<HTMLCanvasElement | null>,
  command: typeof feedbackCommands.crop = feedbackCommands.crop,
): StillState {
  const [state, setState] = useState<StillState>({ kind: "loading" });
  useEffect(() => {
    let current = true;
    ipc
      .invoke(command)
      .then((answer) => {
        if (current) setState({ kind: "ready", still: readStill(answer) });
      })
      .catch((error: unknown) => {
        console.error("The window has no picture:", error);
        if (current) setState({ kind: "failed" });
      });
    return () => {
      current = false;
    };
  }, [ipc, command]);
  useEffect(() => {
    if (state.kind !== "ready" || canvas.current === null) return;
    try {
      drawStill(canvas.current, state.still);
    } catch (error) {
      console.error("The picture wasn't drawn:", error);
      setState({ kind: "failed" });
    }
  }, [state, canvas]);
  return state;
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
