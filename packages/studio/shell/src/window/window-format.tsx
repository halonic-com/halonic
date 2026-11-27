import { FormatLocaleProvider, followedFormat } from "@halonicjs/studio-kit";
import { type ReactNode, useCallback, useSyncExternalStore } from "react";

/**
 * The format chosen in Settings → Formats, as the app keeps it: the tag, such as `de-DE`, or
 * undefined for "Follow this computer", and a way to hear when it changes, in this window or another.
 */
export interface ChosenFormat {
  /** The chosen tag, or undefined to follow the computer. The same value until it changes. */
  get(): string | undefined;
  /** Calls `listener` after the choice may have changed; returns a function that stops it. */
  subscribe(listener: () => void): () => void;
}

/** Props for {@link WindowFormatLocale}. */
export interface WindowFormatLocaleProps {
  /** The system's region format, such as `en_GB.UTF-8`, or `undefined` until the shell has read it. */
  readonly regionFormat: string | undefined;
  /** The format chosen in Settings → Formats; without it the window follows the computer. */
  readonly chosenFormat?: ChosenFormat | undefined;
  readonly children: ReactNode;
}

const followsComputer: ChosenFormat = { get: () => undefined, subscribe: () => () => {} };

/**
 * The locale a window's times are written in (`kit.time-stamp`): the format chosen in Settings →
 * Formats, else the system's region format, as Formats' "Follow this computer" does, or the
 * browser's language until the shell has read it. Studio's window and the Inbox's and Messenger's
 * windows share it, so a time reads the same in each, and a new choice shows at once.
 *
 * @example
 * <WindowFormatLocale regionFormat="en_GB.UTF-8" chosenFormat={chosen}>{page}</WindowFormatLocale>
 */
export function WindowFormatLocale({
  regionFormat,
  chosenFormat = followsComputer,
  children,
}: WindowFormatLocaleProps) {
  const subscribe = useCallback(
    (listener: () => void) => chosenFormat.subscribe(listener),
    [chosenFormat],
  );
  const chosen = useSyncExternalStore(subscribe, () => chosenFormat.get());
  return (
    <FormatLocaleProvider locale={followedFormat(chosen, regionFormat ?? navigator.language)}>
      {children}
    </FormatLocaleProvider>
  );
}
