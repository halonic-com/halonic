import { Button, PlusIcon } from "@halonicjs/studio-kit";
import {
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useNarrowWindow } from "../frame/frame-effects.ts";
import { OpenTabsMenu } from "./open-tabs-menu.tsx";
import { dragTargetIndex, TAB_DRAG_THRESHOLD, type TabSpan } from "./tab-drag.ts";
import { currentLocation, type TabLocation, type TabSet, type WindowTab } from "./tab-set.ts";
import type { WindowKeysOptions } from "./use-window-keys.ts";
import { WindowTabView } from "./window-tab.tsx";
import { type TabMenuActions, useWindowTabMenu, WindowTabMenu } from "./window-tab-menu.tsx";

/**
 * Finds the window tab strip, which a page can tell from a `tablist` of its own (a kit `Tabs`) by
 * its `data-window-tab-strip`.
 */
export const WINDOW_TAB_STRIP_SELECTOR = "[data-window-tab-strip]";

/** Props for {@link WindowTabStrip}. */
export interface WindowTabStripProps {
  /** The open workspace's tabs. */
  readonly tabs: TabSet;
  /** The 16px icon for a tab's place or item kind. */
  readonly iconFor?: ((location: TabLocation) => ReactNode) | undefined;
  /**
   * The places above a tab's place, outermost first, as the toolbar's path shows them. A tab's
   * tooltip is its full path: "Workflows / Support reply".
   */
  readonly parentsOf?: ((location: TabLocation) => readonly TabLocation[]) | undefined;
  /** Whether the item a tab shows waits for a person: the tab gets the needs-you dot. */
  readonly needsYou?: ((location: TabLocation) => boolean) | undefined;
  /** Called after **+** opened a new tab on Home, so the frame can open the Ctrl K palette there. */
  readonly onNewTab?: ((tab: WindowTab) => void) | undefined;
  /**
   * Where this Studio runs and on which platform, as given to `useWindowKeys`. In the desktop app
   * the tab menu then shows the keys of Close and Reopen closed tab. Leave it out, or run served,
   * and it shows none, since the browser owns those keys.
   */
  readonly windowKeys?: Pick<WindowKeysOptions, "host" | "platform"> | undefined;
}

/**
 * The window tabs in the title bar (component specs 24.5): one `tablist` named "Open tabs" and one
 * Tab stop. ← and → move the focus, Enter or Space opens the focused tab, Delete closes it,
 * Ctrl Shift PageUp and PageDown move it, and Shift F10 or the Menu key opens its tab menu, as a
 * right-click does. Dragging a tab moves it too, with no motion: it jumps
 * to its new place as the pointer crosses a neighbour's middle. Tabs are 200px, shrink together
 * to 96px, and then the strip scrolls sideways with the active tab kept in view. **+** after the
 * last tab opens a new tab on Home.
 *
 * In a narrow window (600 to 899px) the tabs fold into "3 open tabs ▾" and its Menu
 * ({@link OpenTabsMenu}), with **+** after it.
 *
 * Nothing on a tab is `fg-subtle`, which reaches only 4.46:1 on the hovered tab.
 *
 * @example
 * <ShellFrame titleBar={<WindowTabStrip tabs={workspace.tabs} />} …>
 */
