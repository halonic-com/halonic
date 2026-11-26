import { createContext, type ReactNode, use } from "react";

/**
 * The format the window's dates and times follow, as a language and region tag such as `en-GB`;
 * undefined follows the runtime's own.
 */
const FormatLocaleContext = createContext<string | undefined>(undefined);

/** The props of `FormatLocaleProvider`. */
export interface FormatLocaleProviderProps {
  /** A language and region tag such as `en-GB`; undefined follows the runtime's own format. */
  readonly locale: string | undefined;
  readonly children: ReactNode;
}

/**
 * Sets the format the dates and times inside it follow (`kit.time-stamp`). The shell puts one at
 * each window's root, with the format chosen in Settings → Formats, else the system's region
 * format, since the webview's language isn't the user's region; a test sets it directly.
 *
 * @example
 * <FormatLocaleProvider locale={followedFormat(chosen, "en_GB.UTF-8")}>
 *   <App />
 * </FormatLocaleProvider>
 */
export function FormatLocaleProvider({ locale, children }: FormatLocaleProviderProps) {
  return <FormatLocaleContext value={locale}>{children}</FormatLocaleContext>;
}

/** The format this part of the window follows: see {@link FormatLocaleProvider}. */
export function useFormatLocale(): string | undefined {
  return use(FormatLocaleContext);
}

/**
 * A tag from outside, such as a system `LANG` like `en_GB.UTF-8`, as a tag Intl formats with:
 * `en-GB`. One Intl can't read gives undefined, so the runtime's own format is used.
 *
 * @example
 * formatTag("en_GB.UTF-8"); // "en-GB"
 */
export function formatTag(tag: string | undefined): string | undefined {
  if (tag === undefined) return undefined;
  const plain = tag.split(/[.@]/u)[0]?.replaceAll("_", "-") ?? "";
  try {
    const [supported] = Intl.DateTimeFormat.supportedLocalesOf(plain);
    return supported === undefined ? undefined : new Intl.Locale(supported).baseName;
  } catch (error) {
    // A tag that isn't one at all, such as `C`: the runtime's own format, as for an unknown one.
    if (error instanceof RangeError) return undefined;
    throw error;
  }
}

/**
 * The format a window follows: the one chosen in Settings → Formats, else the computer's region
 * format (`region`), each read with {@link formatTag}. An undefined `chosen` is Formats' "Follow
 * this computer".
 *
 * @example
 * followedFormat("de-DE", "en_US.UTF-8"); // "de-DE"
 * followedFormat(undefined, "en_US.UTF-8"); // "en-US"
 */
export function followedFormat(
  chosen: string | undefined,
  region: string | undefined,
): string | undefined {
  return formatTag(chosen) ?? formatTag(region);
}
