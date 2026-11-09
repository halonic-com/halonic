import type { MouseEvent, ReactNode } from "react";
import type { ListEmpty } from "./empty-list.tsx";
import type { ListSkeletonShape } from "./list-skeleton.tsx";

/** One item in a List: an agent, a routine, a run, a file in a picker. */
export interface ListRow<Id extends string = string> {
  /** Stable, never the index: focus and selection follow it. */
  readonly id: Id;
  readonly title: string;
  /** One line under the title, cut with an ellipsis. */
  readonly meta?: string;
  /**
   * A 20px icon before the text, 16px in a `dense` row as in a Menu item. Hidden from screen
   * readers: the title names the row.
   */
  readonly icon?: ReactNode;
  /** A 28px avatar before the text, in place of the icon. Hidden from screen readers too. */
  readonly avatar?: ReactNode;
  /** On the right: a status chip or a value. */
  readonly trailing?: ReactNode;
  /** The "More" icon button. Its label names the row: "More actions for Sorter". */
  readonly more?: {
    readonly label: string;
    readonly onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  };
  /**
   * The row can't be used now: still readable and focusable, but it can't be opened or selected.
   * The reason takes the meta line's place and screen readers hear it with the row.
   */
  readonly unavailable?: ListRowUnavailable;
  /**
   * The row has a problem: the reason takes the meta line's place in `danger`, and a `danger`
   * chip takes the trailing slot. The row stays openable, so it can be fixed.
   */
  readonly error?: { readonly reason: string; readonly chip: string };
}

/** Why a row can't be used right now: "Waiting for the model to download". */
export interface ListRowUnavailable {
  /** The visible text. Unlike the Button's, the List draws it, so it's the text and not an `id`. */
  readonly reason: string;
}

/** The rows the user has picked. The screen keeps the set; Space toggles a row. */
export interface ListSelection<Id extends string = string> {
  readonly selected: ReadonlySet<Id>;
  readonly onToggle: (id: Id) => void;
  /** More than one row at a time, as staging files in Changes. */
  readonly multiple?: boolean;
}

interface ListBase<Id extends string> {
  readonly rows: readonly ListRow<Id>[];
  /** Default 2. */
  readonly headingLevel?: 2 | 3 | 4;
  /** Enter or a click on a row. Without it, a click toggles the selection. */
  readonly onOpen?: (id: Id) => void;
  /**
   * Ctrl Enter (⌘ Enter on a Mac), a Ctrl-click (⌘-click) or a middle click, as the Runs list
   * opens a run in a new tab. Without it those do nothing, as in the Changes file list.
   */
  readonly onOpenInNewTab?: (id: Id) => void;
  readonly selection?: ListSelection<Id>;
  /** 32px rows, for menus and pickers; 48px on a phone. */
  readonly dense?: boolean;
  /** No outer border or radius and lines from 16px. On by default on a phone. */
  readonly flush?: boolean;
  /**
   * The Empty state shown in place of the rows when there are none: "No agents yet". The
   * heading stays. Its title is one level below the List's heading unless it names its own.
   */
  readonly empty?: ListEmpty;
  /** The skeleton rows' shape, so they look like the rows that are coming. */
  readonly skeleton?: ListSkeletonShape;
  /** Try again, offered once it has loaded for 10 seconds. */
  readonly onRetry?: () => void;
}

/** A list named by its heading, the box's first line (18.3). */
interface ListWithHeading<Id extends string> extends ListBase<Id> {
  readonly heading: { readonly name: string; readonly detail?: string };
  readonly label?: never;
}

/** A list without a heading, named by a label: "Agents". */
interface ListWithLabel<Id extends string> extends ListBase<Id> {
  readonly label: string;
  readonly heading?: never;
}

/**
 * A List that can load says what's loading: there's no "Loading" default, which would tell a
 * screen reader user nothing.
 */
type ListLoading =
  | { readonly loading?: undefined; readonly loadingLabel?: never }
  | {
      /**
       * The rows are on their way: three skeleton rows after 300ms, then "Still loading" after 10
       * seconds (19.3). When loading fails, show the Empty state's `error` tone instead of the
       * List, and focus its title.
       */
      readonly loading: boolean;
      /** What screen readers hear while it loads: "Loading skills". */
      readonly loadingLabel: string;
    };

/** A list always has a name: a `heading` or a `label`, never both. */
export type ListProps<Id extends string = string> = (ListWithHeading<Id> | ListWithLabel<Id>) &
  ListLoading;
