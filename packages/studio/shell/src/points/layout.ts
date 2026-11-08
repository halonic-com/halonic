import type { ViewRef } from "../view.ts";
import type { WorkspaceContext } from "../workspace-context.ts";
import type { ItemRef } from "./item-kinds.ts";
import type { Ordered } from "./point-store.ts";

/** One item in an explorer group. */
export interface ExplorerItem {
  readonly item: ItemRef;
  readonly label: string;
}

/**
 * An explorer group that lists items, such as all agents. The shell adds
 * pins, recently run, reorder and collapse. Ids are unique across groups and
 * sections.
 */
export interface ExplorerGroupContribution extends Ordered {
  readonly title: string;
  items(context: WorkspaceContext): readonly ExplorerItem[];
}

/** An explorer section that shows the feature's own view instead of a list. */
export interface ExplorerSectionContribution extends Ordered, ViewRef {
  readonly title: string;
}

/**
 * A section on the page of an item kind, possibly another feature's, such
 * as Triggers on the agent page. Ids are unique per kind.
 */
export interface ItemPageSectionContribution extends Ordered, ViewRef {
  /** The item kind whose page shows the section. */
  readonly on: string;
}