export function WindowTabStrip({
  tabs,
  iconFor,
  parentsOf,
  needsYou,
  onNewTab,
  windowKeys,
}: WindowTabStripProps) {
  const state = useSyncExternalStore(
    (listener) => tabs.subscribe(listener),
    () => tabs.state,
  );
  const elements = useRef(new Map<string, HTMLDivElement>());
  // The tab that has the focus while it is in the strip. Outside the strip, or when the focused tab
  // has closed, the active tab is the Tab stop, even when it changed from outside (the sidebar).
  const [focusedId, setFocusedId] = useState<string | undefined>(undefined);
  const rovingId = state.tabs.find((tab) => tab.id === focusedId)?.id ?? state.activeId;
  const startDrag = useTabDrag(tabs, elements);
  const narrow = useNarrowWindow();
  const menu = useWindowTabMenu();

  useEffect(() => {
    elements.current.get(state.activeId)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [state.activeId]);

  // A tab that isn't drawn yet, such as one just reopened, gets the focus once it is.
  const pendingFocus = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    const tabId = pendingFocus.current;
    if (tabId !== undefined && elements.current.has(tabId)) {
      pendingFocus.current = undefined;
      elements.current.get(tabId)?.focus();
    }
  });

  const focusTab = (tabId: string) => {
    setFocusedId(tabId);
    const element = elements.current.get(tabId);
    if (element === undefined) {
      pendingFocus.current = tabId;
    } else {
      element.focus();
    }
  };

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setFocusedId(undefined);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = stripKey(event);
    if (key === undefined) {
      return;
    }
    event.preventDefault();
    if (key === "menu") {
      menu.openBelow(rovingId, elements.current.get(rovingId));
      return;
    }
    const focusNext = runStripKey(tabs, rovingId, key);
    if (focusNext !== undefined) {
      focusTab(focusNext);
    }
  };

  if (narrow) {
    return (
      <>
        <OpenTabsMenu tabs={tabs} state={state} iconFor={iconFor} needsYou={needsYou} />
        <NewTabButton tabs={tabs} onNewTab={onNewTab} />
      </>
    );
  }

  const menuActions: TabMenuActions = {
    close: (tabId) => {
      const focusNext = runStripKey(tabs, tabId, "close");
      if (focusNext !== undefined) {
        focusTab(focusNext);
      }
    },
    closeOthers: (tabId) => tabs.closeOthers(tabId),
    reopenClosed: () => {
      tabs.reopenClosed();
      focusTab(tabs.state.activeId);
    },
  };

  return (
    <>
      <div
        role="tablist"
        aria-label="Open tabs"
        data-window-tab-strip=""
        className={stripClasses}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        onContextMenu={menu.onContextMenu}
      >
        {state.tabs.map((tab) => (
          <WindowTabView
            key={tab.id}
            tab={tab}
            active={tab.id === state.activeId}
            focusable={tab.id === rovingId}
            icon={iconFor?.(currentLocation(tab))}
            parents={parentsOf?.(currentLocation(tab)) ?? []}
            needsYou={needsYou?.(currentLocation(tab)) ?? false}
            elementRef={(element) => {
              if (element === null) {
                elements.current.delete(tab.id);
              } else {
                elements.current.set(tab.id, element);
              }
            }}
            onFocus={() => setFocusedId(tab.id)}
            onPointerDown={(event) => startDrag(tab.id, event)}
            onActivate={() => tabs.activate(tab.id)}
            onClose={() => tabs.close(tab.id)}
          />
        ))}
      </div>
      <WindowTabMenu
        tabs={tabs}
        target={menu.target}
        actions={menuActions}
        windowKeys={windowKeys}
        onClose={menu.close}
      />
      <NewTabButton tabs={tabs} onNewTab={onNewTab} />
    </>
  );
}

/** **+**, after the tabs or the folded tabs, opens a new tab on Home. */
function NewTabButton({ tabs, onNewTab }: Pick<WindowTabStripProps, "tabs" | "onNewTab">) {
  return (
    <div className="shrink-0 self-center">
      <Button
        variant="ghost"
        size="sm"
        icon={<PlusIcon />}
        label="New tab"
        onClick={() => onNewTab?.(tabs.newTab())}
      />
    </div>
  );
}

/**
 * The strip scrolls sideways, and a scroller clips on all four sides. Its 8px padding at both ends
 * and 1px at the foot, cancelled by negative margins, keep the active tab's foot curves and its
 * 1px overlap with the panel's top border inside the scroller's box, while the tabs stay where the
 * title bar puts them.
 */
const stripClasses = [
  "-mx-2 -mb-px flex min-w-0 items-end self-end overflow-x-auto px-2 pb-px",
  "[scrollbar-width:none]",
].join(" ");

/**
 * Dragging a tab by its pointer: a press that moves more than `TAB_DRAG_THRESHOLD` moves the tab
 * as the pointer crosses its neighbours' middles, until the pointer is released. The window
 * follows the pointer, not the tab, because moving the tab in the DOM would drop a pointer capture.
 * Only the main button drags; a middle-click is left alone.
 *
 * A move with the main button up ends the drag too, for a release the window never saw (let go
 * outside a webview that doesn't pass it on). Each drag's listeners hang on one `AbortController`,
 * so the strip unmounting mid-drag removes them.
 *
 * The strip has no `touch-action`, so on a touch screen the browser pans it and cancels the drag.
 * The Android shell needs `touch-action: pan-y` on the tabs, or a long press to start a drag.
 */
