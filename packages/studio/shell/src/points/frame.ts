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

/**
 * The sidebar's places, in the only order they are shown (component specs 24.4 S2): places only,
 * no agents, workflows or pins. A place whose feature hasn't added it isn't listed.
 */
export const sidebarPlaces = [
  "home",
  "inbox",
  "agents",
  "workflows",
  "routines",
  "library",
  "runs",
  "changes",
] as const;

/** One of the sidebar's places. */
export type SidebarPlace = (typeof sidebarPlaces)[number];

/**
 * What a place shows next to its name. Nothing shows at zero. A `count` shows the number in
 * accent (the Inbox, Changes); `running` shows the still 6px running dot (Runs).
 */
export interface PlaceSignal {
  readonly mark: "count" | "running";
  readonly value: number;
  /** What a screen reader hears after the place's name, such as "2 waiting" or "1 running". */
  readonly spoken: string;
}

/** A place in the sidebar, such as Agents, and the page it opens. One feature adds each place. */
export interface PlaceContribution extends ViewRef {
  readonly id: SidebarPlace;
  readonly label: string;
  /** The outline icon's name; the shell fills it when the place is where you are. */
  readonly icon: string;
  /** The place's signal now, or `undefined` for none. */
  signal?(context: WorkspaceContext): PlaceSignal | undefined;
}
