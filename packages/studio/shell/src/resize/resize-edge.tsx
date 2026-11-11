import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";
import { type EdgeLimits, type EdgeSide, edgeWidthForDrag, edgeWidthForKey } from "./edge-width.ts";

/** Props for {@link ResizeEdge}. */
export interface ResizeEdgeProps {
  /** The edge's name: "Resize sidebar". */
  readonly label: string;
  /** The id of what the edge resizes, for `aria-controls`. */
  readonly controls: string;
  /** Its width now, in pixels. */
  readonly width: number;
  readonly limits: EdgeLimits;
  /** Which edge of it this is: `end` after it, `start` before it. */
  readonly side: EdgeSide;
  /** Called with each new width while the edge moves, so what it resizes follows it. */
  readonly onResize: (width: number) => void;
  /** Called once a move ends (the pointer or the key is released), to save the width. */
  readonly onResizeEnd: (width: number) => void;
}

/** Where a drag started, so each move sets the width from there. */
interface Drag {
  readonly startX: number;
  readonly startWidth: number;
}

/**
 * A resize edge between two parts of a page, the sidebar's and the side panel's (UX 1.3 and 1.10,
 * VK T2-F41 and F42). It's an 8px hit area over the border that takes no room of its own, with a
 * 2px `accent` line on hover, while dragging and on keyboard focus.
 *
 * It's a window splitter for the keyboard too: a focusable `separator` whose value a screen reader
 * reads ("264 pixels"), so nothing goes through the announcer. ← and → move it by 16px, Home and
 * End go to the narrowest and the widest, Enter and a double-click go back to the reset width.
 * The width is saved when the key or the pointer is released, only when it changed.
 *
 * @example
 * <ResizeEdge
 *   label="Resize sidebar"
 *   controls="sidebar"
 *   width={width}
 *   limits={{ min: 180, max: 640, reset: 264 }}
 *   side="end"
 *   onResize={setWidth}
 *   onResizeEnd={save}
 * />
 */
export function ResizeEdge({
  label,
  controls,
  width,
  limits,
  side,
  onResize,
  onResizeEnd,
}: ResizeEdgeProps) {
  const drag = useRef<Drag | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  // The width last asked for: a release saves it even before what it resizes has drawn it.
  const latestWidth = useRef(width);
  latestWidth.current = width;

  const resize = (next: number) => {
    latestWidth.current = next;
    onResize(next);
  };

  // Whether this edge's own key changed the width since the last save, so a key released here
  // after it was pressed elsewhere, or a key that changed nothing, saves nothing.
  const keyChanged = useRef(false);

  const widthForKey = (event: KeyboardEvent) =>
    isPlain(event) ? edgeWidthForKey(event.key, latestWidth.current, limits, side) : undefined;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = widthForKey(event);
    if (next === undefined) {
      return;
    }
    event.preventDefault();
    if (next !== latestWidth.current) {
      keyChanged.current = true;
      resize(next);
    }
  };

  const onKeyUp = (event: KeyboardEvent<HTMLDivElement>) => {
    if (keyChanged.current && widthForKey(event) !== undefined) {
      keyChanged.current = false;
      onResizeEnd(latestWidth.current);
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: width };
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const started = drag.current;
    if (started !== undefined) {
      resize(edgeWidthForDrag(started.startWidth, event.clientX - started.startX, limits, side));
    }
  };

  const endDrag = () => {
    const started = drag.current;
    if (started === undefined) {
      return;
    }
    drag.current = undefined;
    setDragging(false);
    // A click without a drag (such as each half of a double-click) has nothing to save.
    if (latestWidth.current !== started.startWidth) {
      onResizeEnd(latestWidth.current);
    }
  };

  // Like Enter: already at the reset width, there is nothing to change or save.
  const onDoubleClick = () => {
    const reset = edgeWidthForKey("Enter", latestWidth.current, limits, side);
    if (reset === undefined || reset === latestWidth.current) {
      return;
    }
    resize(reset);
    onResizeEnd(reset);
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: an <hr> can't take the focus, and a window splitter must.
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-controls={controls}
      aria-valuemin={limits.min}
      aria-valuemax={limits.max}
      aria-valuenow={width}
      aria-valuetext={`${width} pixels`}
      data-dragging={dragging ? "" : undefined}
      className="group relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize touch-none outline-none"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onDoubleClick}
    >
      <span className="pointer-events-none absolute inset-y-0 left-[3px] w-0.5 bg-accent opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 group-data-dragging:opacity-100 forced-colors:bg-[Highlight]" />
    </div>
  );
}

/**
 * Only the plain keys resize, as in the window tab strip: Alt ← (Back), Ctrl Home and the like are
 * left to the browser and to the keybindings features add.
 */
function isPlain(event: KeyboardEvent): boolean {
  return !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
}