function useTabDrag(
  tabs: TabSet,
  elements: RefObject<Map<string, HTMLDivElement>>,
): (tabId: string, event: PointerEvent) => void {
  const ongoing = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => ongoing.current?.abort(), []);

  return (tabId, event) => {
    if (event.button !== 0) {
      return;
    }
    ongoing.current?.abort();
    const drag = new AbortController();
    ongoing.current = drag;
    const startX = event.clientX;
    let dragging = false;

    const onMove = (move: globalThis.PointerEvent) => {
      if ((move.buttons & 1) === 0) {
        drag.abort();
        return;
      }
      dragging ||= Math.abs(move.clientX - startX) >= TAB_DRAG_THRESHOLD;
      if (!dragging) {
        return;
      }
      const order = tabs.state.tabs;
      const spans = order.map((tab) => spanOf(elements.current.get(tab.id)));
      const from = order.findIndex((tab) => tab.id === tabId);
      tabs.move(tabId, dragTargetIndex(move.clientX, spans, from));
    };
    const onRelease = () => {
      drag.abort();
      if (dragging) {
        swallowNextClick();
      }
    };

    const listen = { signal: drag.signal };
    window.addEventListener("pointermove", onMove, listen);
    window.addEventListener("pointerup", onRelease, listen);
    window.addEventListener("pointercancel", () => drag.abort(), listen);
  };
}

/**
 * Swallows the `click` the browser fires after a drag's release, so letting go over the dragged
 * tab's ✕ doesn't close it, and letting go over a tab doesn't open it. If no click comes (let go
 * outside the window), the next press ends the wait, so a later click goes through.
 */
function swallowNextClick(): void {
  const done = new AbortController();
  const listen = { capture: true, signal: done.signal };
  const swallow = (click: MouseEvent) => {
    click.stopPropagation();
    click.preventDefault();
    done.abort();
  };
  window.addEventListener("click", swallow, listen);
  window.addEventListener("pointerdown", () => done.abort(), listen);
}

function spanOf(element: HTMLElement | undefined): TabSpan {
  const box = element?.getBoundingClientRect();
  return { left: box?.left ?? 0, width: box?.width ?? 0 };
}

/** What a key does in the strip, or `undefined` when the strip leaves it alone. */
type StripKey = "previous" | "next" | "activate" | "close" | "move-left" | "move-right" | "menu";

function stripKey(event: KeyboardEvent): StripKey | undefined {
  const plain = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
  // Only Ctrl Shift moves a tab: with Alt or Meta as well, the key is the window's.
  const ctrlShift = event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey;
  if (ctrlShift && event.key === "PageUp") {
    return "move-left";
  }
  if (ctrlShift && event.key === "PageDown") {
    return "move-right";
  }
  const onlyShift = event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;
  if (onlyShift && event.key === "F10") {
    return "menu";
  }
  if (!plain) {
    return undefined;
  }
  const keys: Record<string, StripKey> = {
    ArrowLeft: "previous",
    ArrowRight: "next",
    Enter: "activate",
    " ": "activate",
    Delete: "close",
    ContextMenu: "menu",
  };
  return keys[event.key];
}

/**
 * Does what `key` asks with the focused tab `tabId`, and returns the tab the focus goes to, or
 * `undefined` when it stays. After a close the focus goes to the tab that became active, or to
 * the one now in the closed tab's place.
 */
function runStripKey(
  tabs: TabSet,
  tabId: string,
  key: Exclude<StripKey, "menu">,
): string | undefined {
  const before = tabs.state;
  const index = before.tabs.findIndex((tab) => tab.id === tabId);
  switch (key) {
    case "previous":
    case "next":
      return before.tabs[index + (key === "next" ? 1 : -1)]?.id;
    case "activate":
      tabs.activate(tabId);
      return undefined;
    case "close": {
      tabs.close(tabId);
      const after = tabs.state;
      const inItsPlace = after.tabs[Math.min(index, after.tabs.length - 1)] as WindowTab;
      return tabId === before.activeId ? after.activeId : inItsPlace.id;
    }
    case "move-left":
    case "move-right":
      tabs.move(tabId, index + (key === "move-right" ? 1 : -1));
      return tabId;
  }
}
