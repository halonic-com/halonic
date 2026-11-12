import type { MouseEvent, ReactNode } from "react";
import type { ListEmpty } from "./empty-list.tsx";
import type { ListSkeletonShape } from "./list-skeleton.tsx";

/** What every List row has, with or without columns. */
interface ListRowBase<Id extends string> {
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
   * chip takes the trailing part's place, or the first `status` column's. The row stays
   * openable, so it can be fixed.
   */
  readonly error?: { readonly reason: string; readonly chip: string };
}

/** One item in a List: an agent, a routine, a file in a picker. */
export interface ListRow<Id extends string = string> extends ListRowBase<Id> {
  /** On the right: a status chip or a value. */
  readonly trailing?: ReactNode;
  readonly tag?: never;
  readonly cells?: never;
  readonly label?: never;
}

/** One item in a List with `columns`: a run in the Runs list. */
export interface ListColumnsRow<Id extends string = string> extends ListRowBase<Id> {
  /** An outline tag after the title, never cut: "Test". */
  readonly tag?: ReactNode;
  /** The row's value in each column, by the column's `key`. */
  readonly cells?: Readonly<Record<string, ListCell>>;
  /**
   * The sentence a screen reader hears for the row, in its own order and words, as microcopy
   * 19.3's "Run 01JD8Q, Support reply, needs you, …". The columns are hidden from screen readers;
   * without it they hear the title and the meta line.
   */
  readonly label?: string;
  /** A chip goes in a `status` column instead. */
  readonly trailing?: never;
}

/** Either kind of row, as the List's own parts take them. */
export type AnyListRow<Id extends string = string> = ListRow<Id> | ListColumnsRow<Id>;

/**
 * A column's kind sets its width, alignment, type and what happens when it doesn't fit, so every
 * columned List looks the same (spec HAL-6764):
 * - `status`, 120px: a StatusChip, never cut.
 * - `code`, 64px: a short id in `text-code`, never cut.
 * - `main`, the rest and at least 200px: the row's icon, title, tag and meta line.
 * - `text`, 192px: a short phrase, up to two lines.
 * - `time`, 96px, right-aligned: a time over its detail, never cut.
 */
export type ListColumnKind = "status" | "code" | "main" | "text" | "time";

/** One column of a List with columns. Exactly one is `main`, which holds the title. */
export type ListColumn =
  | { readonly kind: "main" }
  | { readonly kind: Exclude<ListColumnKind, "main">; readonly key: string };

/** A row's value in one column. */
export interface ListCell {
  readonly value: ReactNode;
  /** Only a `time` column draws it, under the value: "took 2 min". */
  readonly detail?: string;
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
  /**
   * The verb that names a row's checkbox, in a list that also opens rows: "Stage" names it
   * "Stage classifier.ts". Default "Select".
   */
  readonly verb?: string;
}

/**
 * Rows under one heading, as the Runs list's days: "Today", "Yesterday". Each group is its own box,
 * and the whole list stays one grid with one Tab stop. A List with `columns` takes
 * `ListGroup<Id, ListColumnsRow<Id>>`.
 */
export interface ListGroup<Id extends string = string, Row extends AnyListRow<Id> = ListRow<Id>> {
  /**
   * Stable, never the index: "2026-11-12". The heading's row takes the id `group-heading:<id>`,
   * next to the rows' ids, so no row's id may start with `group-heading:`.
   */
  readonly id: string;
  /** Drawn with ListHeading, between the boxes. ↑ ↓ pass over it. */
  readonly heading: { readonly name: string; readonly detail?: string };
  /** A group with no rows isn't drawn, heading and all. */
  readonly rows: readonly Row[];
}

interface ListBase<Id extends string> {
  /**
   * Enter or a click on a row. Without it, a click toggles the selection. With a `selection` too,
   * each row starts with a checkbox cell, so a mouse or a finger can select without opening.
   */
  readonly onOpen?: (id: Id) => void;
  /**
   * Ctrl Enter (⌘ Enter on a Mac), a Ctrl-click (⌘-click) or a middle click, as the Runs list
   * opens a run in a new tab. Without it those do nothing, as in the Changes file list.
   */
  readonly onOpenInNewTab?: (id: Id) => void;
  readonly selection?: ListSelection<Id>;
  /**
   * The row whose item shows beside the list, as the Inbox's open item: it has the selected look
   * and `aria-current`. Only its look changes: it isn't selected, so with a `selection` its
   * `aria-selected` and checkbox still follow the selection. Enter and a click still call `onOpen`.
   */
  readonly current?: Id;
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

/** A list of rows, in one box. */
interface ListOfRows<Id extends string, Row extends AnyListRow<Id>> extends ListBase<Id> {
  readonly rows: readonly Row[];
  /** The heading's level. Default 2. */
  readonly headingLevel?: 2 | 3 | 4;
  readonly groups?: never;
  readonly groupHeadingLevel?: never;
}

/** A list named by its heading, the box's first line (18.3). */
interface ListWithHeading<Id extends string, Row extends AnyListRow<Id>>
  extends ListOfRows<Id, Row> {
  readonly heading: { readonly name: string; readonly detail?: string };
  readonly label?: never;
}

/** A list without a heading, named by a label: "Agents". */
interface ListWithLabel<Id extends string, Row extends AnyListRow<Id>> extends ListOfRows<Id, Row> {
  readonly label: string;
  readonly heading?: never;
}

/**
 * A list of groups, each under its own heading, named by a label: "Runs". It has no heading of its
 * own: the groups' headings are its headings.
 */
interface ListWithGroups<Id extends string, Row extends AnyListRow<Id>> extends ListBase<Id> {
  readonly groups: readonly ListGroup<Id, Row>[];
  /** The groups' headings' level. Default 3, as the Runs list's days (a11y 13.1). */
  readonly groupHeadingLevel?: 2 | 3 | 4;
  readonly label: string;
  readonly rows?: never;
  readonly heading?: never;
  /** The List has no heading of its own: `groupHeadingLevel` sets the groups'. */
  readonly headingLevel?: never;
}

/** A list always has a name: a `heading` or a `label`, never both. */
type ListShape<Id extends string, Row extends AnyListRow<Id>> =
  | ListWithHeading<Id, Row>
  | ListWithLabel<Id, Row>
  | ListWithGroups<Id, Row>;

/** A List without columns: its rows have a `trailing` part, and it can be dense. */
interface WithoutColumns {
  readonly columns?: never;
  /** 32px rows, for menus and pickers; 48px on a phone. */
  readonly dense?: boolean;
}

/** A List with columns: its rows are `ListColumnsRow`s, with `cells` in place of `trailing`. */
interface WithColumns {
  /**
   * The rows' columns, in order, as the Runs list: status, run, what ran, started by, when. Side by
   * side when a row's main cell is at least 800px wide; below that, and on a phone, each row
   * stacks them on three lines. Exactly one is `main`, and each other key is used once.
   */
  readonly columns: readonly ListColumn[];
  /** A columned row is never 32px: it holds a title over a meta line. */
  readonly dense?: never;
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

/**
 * A list always has a name: a `heading` or a `label`, never both. It holds `rows`, or `groups` of
 * rows under their own headings, and its rows are plain or laid out in `columns`.
 */
export type ListProps<Id extends string = string> = (
  | (ListShape<Id, ListRow<Id>> & WithoutColumns)
  | (ListShape<Id, ListColumnsRow<Id>> & WithColumns)
) &
  ListLoading;
