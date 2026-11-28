import { type ReactNode, useState } from "react";
import { useNarrowWindow } from "../frame/frame-effects.ts";
import { SIDEBAR_DEFAULT_WIDTH } from "../sidebar/sidebar-width.ts";

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

/** The sidebar's width as the window keeps it: for the title bar's start and the sidebar itself. */
export function useSidebarWidth() {
  const [width, setWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  return { width, sidebar: { width, onWidthChange: setWidth } };
}
