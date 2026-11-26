import { fullTime, shortTime } from "../text/short-time.ts";
import { useFormatLocale } from "./format-locale.tsx";

/** The props of {@link TimeStamp}. */
export interface TimeStampProps {
  /** When the thing happened. */
  readonly at: Date;
  /** The list's clock, so every row of one list reads against the same moment. */
  readonly now: Date;
  /** The format to follow; the window's `FormatLocaleProvider` when undefined. */
  readonly locale?: string;
}

/**
 * When something happened, at the end of a list row's name line (`kit.time-stamp`): the short
 * time in small muted text with tabular figures, so times line up. It never wraps or shrinks, so
 * the name beside it is cut first. Hovering shows the full date and time. An invalid `at`, such
 * as one read from a source's unreadable text, shows nothing rather than break the whole list.
 */
export function TimeStamp({ at, now, locale: given }: TimeStampProps) {
  const followed = useFormatLocale();
  const locale = given ?? followed;
  // `toISOString` and Intl throw on an invalid date, which would take the list down with it.
  if (Number.isNaN(at.getTime())) return null;
  return (
    <time
      dateTime={at.toISOString()}
      title={fullTime(at, locale)}
      className="shrink-0 whitespace-nowrap text-small text-fg-muted tabular-nums"
    >
      {shortTime(at, now, locale)}
    </time>
  );
}
