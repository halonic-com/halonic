import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";
import {
  clampSidebarWidth,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  sidebarWidthForKey,
} from "./sidebar-width.ts";

/** Props for {@link SidebarResizeEdge}. */
export interface SidebarResizeEdgeProps {
  /** The sidebar's width now, in pixels. */
  readonly width: number;
  /** The sidebar element's id, for `aria-controls`. */
  readonly sidebarId: string;
  /** Called with each new width while the edge moves, so the sidebar follows it. */
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
 * The sidebar's resize edge (UX 1.3, VK T2-F41 and F42), placed right after the sidebar, before
 * the page. It's an 8px hit area over the sidebar's border that takes no room of its own, with a
 * 2px `accent` line on hover, while dragging and on keyboard focus.
 *
 * It's a window splitter for the keyboard too: a focusable `separator` named "Resize sidebar",
 * whose value a screen reader reads ("264 pixels"), so nothing goes through the announcer. ← and →
 * move it by 16px, Home and End go to 180px and 640px, Enter and a double-click go back to 264px.
 * The width is saved when the key or the pointer is released, only when it changed. The narrow
 * window and the phone show no edge.
 *
 * @example
 * <nav id="sidebar" style={{ width }}>…</nav>
 * <SidebarResizeEdge width={width} sidebarId="sidebar" onResize={setWidth} onResizeEnd={save} />
 */
export function SidebarResizeEdge({
  width,
  sidebarId,
  onResize,
  onResizeEnd,
}: SidebarResizeEdgeProps) {
  const drag = useRef<Drag | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  // The width last asked for: a release saves it even before the sidebar has drawn it.
  const latestWidth = useRef(width);
  latestWidth.current = width;

  const resize = (next: number) => {
    latestWidth.current = next;
    onResize(next);
  };

  // Whether this edge's own key changed the width since the last save, so a key released here
  // after it was pressed elsewhere, or a key that changed nothing, saves nothing.
  const keyChanged = useRef(false);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = isPlain(event) ? sidebarWidthForKey(event.key, latestWidth.current) : undefined;
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
    if (keyChanged.current && sidebarWidthForKey(event.key, latestWidth.current) !== undefined) {
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
      resize(clampSidebarWidth(started.startWidth + event.clientX - started.startX));
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

  // Like Enter: a sidebar already at 264px has nothing to change or save.
  const onDoubleClick = () => {
    if (latestWidth.current === SIDEBAR_DEFAULT_WIDTH) {
      return;
    }
    resize(SIDEBAR_DEFAULT_WIDTH);
    onResizeEnd(SIDEBAR_DEFAULT_WIDTH);
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: an <hr> can't take the focus, and a window splitter must.
    <div
      role="separator"
      tabIndex={0}
      aria-label="Resize sidebar"
      aria-orientation="vertical"
      aria-controls={sidebarId}
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
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
