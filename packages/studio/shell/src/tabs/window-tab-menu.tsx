import { ContextMenu, type ContextMenuTarget, type MenuEntry } from "@halonicjs/studio-kit";
import { type MouseEvent, useState } from "react";
import { currentLocation, type TabSet } from "./tab-set.ts";

/** The tab a tab menu is open for, its element and, after a right-click, the pointer's point. */
export interface TabMenuTarget extends ContextMenuTarget {
  readonly tabId: string;
}

/** What the tab menu's items do; the strip moves the focus on after each. */
export interface TabMenuActions {
  readonly close: (tabId: string) => void;
  readonly closeOthers: (tabId: string) => void;
  readonly reopenClosed: () => void;
}

/** Where the strip's tab menu is open, and the ways to open it. */
export interface WindowTabMenuOpener {
  readonly target: TabMenuTarget | undefined;
  /** Opens the menu below a tab, with the focus on its first item (Shift F10, the Menu key). */
  readonly openBelow: (tabId: string, element: HTMLElement | undefined) => void;
  /** The tablist's `onContextMenu`: a right-click on a tab opens its menu at the pointer. */
  readonly onContextMenu: (event: MouseEvent) => void;
  readonly close: () => void;
}

/**
 * The tab menu's state for the strip. The Menu key may send a `contextmenu` of its own after its
 * keydown opened the menu below the tab; that one is ignored, so the menu doesn't jump.
 */
export function useWindowTabMenu(): WindowTabMenuOpener {
  const [target, setTarget] = useState<TabMenuTarget | undefined>(undefined);
  return {
    target,
    openBelow: (tabId, element) => {
      if (element !== undefined) {
        setTarget({ tabId, element });
      }
    },
    onContextMenu: (event) => {
      const element = (event.target as Element).closest<HTMLElement>("[role=tab]");
      const tabId = element?.dataset["tabId"];
      if (element === null || tabId === undefined) {
        return;
      }
      event.preventDefault();
      if (target?.tabId === tabId && target.at === undefined) {
        return;
      }
      setTarget({ tabId, element, at: { x: event.clientX, y: event.clientY } });
    },
    close: () => setTarget(undefined),
  };
}

/** Props for {@link WindowTabMenu}. */
export interface WindowTabMenuProps {
  readonly tabs: TabSet;
  /** Open for this tab; closed while `undefined`. */
  readonly target: TabMenuTarget | undefined;
  readonly actions: TabMenuActions;
  readonly onClose: () => void;
}

/**
 * A window tab's menu (UX checklist part 1, 1.2): Shift F10, the Menu key or a right-click on a
 * tab opens it with **Close**, **Close other tabs** and **Reopen closed tab**. Close other tabs
 * can't be used on the only tab, and Reopen closed tab only once a tab has closed. It's named
 * after the tab's title. It shows no keys: the desktop app's Ctrl W and Ctrl Shift T get their
 * hints with the shell's Kbd helper, and served Studio binds neither.
 */
export function WindowTabMenu({ tabs, target, actions, onClose }: WindowTabMenuProps) {
  const tab = tabs.state.tabs.find((each) => each.id === target?.tabId);
  return (
    <ContextMenu
      label={tab === undefined ? "Tab" : currentLocation(tab).title}
      entries={tab === undefined ? [] : tabMenuEntries(tabs, tab.id, actions)}
      target={tab === undefined ? undefined : target}
      onClose={onClose}
    />
  );
}

function tabMenuEntries(tabs: TabSet, tabId: string, actions: TabMenuActions): MenuEntry[] {
  return [
    { id: "close", label: "Close", onSelect: () => actions.close(tabId) },
    {
      id: "close-others",
      label: "Close other tabs",
      disabled: tabs.state.tabs.length === 1,
      onSelect: () => actions.closeOthers(tabId),
    },
    {
      id: "reopen-closed",
      label: "Reopen closed tab",
      disabled: !tabs.canReopenClosed,
      onSelect: actions.reopenClosed,
    },
  ];
}
