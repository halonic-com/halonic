import type { Announcer } from "./announcer/announcer.ts";
import type { BadgeRegistry } from "./badges/badge-registry.ts";
import type { CloseStack } from "./close-stack/close-stack.ts";
import type { EngineWords, StudioHost } from "./engine/engine-words.ts";
import type { SidebarPlace } from "./points/frame.ts";
import type { ItemRef, OpenItemOptions } from "./points/item-kinds.ts";
import type { SaveState } from "./save/save-state.ts";
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
   * Where this window runs, so a feature can leave out what a host can't do, such as approving
   * tools on a phone. The window gives it to the views and commands it draws; a context built
   * without a window has none, which a feature reads as the desktop app.
   */
  readonly host?: StudioHost;
  /**
   * Opens one of the sidebar's places as the sidebar does: in the active tab on the desktop, asking
   * for focus on its page's `h1`, and as its list on a phone. The window gives it to the views it
   * draws, so Home's Needs you can open the Inbox; a context built without a window has none.
   */
  readonly openPlace?: (place: SidebarPlace) => void;
  /**
   * Pushes a list under a place's page, as the phone's Library does with a kind's items: its key
   * is `place/sub` and the place's view gets `sub` (`PlaceViewProps`). The page is a list, so the
   * bottom navigation stays, and Back leads to the place's page. The window gives it to the views it
   * draws and it does nothing on the desktop, which has no such pages; a context built without a
   * window has none.
   */
  readonly openPlaceList?: (place: SidebarPlace, sub: string, title: string) => void;
  /**
   * Pushes a page under a place's page, as the phone's Changes does with an item's What changed:
   * like `openPlaceList`, but the page is no list, so the bottom navigation hides and the page owns
   * the bottom edge. Back leads to the page it was pushed from, which gets its `memory` back
   * (`PlaceViewProps`). It does nothing on the desktop; a context built without a window has none.
   */
  readonly openPlacePage?: (place: SidebarPlace, sub: string, title: string) => void;
  /**
   * Goes back from a page `openPlacePage` pushed, as Back does, for a page that closes itself, such
   * as What changed after **Undo these changes**. Only while that page shows: once the user has
   * left it, nothing moves. Given with `openPlacePage`.
   */
  readonly closePlacePage?: (place: SidebarPlace, sub: string) => void;
  /**
   * The window's header badges, so a feature can show a state of its own, such as a connector that
   * needs a sign-in. It is the window's one registry, not the workspace's, and the window gives it
   * to the views it draws; a context built without a window has none.
   */
  readonly badges?: BadgeRegistry;
  /**
   * Shows one of the sidebar's views by its id, such as `files`, as picking its tab in the
   * sidebar's switch does (`shell.sidebar-switch`); an id no feature added changes nothing. The
   * window gives it to the views it draws on the desktop only: a phone has no sidebar views.
   */
  readonly showSidebarView?: (viewId: string) => void;
  /**
   * Opens an item as Ctrl K opens a found one: in the active tab on the desktop, or the tab that
   * shows it already, asking for focus on its page's `h1`, and as a page on a phone. The tab is
   * named as the item's kind names it (`tab.describe`), else by the item's id. The window gives
   * it to the views and commands it draws; a context built without a window has none. `step`
   * opens the page on that part of it, as the kind's page reads it.
   */
  readonly openItem?: (item: ItemRef, options?: OpenItemOptions) => void;
  /**
   * Opens an item in a new tab next to the active one, as a Ctrl-click, a middle click or Ctrl
   * Enter on a row does, and says so to a screen reader; an item another tab shows already stays
   * where it is. On a phone, which has no tabs, it opens the page as `openItem` does. The window
   * gives it to the views it draws; a context built without a window has none.
   */
  readonly openItemInNewTab?: (item: ItemRef) => void;
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
  /**
   * The item the active window tab shows, so a status bar item can follow it, such as a run's cost
   * while its tab is in view. Read-only and nothing but the item: no tab or editor. The window
   * gives it to the views it draws on the desktop; a context built without a window, and a phone,
   * which has no tabs, have none.
   */
  readonly activeItem?: ActiveItemSource;
  /**
   * The page the window shows now: the active tab's on the desktop, the phone's own page on a
   * phone. A feature reads it to leave out what that page says already, such as the Inbox's
   * "Waiting for you" while the Inbox shows. The window gives it to the views it draws; a context
   * built without a window has none.
   */
  readonly shown?: () => ShownPage;
  /**
   * The window's save state, so a page that saves an item itself shows "Saving…" and a failed
   * write's "Couldn't save · Try again" in the status bar, and its toast, as files do, and a page
   * that saves by itself field by field reports "1 field not saved" with `setFieldsNotSaved`. The
   * window gives it to the views it draws; a context built without a window has none.
   */
  readonly saving?: Pick<SaveState, "save" | "setFieldsNotSaved">;
  /**
   * The window's close stack, so a page that draws its own layer, such as an item page's
   * `StackedCards`, closes it with Esc and the phone's Back in rank order with the shell's own
   * layers (`shell.close-stack`). The window gives it to the views it draws; a context built
   * without a window has none.
   */
  readonly closeStack?: CloseStack;
}

/** The item the active window tab shows, and a way to hear it change. */
export interface ActiveItemSource {
  /** The active tab's item, or `null` when it shows Home, a place or a search. */
  get(): ItemRef | null;
  /**
   * Calls `listener` when the item changes, not on every focus or tab event. Returns a function
   * that stops it.
   */
  subscribe(listener: () => void): () => void;
}

/**
 * A page a window shows: a sidebar place's own page, such as the Inbox, or an item's page. Home's
 * place is `home`; a search, Settings or a phone's list under a place has neither.
 */
export interface ShownPage {
  readonly place?: SidebarPlace;
  readonly item?: ItemRef;
}

/** A Settings section as Ctrl K names it: its id and the title its row shows. */
export interface SettingsSectionName {
  readonly id: string;
  readonly title: string;
}
