import { createContext, use } from "react";

/**
 * The format the window's dates and times follow, as a language and region tag such as `en-GB`;
 * undefined follows the runtime's own. The shell gives the system's region format, as Settings →
 * Formats' "Follow this computer" does, since the webview's language isn't the user's region.
 */
export const FormatLocale = createContext<string | undefined>(undefined);

/** The format this part of the window follows: see {@link FormatLocale}. */
export function useFormatLocale(): string | undefined {
  return use(FormatLocale);
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
