import type { DisplayPref } from "../display-prefs.ts";
import { settingsWhere } from "../where.ts";

/**
 * The formats Settings offers besides following the computer: a short fixed list of language and
 * region tags (flow-settings 5, Elena's review 5). The tag is stored, never its name.
 */
export const formatTags = [
  "cs-CZ",
  "da-DK",
  "de-AT",
  "de-CH",
  "de-DE",
  "en-AU",
  "en-CA",
  "en-GB",
  "en-IE",
  "en-IN",
  "en-NZ",
  "en-US",
  "es-ES",
  "es-MX",
  "fi-FI",
  "fr-BE",
  "fr-CA",
  "fr-CH",
  "fr-FR",
  "it-IT",
  "ja-JP",
  "ko-KR",
  "nb-NO",
  "nl-BE",
  "nl-NL",
  "pl-PL",
  "pt-BR",
  "pt-PT",
  "sv-SE",
  "tr-TR",
  "uk-UA",
  "zh-CN",
] as const;

/** `follow` follows the computer's region format (the browser's language when served), else a tag. */
export type FormatChoice = "follow" | (typeof formatTags)[number];

/**
 * Settings → Formats → Format (`settings.formats-format`), one setting for numbers, dates and
 * money. Following the computer is the default (HAL-119); a stored tag that isn't in the list
 * follows the computer too.
 */
export const formatPref: DisplayPref<FormatChoice> = {
  key: "formats.format",
  fallback: "follow",
  read: (stored) => (stored === "follow" ? "follow" : formatTags.find((tag) => tag === stored)),
};

/** One option of the Format select: the stored choice and the name it shows. */
export interface FormatOption {
  readonly value: FormatChoice;
  readonly label: string;
}

/** What the window knows about where it formats. */
export interface FormatPlace {
  /**
   * The format "Follow" uses: in the desktop app the system's region format, which the desktop
   * shell reads, not the webview's language; in a browser, the browser's language.
   */
  readonly followTag: string;
  /** Whether the window is the desktop app or a browser the computer running Halonic serves. */
  readonly place: "app" | "served";
  /** The phone's Settings page names the served window "this phone", not "this browser". */
  readonly surface?: "window" | "phone";
}

/** The language the Studio's words are in, and so the names of the formats: English for now. */
const studioLanguage = "en";

/**
 * The followed tag as a plain language and region tag Intl can name and format with. It comes
 * from outside: a system `LANG` like `en_GB.UTF-8`, or a tag with extensions like
 * `en-GB-u-ca-buddhist`. One Intl can't read follows this window's own format instead of throwing.
 *
 * @example
 * usableTag("en_GB.UTF-8"); // "en-GB"
 * usableTag("en-GB-u-ca-buddhist"); // "en-GB"
 */
export function usableTag(tag: string): string {
  const posix = tag.split(/[.@]/u)[0]?.replaceAll("_", "-") ?? "";
  try {
    return new Intl.Locale(posix).baseName;
  } catch {
    return new Intl.Locale(new Intl.DateTimeFormat().resolvedOptions().locale).baseName;
  }
}

/**
 * The Format select's options: first "Follow this computer: English (UK)" ("Follow
 * this browser: …" when served, "Follow this phone: …" on the phone's page), then each tag this window can format, by name, sorted by name.
 * The followed name is the short one, so the line fits the select in Settings' 360px column.
 *
 * @example
 * formatOptions({ followTag: "en-GB", place: "app" })[0];
 * // { value: "follow", label: "Follow this computer: English (UK)" }
 */
export function formatOptions(where: FormatPlace): FormatOption[] {
  const names = new Intl.DisplayNames([studioLanguage], {
    type: "language",
    languageDisplay: "standard",
  });
  const nameOf = (tag: string) => names.of(tag) ?? tag;
  const formattable = new Set(Intl.DateTimeFormat.supportedLocalesOf([...formatTags]));
  const collator = new Intl.Collator(studioLanguage);
  const tags = formatTags
    .filter((tag) => formattable.has(tag))
    .map((tag) => ({ value: tag, label: nameOf(tag) }))
    .sort((left, right) => collator.compare(left.label, right.label));
  const follows = `this ${settingsWhere(where.place, where.surface ?? "window")}`;
  const shortNames = new Intl.DisplayNames([studioLanguage], {
    type: "language",
    languageDisplay: "standard",
    style: "short",
  });
  const followTag = usableTag(where.followTag);
  const followed = shortNames.of(followTag) ?? followTag;
  return [{ value: "follow", label: `Follow ${follows}: ${followed}` }, ...tags];
}

/** The tag a choice formats with: the one followed, or the one chosen. */
export function formatLocale(choice: FormatChoice, followTag: string): string {
  return choice === "follow" ? usableTag(followTag) : choice;
}

/**
 * The example line under the Format select: a number with a thousands separator and decimals,
 * and today's date and time, "12,345.60 · Tue 17 Nov, 08:00" for `en-GB`, "12.345,60 · di 17 nov,
 * 08:00" for `nl-NL`. `now` is today unless a test gives a fixed time.
 */
export function formatExample(locale: string, now: Date = new Date()): string {
  const tag = usableTag(locale);
  const number = new Intl.NumberFormat(tag, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(12345.6);
  const date = new Intl.DateTimeFormat(tag, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
  return `${number} · ${date}`;
}
