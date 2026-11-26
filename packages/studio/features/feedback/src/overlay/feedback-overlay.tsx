import { type PointerEvent, useEffect, useRef, useState } from "react";
import { type Point, type Rect, type Screen, selectionBox } from "../crop.ts";
import { endFeedback, type FeedbackIpc, feedbackCommands } from "../feedback-ipc.ts";
import { feedbackWords } from "../feedback-words.ts";
import { useEscapeEnds } from "../use-escape-ends.ts";
import { type Drag, overlayScreen, releasedArea } from "./drag.ts";
import { boxEdge, dim, keyEdge, overlayBackground, pill } from "./overlay-colours.ts";
import { SizeLabel } from "./size-label.tsx";
import { useStill } from "./use-still.ts";

/** Props for {@link FeedbackOverlay}. */
export interface FeedbackOverlayProps {
  /** The shell, for this overlay's still and the box the person drew. */
  readonly ipc: FeedbackIpc;
}

/**
 * One screen's selection overlay (`feedback.overlay`, sketch on HAL-18562 §1): the still of that
 * screen, dimmed, under a crosshair, with the hint at the top. Dragging draws a box at full
 * brightness with its size in device pixels; letting go of a box of 8 × 8 or more hands it to the
 * shell, which closes the overlays. A click or a smaller box does nothing, and Esc ends the
 * feedback.
 */
export function FeedbackOverlay({ ipc }: FeedbackOverlayProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const still = useStill(ipc, canvas);
  const [drag, setDrag] = useState<Drag>();
  const [pointerHere, setPointerHere] = useState(true);
  const viewport = useViewport();
  useEscapeEnds(ipc);

  const screen = still === undefined ? undefined : overlayScreen(still, viewport);
  const selection =
    screen === undefined || drag === undefined
      ? undefined
      : { screen, box: selectionBox(screen, drag.start, drag.current) };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || screen === undefined) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = pointOf(event);
    setDrag({ start: point, current: point });
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag !== undefined) setDrag({ start: drag.start, current: pointOf(event) });
  };
  const onPointerUp = () => {
    setDrag(undefined);
    if (selection === undefined) return;
    const area = releasedArea(selection.screen, selection.box);
    if (area === undefined) return;
    ipc.invoke(feedbackCommands.select, { area }).catch((error: unknown) => {
      console.error("The box wasn't selected:", error);
      endFeedback(ipc);
    });
  };

  return (
    <div
      className="fixed inset-0 cursor-crosshair select-none overflow-hidden"
      style={overlayBackground}
      data-feedback-overlay=""
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(undefined)}
      onPointerEnter={() => setPointerHere(true)}
      onPointerLeave={() => setPointerHere(false)}
    >
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      {selection === undefined ? (
        <div
          className="absolute inset-0 transition-opacity ease-(--ease-enter) starting:opacity-0"
          style={{ background: dim }}
        />
      ) : (
        <SelectionBox screen={selection.screen} box={selection.box} />
      )}
      {drag === undefined && pointerHere ? <Hint /> : null}
    </div>
  );
}

/** The box at full brightness: everything around it dimmed, a white edge and a dark one outside it. */
function SelectionBox({ screen, box }: { readonly screen: Screen; readonly box: Rect }) {
  return (
    <>
      <div
        className="absolute border"
        data-feedback-box=""
        style={{
          borderColor: boxEdge,
          left: box.x,
          top: box.y,
          width: box.width,
          height: box.height,
          boxShadow: `0 0 0 2px rgb(0 0 0 / 0.35), 0 0 0 100vmax ${dim}`,
        }}
      />
      <SizeLabel screen={screen} box={box} />
    </>
  );
}

/** "Drag to select an area · Esc to cancel", in a dark pill at the top centre of the screen. */
function Hint() {
  return (
    <p
      className="absolute top-6 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1.5 text-body transition-[opacity,translate] duration-(--duration-base) ease-(--ease-enter) starting:-translate-y-2 starting:opacity-0"
      style={pill}
    >
      <span>{feedbackWords.dragHint}</span>
      <span aria-hidden="true">·</span>
      <kbd className="rounded border px-1 font-mono text-caption" style={keyEdge}>
        Esc
      </kbd>
      <span>{feedbackWords.escHint}</span>
    </p>
  );
}

function pointOf(event: PointerEvent<HTMLDivElement>): Point {
  return { x: event.clientX, y: event.clientY };
}

/** The window's size in CSS pixels, kept up to date when the window is resized. */
function useViewport(): { readonly width: number; readonly height: number } {
  const [viewport, setViewport] = useState(sizeOfWindow);
  useEffect(() => {
    const onResize = () => setViewport(sizeOfWindow());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return viewport;
}

function sizeOfWindow() {
  return { width: window.innerWidth, height: window.innerHeight };
}
