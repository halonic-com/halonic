import type { Announcer } from "../announcer/announcer.ts";
import type { TabLocation, TabSet } from "./tab-set.ts";

/**
 * Opens a place the user picked in the toolbar's path or the sidebar: in the active tab, or in a
 * new tab next to it, which then says so. A place another tab already shows stays where it is,
 * and only the announcer says so (UX D3, HAL-3159), so the window doesn't jump.
 */
export function openLocation(
  tabs: TabSet,
  announcer: Announcer,
  location: TabLocation,
  inNewTab: boolean,
): void {
  if (!inNewTab) {
    tabs.openHere(location);
    return;
  }
  const opened = tabs.openInNewTab(location);
  announcer.announce(
    opened.added
      ? `Opened ${location.title} in a new tab.`
      : `${location.title} is already open in a tab.`,
  );
}
