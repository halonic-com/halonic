import type { ViewRef } from "../view.ts";
import type { WorkspaceContext } from "../workspace-context.ts";
import type { Ordered } from "./point-store.ts";

/**
 * A card in the stack shown for a selection, such as an agent, step or run.
 * Ids are unique per selection.
 */
export interface CardContribution extends Ordered, ViewRef {
  /** What is selected when the card shows, such as `agent` or `arrow`. */
  readonly for: string;
}

/** A panel window people can open (up to three at once; the shell saves which). */
export interface PanelWindowContribution extends Ordered, ViewRef {
  readonly title: string;
}

/** An item in the status bar or the title bar, such as the run target picker. */
export interface BarItemContribution extends Ordered, ViewRef {}

/** An entry in the phone's bottom bar. */
export interface PhoneBarContribution extends Ordered, ViewRef {
  readonly label: string;
  readonly icon: string;
  /** A count shown on the entry, or `undefined` for none. */
  badge?(context: WorkspaceContext): number | undefined;
}

/** A section in the settings container, which the shell owns. */
export interface SettingsSectionContribution extends Ordered, ViewRef {
  readonly title: string;
}
