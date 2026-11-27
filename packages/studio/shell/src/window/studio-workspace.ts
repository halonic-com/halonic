import type { ToastStore } from "@halonicjs/studio-kit";
import { EngineStarting } from "../engine/engine-starting.ts";
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
  /** The workspace's name, such as "Acme", for the window's title; absent until T3 opens workspaces by name. */
  readonly name?: string | undefined;
  /**
   * The open of the workspace's engine, when the workspace shows before it answers (HAL-19965):
   * the frame's engine line says "Starting the engine…" until it settles. Left out, it doesn't.
   */
  readonly engineReady?: Promise<unknown> | undefined;
}

/**
 * The window's state for one open workspace: its window tabs, the places they showed for Ctrl K's
 * Recent, its save state, whether its engine still starts, and its services. The window creates one when a workspace opens and calls
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
  /** Saves the workspace's items and holds the save note. */
  readonly saving: SaveState;
  /** The workspace's services, for `shell.services.contextFor`. */
  readonly services: ServiceTarget;
  /** The workspace's name, such as "Acme", when the window knows it. */
  readonly name: string | undefined;
  /** Whether the workspace's own engine still starts; each open workspace has its own engine. */
  readonly engineStarting: EngineStarting;

  constructor(options: StudioWorkspaceOptions) {
    this.recent = new RecentPlaces(this.tabs);
    this.saving = new SaveState(options.toasts);
    this.services = options.services;
    this.name = options.name;
    this.engineStarting = new EngineStarting(options.engineReady);
  }

  /** Stops following the tabs. Call it once, when the workspace closes. */
  dispose(): void {
    this.recent.dispose();
  }
}
