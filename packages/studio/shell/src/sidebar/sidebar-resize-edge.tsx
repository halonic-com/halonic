import { useNarrowWindow } from "../frame/frame-effects.ts";
import { ResizeEdge } from "../resize/resize-edge.tsx";
import { SIDEBAR_LIMITS } from "./sidebar-width.ts";

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

/**
 * The sidebar's resize edge (`shell.sidebar-resize`), placed right after the sidebar, before the
 * page: a {@link ResizeEdge} named "Resize sidebar", 180 to 640px, where → is wider and Enter and a
 * double-click go back to 264px. The narrow window and the phone show no edge.
 *
 * @example
 * <nav id="sidebar" style={{ width }}>…</nav>
 * <SidebarResizeEdge width={width} sidebarId="sidebar" onResize={setWidth} onResizeEnd={save} />
 */
export function SidebarResizeEdge({ sidebarId, ...edge }: SidebarResizeEdgeProps) {
  // The narrow window's drawer is always 264px wide, so it has no edge.
  const narrow = useNarrowWindow();
  if (narrow) {
    return null;
  }
  return (
    <ResizeEdge
      {...edge}
      label="Resize sidebar"
      controls={sidebarId}
      limits={SIDEBAR_LIMITS}
      side="end"
    />
  );
}
