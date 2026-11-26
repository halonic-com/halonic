import { FormatLocale, formatTag } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";

/** Props for {@link WindowFormatLocale}. */
export interface WindowFormatLocaleProps {
  /** The system's region format, such as `en_GB.UTF-8`, or `undefined` until the shell has read it. */
  readonly regionFormat: string | undefined;
  readonly children: ReactNode;
}

/**
 * The locale a window's times are written in (`kit.time-stamp`): the system's region format, as
 * Formats' "Follow this computer" does, or the browser's language until the shell has read it.
 * Studio's window and every focused app's window share it, so a time reads the same in both.
 *
 * @example
 * <WindowFormatLocale regionFormat="en_GB.UTF-8">{page}</WindowFormatLocale>
 */
export function WindowFormatLocale({ regionFormat, children }: WindowFormatLocaleProps) {
  return (
    <FormatLocale value={formatTag(regionFormat ?? navigator.language)}>{children}</FormatLocale>
  );
}
