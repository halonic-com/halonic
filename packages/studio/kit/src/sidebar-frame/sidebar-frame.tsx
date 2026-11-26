import { createElement, type ReactNode, type Ref } from "react";

/**
 * The window a {@link FramedPanel} sits in: a focused app's (Messenger, Inbox), white or slate-900
 * on the slate frame, or Studio's, the page's `surface` on the halo.
 */
export type FramedPanelTone = "app" | "studio";

const toneClass: Record<FramedPanelTone, string> = {
  app: "bg-app-panel",
  studio: "bg-surface",
};

/**
 * The framed panel's edge, without its fill: 12px corners and a 1px line, which forced colours
 * draw in `CanvasText`, so the panel's edge stays visible there (`kit.framed-sidebar`).
 */
const framedPanelEdgeClass = "overflow-hidden rounded-lg border border-border";

/** The space between the sidebar and the framed panel, and between two framed panels: 8px. */
const framedGapClass = "gap-2";

/** A framed panel's classes for a part that can't be a {@link FramedPanel}, such as a side card. */
export function framedPanelClass(tone: FramedPanelTone = "app"): string {
  return `${framedPanelEdgeClass} ${toneClass[tone]}`;
}

/** Props for {@link SidebarFrame}. */
export interface SidebarFrameProps {
  /** The sidebar, straight on the window's frame: no fill or line of its own. */
  readonly sidebar: ReactNode;
  /** What sits beside it: a {@link FramedPanel}, or a row that holds one. */
  readonly children: ReactNode;
}

/**
 * The framed sidebar the Messenger, the Inbox and Studio share (`kit.framed-sidebar`, HAL-19923):
 * the sidebar on the window's frame and, 8px beside it, the content on its own framed panel.
 *
 * @example
 * <SidebarFrame sidebar={<nav aria-label="Chats">…</nav>}>
 *   <FramedPanel as="main">…</FramedPanel>
 * </SidebarFrame>
 */
export function SidebarFrame({ sidebar, children }: SidebarFrameProps) {
  return (
    <div data-sidebar-frame="" className={`flex h-full min-h-0 min-w-0 flex-1 ${framedGapClass}`}>
      {sidebar}
      {children}
    </div>
  );
}

/** Props for {@link FramedPanel}. */
export interface FramedPanelProps {
  /** The panel's element: `main` when it holds the page's main content, else a plain `div`. */
  readonly as?: "main" | "div";
  readonly ref?: Ref<HTMLElement>;
  /** Whose window it sits in, which picks its fill; a focused app's by default. */
  readonly tone?: FramedPanelTone;
  readonly children: ReactNode;
}

/**
 * The framed panel beside a {@link SidebarFrame}'s sidebar: a column that fills the room left,
 * with 12px corners, a 1px line and the window's panel fill.
 *
 * @example
 * <FramedPanel as="main" ref={chat}>…</FramedPanel>
 */
export function FramedPanel({ as = "div", ref, tone = "app", children }: FramedPanelProps) {
  const className = `flex min-h-0 min-w-0 flex-1 flex-col ${framedPanelClass(tone)}`;
  return createElement(as, { ref, className, "data-framed-panel": "" }, children);
}
