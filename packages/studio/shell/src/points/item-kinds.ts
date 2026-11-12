import type { ViewRef } from "../view.ts";
import type { WorkspaceContext } from "../workspace-context.ts";

/** Points at one item, the same way a deep link does: `kind/hub/id`. */
export interface ItemRef {
  readonly kind: string;
  readonly hub: string;
  readonly id: string;
}

/** An entry in an item's ⋮ menu, such as "Run now". */
export interface ItemAction {
  readonly id: string;
  readonly label: string;
  run(item: ItemRef, context: WorkspaceContext): void | Promise<void>;
}

/** How an item's tab looks. */
export interface TabDescription {
  readonly label: string;
  /** Files of this item with unsaved changes; the tab shows them as dirty. */
  readonly unsavedFiles?: readonly string[];
}

/** How the tabs of one item kind behave. */
export interface TabBehaviour {
  describe(item: ItemRef, context: WorkspaceContext): TabDescription;
  /**
   * Whether the item still exists. The window asks again each time `subscribe` says the items
   * changed, and closes the tab of an item that's gone (`shell.gone-item-tabs`).
   */
  exists(item: ItemRef, context: WorkspaceContext): boolean;
  /**
   * Calls `listener` each time items of this kind may have come or gone; returns the way to stop.
   * Without it the window never asks `exists`, so a gone item's tab stays open.
   */
  subscribe?(listener: () => void, context: WorkspaceContext): () => void;
}

/**
 * A kind of item, such as an agent or a workflow: its label and icon, the
 * view that opens it, how one is created, its ⋮ menu and how its tab behaves.
 * Added with `studio.itemKinds.add`; one feature owns each kind.
 */
export interface ItemKindContribution {
  /** Unique, such as `agent`. Also the first part of a deep link. */
  readonly kind: string;
  readonly label: string;
  readonly icon: string;
  /** The view that shows an item of this kind in a tab. */
  readonly open: ViewRef;
  /** The dialog that creates an item of this kind, when people can create one. */
  readonly create?: ViewRef;
  readonly actions?: readonly ItemAction[];
  readonly tab?: TabBehaviour;
}
