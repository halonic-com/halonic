import { type PointerEvent, useEffect, useRef, useState } from "react";
import { type Point, type Rect, type Screen, selectionBox } from "../crop.ts";
import { endFeedback, type FeedbackIpc, feedbackCommands } from "../feedback-ipc.ts";
import { feedbackWords } from "../feedback-words.ts";
import { useEscapeEnds } from "../use-escape-ends.ts";
import {
  type Drag,
  overlayScreen,
  releasedArea,
  type SelectedArea,
  wasClick,
  wholeStill,
} from "./drag.ts";
import { boxEdge, dim, keyEdge, overlayBackground, pill } from "./overlay-colours.ts";
import { SizeLabel } from "./size-label.tsx";
import type { StillImage } from "./still.ts";
import { useStill } from "./use-still.ts";

/** Props for {@link FeedbackOverlay}. */
export interface FeedbackOverlayProps {
  /** The shell, for this overlay's still and the box the person drew. */
  readonly ipc: FeedbackIpc;
}

/**
 * One screen's selection overlay (`feedback.overlay`, sketch on HAL-18562 §1): the still of that
 * screen, dimmed, under a crosshair, with the hint at the top. Dragging, or a click, a move and a
 * second click, draws a box at full brightness with its size in device pixels; finishing a box of
 * 8 × 8 or more hands it to the shell, which closes the overlays. A smaller box does nothing.
 * Enter selects the whole screen, so a keyboard alone can send feedback (WCAG 2.1.1), and Esc
 * ends the feedback.
 */
export function FeedbackOverlay({ ipc }: FeedbackOverlayProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const still = useStill(ipc, canvas);
  const [drag, setDrag] = useState<Drag>();
  const [pointerHere, setPointerHere] = useState(true);
  const viewport = useViewport();
  useEscapeEnds(ipc);
  useEnterSelectsAll(ipc, drag === undefined ? still : undefined);

  const screen = still === undefined ? undefined : overlayScreen(still, viewport);
  const selection =
    screen === undefined || drag === undefined
      ? undefined
      : { screen, box: selectionBox(screen, drag.start, drag.current) };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || screen === undefined) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = pointOf(event);
    // The second click of a two-click box keeps the corner the first one set.
    if (drag?.phase === "anchored") setDrag({ ...drag, current: point });
    else setDrag({ start: point, current: point, phase: "pressed" });
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag !== undefined) setDrag({ ...drag, current: pointOf(event) });
  };
  const onPointerUp = () => {
    if (drag === undefined || selection === undefined) return;
    const area = releasedArea(selection.screen, selection.box);
    if (area === undefined && drag.phase === "pressed" && wasClick(selection.box)) {
      setDrag({ ...drag, phase: "anchored" });
      return;
    }
    setDrag(undefined);
    if (area !== undefined) selectArea(ipc, area);
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
      <Dim box={selection?.box} />
      {selection === undefined ? null : (
        <SelectionBox screen={selection.screen} box={selection.box} />
      )}
      {drag === undefined && pointerHere ? <Hint /> : null}
    </div>
  );
}

/**
 * The dim over the still, with a hole where the box is. It stays mounted for the overlay's whole
 * life, so its fade-in runs once when the overlay appears and never again on a click or a box
 * that's too small (HAL-19019).
 */
function Dim({ box }: { readonly box: Rect | undefined }) {
  return (
    <div
      className="absolute inset-0 transition-opacity duration-(--duration-fast) ease-(--ease-enter) starting:opacity-0"
      data-feedback-dim=""
      style={{ background: dim, clipPath: box === undefined ? undefined : holeFor(box) }}
    />
  );
}

/** The whole screen minus `box`: with `evenodd`, the box's outline cuts a hole in the screen's. */
function holeFor(box: Rect): string {
  const left = `${box.x}px`;
  const top = `${box.y}px`;
  const right = `${box.x + box.width}px`;
  const bottom = `${box.y + box.height}px`;
  return `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${left} ${top}, ${right} ${top}, ${right} ${bottom}, ${left} ${bottom}, ${left} ${top})`;
}

/** The box at full brightness, a hole in the {@link Dim}: a white edge and a dark one outside it. */
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
          boxShadow: "0 0 0 2px rgb(0 0 0 / 0.35)",
        }}
      />
      <SizeLabel screen={screen} box={box} />
    </>
  );
}

/**
 * "Drag to select an area · Enter for the whole screen · Esc to cancel", in a dark pill at the top
 * centre of the screen.
 */
function Hint() {
  return (
    <p
      className="absolute top-6 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1.5 text-body transition-[opacity,translate] duration-(--duration-base) ease-(--ease-enter) starting:-translate-y-2 starting:opacity-0"
      style={pill}
      data-feedback-hint=""
    >
      <span>{feedbackWords.dragHint}</span>
      <span aria-hidden="true">·</span>
      <Key name="Enter" />
      <span>{feedbackWords.enterHint}</span>
      <span aria-hidden="true">·</span>
      <Key name="Esc" />
      <span>{feedbackWords.escHint}</span>
    </p>
  );
}

function Key({ name }: { readonly name: string }) {
  return (
    <kbd className="rounded border px-1 font-mono text-caption" style={keyEdge}>
      {name}
    </kbd>
  );
}

/** Selects the whole `still` on Enter; pass `undefined` while a box is being drawn or before the still. */
function useEnterSelectsAll(ipc: FeedbackIpc, still: StillImage | undefined): void {
  useEffect(() => {
    if (still === undefined) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" && !event.repeat) selectArea(ipc, wholeStill(still));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ipc, still]);
}

/** Hands `area` to the shell, which closes the overlays; if it can't, the feedback ends. */
function selectArea(ipc: FeedbackIpc, area: SelectedArea): void {
  ipc.invoke(feedbackCommands.select, { area }).catch((error: unknown) => {
    console.error("The box wasn't selected:", error);
    endFeedback(ipc);
  });
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
