import type { Announcer } from "./announcer/announcer.ts";
import type { SidebarPlace } from "./points/frame.ts";
import type { ItemRef } from "./points/item-kinds.ts";
import type { ServiceLookup } from "./service-catalog.ts";

/**
 * What a contribution's callbacks get: the open workspace's services, limited
 * to the ones the contributing feature lists in `needs` and `provides`, and
 * the window's announcer.
 * Build one with `shell.services.contextFor`.
 */
export interface WorkspaceContext {
  readonly services: ServiceLookup;
  /** Reads text to screen readers; it belongs to the window, not the workspace. */
  readonly announcer: Announcer;
  /**
   * Opens one of the sidebar's places as the sidebar does: in the active tab on the desktop, asking
   * for focus on its page's `h1`, and as its list on a phone. The window gives it to the views it
   * draws, so Home's Needs you can open the Inbox; a context built without a window has none.
   */
  readonly openPlace?: (place: SidebarPlace) => void;
  /**
   * Opens an item as Ctrl K opens a found one: in the active tab on the desktop, or the tab that
   * shows it already, asking for focus on its page's `h1`, and as a page on a phone. The tab is
   * named as the item's kind names it (`tab.describe`), else by the item's id. The window gives
   * it to the views and commands it draws; a context built without a window has none.
   */
  readonly openItem?: (item: ItemRef) => void;
}
