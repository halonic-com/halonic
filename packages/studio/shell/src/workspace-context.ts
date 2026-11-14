import type { Announcer } from "./announcer/announcer.ts";
import type { BadgeRegistry } from "./badges/badge-registry.ts";
import type { EngineWords } from "./engine/engine-words.ts";
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
   * The texts that say the engine isn't answering, worded for this window's host ("The engine …",
   * "Halonic on the server …", "Halonic on your computer …"). Read it with `engineWordsOf`, which
   * falls back to the desktop app's words for a context built without a window.
   */
  readonly engineWords?: EngineWords;
  /**
   * Opens one of the sidebar's places as the sidebar does: in the active tab on the desktop, asking
   * for focus on its page's `h1`, and as its list on a phone. The window gives it to the views it
   * draws, so Home's Needs you can open the Inbox; a context built without a window has none.
   */
  readonly openPlace?: (place: SidebarPlace) => void;
  /**
   * The window's header badges, so a feature can show a state of its own, such as a connector that
   * needs a sign-in. It is the window's one registry, not the workspace's, and the window gives it
   * to the views it draws; a context built without a window has none.
   */
  readonly badges?: BadgeRegistry;
  /**
   * Opens an item as Ctrl K opens a found one: in the active tab on the desktop, or the tab that
   * shows it already, asking for focus on its page's `h1`, and as a page on a phone. The tab is
   * named as the item's kind names it (`tab.describe`), else by the item's id. The window gives
   * it to the views and commands it draws; a context built without a window has none.
   */
  readonly openItem?: (item: ItemRef) => void;
  /**
   * Opens Settings (`settings.open`) on the section asked for, such as `agent-sandbox` from the
   * Harness page's **Open Settings ›**, else on the one `settingsSectionToOpen` picks. The window
   * gives it to the views and commands it draws; a context built without a window has none.
   */
  readonly openSettings?: (sectionId?: string) => void;
  /**
   * Runs the command with this id, any feature's, as Ctrl K runs it, and says whether a feature
   * added it. A link in a view, such as Settings' **Open Models**, runs the command that opens
   * the page, so the view needn't know the feature. The window gives it to the views and commands
   * it draws; a context built without a window has none.
   */
  readonly runCommand?: (commandId: string) => boolean;
  /**
   * The sections features added to Settings, which `openSettings` can show, in Settings' order, so
   * Ctrl K can offer a section by its name only when it is there. Given with `openSettings`.
   */
  readonly settingsSections?: readonly SettingsSectionName[];
}

/** A Settings section as Ctrl K names it: its id and the title its row shows. */
export interface SettingsSectionName {
  readonly id: string;
  readonly title: string;
}
