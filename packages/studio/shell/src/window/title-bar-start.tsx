import { type ReactNode, useCallback, useState, useSyncExternalStore } from "react";
import { useNarrowWindow } from "../frame/frame-effects.ts";
import { columnWidthFor } from "../sidebar/sidebar-width.ts";

/**
 * How far the title bar's start reaches past the sidebar's width, so the window tabs after it
 * start where the framed panel does (`kit.framed-sidebar`): the panel sits 8px past the sidebar
 * (with the rail, the width given here), and the title bar's content starts where the sidebar's
 * column does, with 2px of gap before the tabs. So 8 − 2 = 6.
 */
export const TITLE_BAR_START_PAST_SIDEBAR = 6;

/** Props for {@link TitleBarStart}. */
export interface TitleBarStartProps {
  /** The sidebar's width now, as its resize edge sets it. */
  readonly sidebarWidth: number;
  /** The Halonic Studio mark, Back and Forward. */
  readonly children: ReactNode;
}

/**
 * The title bar's start: the mark, Back and Forward over the sidebar's column, at least as wide
 * as it, so the active tab joins the framed panel under it (HAL-19925). In a narrow window the
 * sidebar is the Places drawer, so it takes only its own width.
 */
export function TitleBarStart({ sidebarWidth, children }: TitleBarStartProps) {
  const narrow = useNarrowWindow();
  const style = narrow ? undefined : { minWidth: sidebarWidth + TITLE_BAR_START_PAST_SIDEBAR };
  return (
    <span data-title-bar-start="" className="flex items-center gap-1 self-center" style={style}>
      {children}
    </span>
  );
}

/**
 * The list column's width as the window keeps it, for the title bar's start and the column itself
 * (`shell.sidebar-resize`): 34% of the window, at most 380px, following the window as it resizes,
 * until the person sets a width with the edge. Enter or a double-click on the edge give the
 * window's width back, so the column follows the window again.
 */
export function useSidebarWidth() {
  const following = columnWidthFor(useWindowWidth());
  const [chosen, setChosen] = useState<number | undefined>(undefined);
  const onWidthChange = useCallback(
    (width: number) => setChosen(width === following ? undefined : width),
    [following],
  );
  const width = chosen ?? following;
  return { width, sidebar: { width, onWidthChange, resetWidth: following } };
}

function subscribeToResize(listener: () => void): () => void {
  window.addEventListener("resize", listener);
  return () => window.removeEventListener("resize", listener);
}

function useWindowWidth(): number {
  return useSyncExternalStore(subscribeToResize, () => window.innerWidth);
}
