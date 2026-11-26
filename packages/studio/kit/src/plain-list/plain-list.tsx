import type { ReactNode, Ref } from "react";
import { FlagDot, type PlainRowUnread, UnreadMark } from "./unread-mark.tsx";

/** The props of `PlainList`. */
export interface PlainListProps {
  /** What screen readers call the list: "Chats". */
  readonly label: string;
  /** Its `PlainRow`s. */
  readonly children: ReactNode;
  /** For code that fades the rows in once they arrive. */
  readonly listRef?: Ref<HTMLUListElement>;
}

/** A row's text button that shows in place of its time while the row is hovered or focused. */
export interface PlainRowAction {
  /** A verb that says what happens: "Mark as unread". */
  readonly label: string;
  /**
   * What a screen reader or a voice user calls it, when the label alone would repeat on every
   * row: "Mark as unread: Chief". It starts with the label, so it holds the words seen (WCAG 2.5.3).
   */
  readonly spokenLabel?: string | undefined;
  readonly onClick: () => void;
}

/** The props of `PlainRow`. */
export interface PlainRowProps {
  /** Stable, never the index: tests and code find the row by its `data-row-id`. */
  readonly id: string;
  /** The 28px picture before the text: an `Avatar` or an item's mark. Decoration. */
  readonly picture: ReactNode;
  /** The row's name. A node, so a search can mark the part it found. Cut with an ellipsis. */
  readonly title: ReactNode;
  /** A short muted part after the title, inside its cut: a channel's size, a chat's source. */
  readonly afterTitle?: string | undefined;
  /** A 6px violet dot after the title while the item waits for the person, read as this label. */
  readonly flag?: string | undefined;
  /** The line under the title. Cut with an ellipsis. */
  readonly line?: ReactNode | undefined;
  /** On the title line's end, never cut: a `TimeStamp`, or text such as "09:30". */
  readonly time?: ReactNode | undefined;
  /** Unread: a semibold title, a full-colour line and a blue count or dot. Read without it. */
  readonly unread?: PlainRowUnread | undefined;
  /** The row whose item is open beside the list: the selected background and `aria-current`. */
  readonly current?: boolean;
  readonly onSelect: () => void;
  /** "Mark as unread": shown in place of the time while the row is hovered or has focus. */
  readonly action?: PlainRowAction | undefined;
}

/**
 * A list of plain rows for a two-pane app's list, the Messenger's chats and the Inbox's items
 * (HAL-19192, `kit.plain-list`): no borders or box, 4px apart.
 */
export function PlainList({ label, children, listRef }: PlainListProps) {
  return (
    <ul ref={listRef} aria-label={label} className="flex flex-col gap-1">
      {children}
    </ul>
  );
}

const rowClasses =
  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-start transition-colors duration-(--duration-fast) ease-standard hover:bg-surface-muted focus-ring aria-[current=true]:bg-surface-muted";

/**
 * A row with an action keeps the hover fill while the pointer is on the action or the row has
 * focus, because the action covers the title's end with that same fill (HAL-19622).
 */
const rowWithActionClasses = `${rowClasses} group-hover:bg-surface-muted group-focus-within:bg-surface-muted`;

/**
 * The action sits over the title's end, so it carries the row's fill and covers what's under it.
 * While hidden it takes no clicks, so a tap where hover doesn't apply opens the row instead; it
 * stays in the tab order. Its box is 24px high (WCAG 2.5.8), raised 2px so its words stay on the
 * title's line (HAL-19643). Its focus ring is inset, so it never covers the unread count below;
 * `pe-1` gives the ring air and `-me-1` keeps the label's end lined up with the time (HAL-19656).
 */
const actionClasses =
  "absolute end-3 -me-1 top-1.5 min-h-6 rounded-sm bg-surface-muted ps-2 pe-1 text-small text-fg-muted opacity-0 pointer-events-none transition-opacity duration-(--duration-fast) hover:text-fg focus-ring-inset group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100";

/**
 * One row of a `PlainList`: its picture, its title over one line, its time on the right and its
 * unread mark under the time (`kit.plain-list`). Unread rows have a semibold title and a
 * full-colour line, read rows a regular title and a muted line; nothing else moves, so the list
 * doesn't jump when a row is read. The row's `action` sits beside the row's button, not in it, so
 * it is a button of its own, reached with Tab after the row.
 *
 * @example
 * <PlainRow id={chat.id} picture={<Avatar name="Chief" />} title="Chief" line="Shall I merge #12?"
 *   time="09:30" unread={{ label: " unread", count: "2" }} onSelect={open} />
 */
export function PlainRow(props: PlainRowProps) {
  const { id, picture, current = false, onSelect, action, time } = props;
  const hidesTime =
    action === undefined ? "" : "group-hover:invisible group-focus-within:invisible";
  return (
    <li data-row-id={id} className="group relative">
      <button
        type="button"
        aria-current={current ? "true" : undefined}
        onClick={onSelect}
        className={action === undefined ? rowClasses : rowWithActionClasses}
      >
        {picture}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-baseline gap-2">
            <RowTitle {...props} />
            {time === undefined ? null : (
              <span className={`shrink-0 whitespace-nowrap text-small text-fg-muted ${hidesTime}`}>
                {time}
              </span>
            )}
          </span>
          <RowLine {...props} />
        </span>
      </button>
      {action === undefined ? null : (
        <button
          type="button"
          aria-label={action.spokenLabel}
          onClick={action.onClick}
          className={actionClasses}
        >
          {action.label}
        </button>
      )}
    </li>
  );
}

/** The title, the part after it and the violet dot, which sits outside the cut so it stays. */
function RowTitle({ title, afterTitle, flag, unread }: PlainRowProps) {
  // Semibold (600), not text-body-strong (500): at 14px only 600 reads as unread (Sofia, HAL-19512).
  const weight = unread === undefined ? "text-body" : "text-body font-semibold";
  return (
    <span className="flex min-w-0 flex-1 items-center">
      <span className={`min-w-0 truncate ${weight}`}>
        <bdi>{title}</bdi>
        {afterTitle === undefined ? null : (
          <span className="text-small font-normal text-fg-muted"> · {afterTitle}</span>
        )}
      </span>
      {flag === undefined ? null : <FlagDot label={flag} />}
    </span>
  );
}

/** The line under the title, full colour while unread, and the unread count or dot. */
function RowLine({ line, unread }: PlainRowProps) {
  const colour = unread === undefined ? "text-fg-muted" : "text-fg";
  return (
    <span className="flex items-center gap-2">
      <span className={`min-w-0 flex-1 truncate text-small ${colour}`}>{line}</span>
      {unread === undefined ? null : <UnreadMark unread={unread} />}
    </span>
  );
}
