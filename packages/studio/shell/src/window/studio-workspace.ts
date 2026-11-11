import type { ToastStore } from "@halonicjs/studio-kit";
import { RecentPlaces } from "../palette/recent-places.ts";
import { SaveState } from "../save/save-state.ts";
import type { ServiceTarget } from "../service-catalog.ts";
import { TabSet } from "../tabs/tab-set.ts";

/** What {@link StudioWorkspace} needs: the window's toasts and the workspace's service registry. */
export interface StudioWorkspaceOptions {
  /** The window's toasts, `shell.toasts`; a failed save shows its toast there. */
  readonly toasts: ToastStore;
  /** The workspace's service registry, already holding the host's and the features' services. */
  readonly services: ServiceTarget;
}

/**
 * The window's state for one open workspace: its window tabs, the places they showed for Ctrl K's
 * Recent, its save state and its services. The window creates one when a workspace opens and calls
 * {@link StudioWorkspace.dispose} when it closes (`shell.studio-window`).
 *
 * @example
 * shell.services.instantiate(registry);
 * const workspace = new StudioWorkspace({ toasts: shell.toasts, services: registry });
 * // …when the workspace closes:
 * workspace.dispose();
 */
export class StudioWorkspace {
  /** The window tabs; a new workspace starts with one tab on Home. */
  readonly tabs = new TabSet();
  /** The places the tabs showed, newest first, for Ctrl K. */
  readonly recent: RecentPlaces;
  /** Saves the workspace's items and holds the toolbar's save note. */
  readonly saving: SaveState;
  /** The workspace's services, for `shell.services.contextFor`. */
  readonly services: ServiceTarget;

  constructor(options: StudioWorkspaceOptions) {
    this.recent = new RecentPlaces(this.tabs);
    this.saving = new SaveState(options.toasts);
    this.services = options.services;
  }

  /** Stops following the tabs. Call it once, when the workspace closes. */
  dispose(): void {
    this.recent.dispose();
  }
}
