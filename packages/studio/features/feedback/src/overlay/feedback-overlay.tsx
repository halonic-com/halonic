import { type PointerEvent, useEffect, useRef, useState } from "react";
import { type Point, type Rect, type Screen, selectionBox } from "../crop.ts";
import { endFeedback, type FeedbackIpc, feedbackCommands } from "../feedback-ipc.ts";
import { feedbackWords } from "../feedback-words.ts";
import {
  type Drag,
  overlayScreen,
  releasedArea,
  type SelectedArea,
  type StillSize,
  wasClick,
  wholeStill,
} from "./drag.ts";
import { boxEdge, dim, keyEdge, pill } from "./overlay-colours.ts";
import { SizeLabel } from "./size-label.tsx";
import { keepOpenOnCancel, useTopLayer } from "./top-layer.ts";

/** Props for {@link FeedbackOverlay}. */
export interface FeedbackOverlayProps {
  /** The shell, for the box the person drew and to end the feedback. */
  readonly ipc: FeedbackIpc;
  /** The size of the still `plugin:feedback|start` took of this window, in device pixels. */
  readonly still: StillSize;
  /** Takes the overlay away: after a selection, on Esc, or when the selection fails. */
  readonly onClose: () => void;
  /** The shell kept the crop of the selected box: the Send feedback dialog can show. */
  readonly onSelected: () => void;
}

/**
 * The selection overlay inside Studio's own window (`feedback.overlay`, sketch on HAL-18562 §1):
 * a light, see-through dim over the live app under a crosshair, with the hint at the top.
 * Dragging, or a click, a move and a second click, draws a box at full brightness with its size
 * in device pixels; finishing a box of 8 × 8 or more takes the overlay away and hands the box to
 * the shell, which crops the still it took when the shortcut was pressed, and then says so
 * through `onSelected`. A smaller box does
 * nothing. Enter selects the whole window, so a keyboard alone can send feedback (WCAG 2.1.1),
 * and Esc ends the feedback. It is a modal `<dialog>`, so it shows over a modal the app has open.
 */
export function FeedbackOverlay({ ipc, still, onClose, onSelected }: FeedbackOverlayProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useTopLayer(dialog);
  const [drag, setDrag] = useState<Drag>();
  const [pointerHere, setPointerHere] = useState(true);
  const viewport = useViewport();
  const select = (area: SelectedArea) => {
    onClose();
    selectArea(ipc, area, onSelected);
  };
  useEscapeCloses(ipc, onClose);
  useEnterSelectsAll(drag === undefined ? still : undefined, select);

  const screen = overlayScreen(still, viewport);
  const selection =
    screen === undefined || drag === undefined
      ? undefined
      : { screen, box: selectionBox(screen, drag.start, drag.current) };

  const onPointerDown = (event: PointerEvent<HTMLDialogElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = pointOf(event);
    // The second click of a two-click box keeps the corner the first one set.
    if (drag?.phase === "anchored") setDrag({ ...drag, current: point });
    else setDrag({ start: point, current: point, phase: "pressed" });
  };
  const onPointerMove = (event: PointerEvent<HTMLDialogElement>) => {
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
    if (area !== undefined) select(area);
  };

  return (
    <dialog
      ref={dialog}
      // A modal <dialog> without the browser's frame, margins, size limits or backdrop.
      className="fixed inset-0 m-0 size-full max-h-none max-w-none cursor-crosshair select-none overflow-hidden border-0 bg-transparent p-0 backdrop:bg-transparent"
      aria-label={feedbackWords.dragHint}
      data-feedback-overlay=""
      onCancel={keepOpenOnCancel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(undefined)}
      onPointerEnter={() => setPointerHere(true)}
      onPointerLeave={() => setPointerHere(false)}
    >
      <Dim box={selection?.box} />
      {selection === undefined ? null : (
        <SelectionBox screen={selection.screen} box={selection.box} />
      )}
      {drag === undefined && pointerHere ? <Hint /> : null}
    </dialog>
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
 * "Drag to select an area · Enter for the whole window · Esc to cancel", in a dark pill at the top
 * centre of the window.
 */
function Hint() {
  return (
    <p
      className="absolute top-6 left-1/2 flex w-max -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1.5 text-body transition-[opacity,translate] duration-(--duration-base) ease-(--ease-enter) starting:-translate-y-(--motion-rise) starting:opacity-0"
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
    <kbd className="rounded-xs border px-1 font-mono text-caption" style={keyEdge}>
      {name}
    </kbd>
  );
}

/** Selects the whole `still` on Enter; pass `undefined` while a box is being drawn. */
function useEnterSelectsAll(
  still: StillSize | undefined,
  select: (area: SelectedArea) => void,
): void {
  useEffect(() => {
    if (still === undefined) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.repeat) return;
      event.preventDefault();
      event.stopPropagation();
      select(wholeStill(still));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [still, select]);
}

/** Ends the feedback and takes the overlay away on Esc, before the app under it hears the key. */
function useEscapeCloses(ipc: FeedbackIpc, onClose: () => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
      endFeedback(ipc);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [ipc, onClose]);
}

/**
 * Hands `area` to the shell, which keeps its crop, then calls `selected`; if the shell can't, the
 * feedback ends. When another window's press took the still since (`other_window`), that feedback
 * is left alone.
 */
function selectArea(ipc: FeedbackIpc, area: SelectedArea, selected: () => void): void {
  ipc.invoke(feedbackCommands.select, { area }).then(selected, (error: unknown) => {
    console.error("The box wasn't selected:", error);
    if (error !== "other_window") endFeedback(ipc);
  });
}

function pointOf(event: PointerEvent<HTMLDialogElement>): Point {
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
