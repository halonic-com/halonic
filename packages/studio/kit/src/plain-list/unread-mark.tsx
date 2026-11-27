/*
 * The blue unread mark and the violet flag dot, shared by `PlainRow` and a `plain` List's rows, so
 * the Messenger's chats and the Inbox's items mark unread the same way (HAL-19192). Drawn only as
 * fills, which forced colours drop, so there they take `CanvasText` (`kit.list-plain`).
 */

/** A row's unread mark: a count, or a dot when only "new or not" matters. */
export interface PlainRowUnread {
  /** Words for screen readers, after the count: " unread", so they hear "2 unread"; a dot's alone. */
  readonly label: string;
  /** The count drawn in the blue badge, "99+" past 99; without it the row gets a blue dot. */
  readonly count?: string | undefined;
}

/** A dot's or a badge's fill in forced colours, where background colours are dropped. */
const forcedFill = "forced-color-adjust-none forced-colors:bg-[CanvasText]";

/** The blue count, or the blue dot, with its words for screen readers. */
export function UnreadMark({ unread }: { readonly unread: PlainRowUnread }) {
  if (unread.count === undefined) {
    return (
      <span data-unread className={`size-2 shrink-0 rounded-full bg-primary ${forcedFill}`}>
        <span className="sr-only">{unread.label}</span>
      </span>
    );
  }
  return (
    <span
      data-unread
      className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-caption text-on-primary ${forcedFill} forced-colors:text-[Canvas]`}
    >
      {unread.count}
      <span className="sr-only">{unread.label}</span>
    </span>
  );
}

/** The 6px violet dot after a title while the item waits for the person, read as `label`. */
export function FlagDot({ label }: { readonly label: string }) {
  return (
    <span data-flag className={`ms-1.5 size-1.5 shrink-0 rounded-full bg-warning ${forcedFill}`}>
      <span className="sr-only">{label}</span>
    </span>
  );
}
