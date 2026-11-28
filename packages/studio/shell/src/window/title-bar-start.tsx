import { type ReactNode, useCallback, useState, useSyncExternalStore } from "react";
import { columnWidthFor } from "../sidebar/sidebar-width.ts";

/** Props for {@link TitleBarStart}. */
export interface TitleBarStartProps {
  /** The Halonic Studio mark, Back and Forward. */
  readonly children: ReactNode;
}

/**
 * The title bar's start: the mark, Back and Forward. The window tabs sit above the content pane
 * (`shell.frame`), so the title bar no longer lines its start up with the framed panel.
 */
export function TitleBarStart({ children }: TitleBarStartProps) {
  return (
    <span data-title-bar-start="" className="flex items-center gap-1 self-center">
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
