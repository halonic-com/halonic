// The words of a plugin's page, from the plugin screens design section 7,
// microcopy 24 T12 and the UX acceptance checklist 6 (HAL-1739, HAL-751,
// HAL-1952). The plugin's name, version, description, tools and titles are
// only ever a value in these lines.

import type { PluginToolRisk } from "./plugin-pages.ts";

/** The kind before the plugin's name, in small caps, and the item kind's label. */
export const PLUGIN = "Plugin";

/** The button that opens the plugin's panel in its tab. */
export const OPEN_PANEL = "Open panel";

/** The status box's word while the plugin is on. */
export const ON = "On";

/** The status box's word while the plugin isn't trusted yet (T12). */
export const NOT_TRUSTED_YET = "Not trusted yet";

/** The status box's word while the plugin changed since the person trusted it (T12). */
export function changedSince(date: string | undefined): string {
  return date === undefined
    ? "Changed since you trusted it"
    : `Changed since you trusted it on ${date}`;
}

/** The title of the Callout of a plugin that can't load (T12). */
export function cantLoadTitle(name: string): string {
  return `${name} couldn't load.`;
}

/** The text of the Callout of a plugin that can't load (T12). */
export const CANT_LOAD_LINE =
  "Its tools, commands and cards are off until its plugin.yaml is fixed.";

/** Where a plugin came from, as the page and the trust check say it. */
export type PluginOrigin =
  | { readonly kind: "folder"; readonly path: string }
  | { readonly kind: "git"; readonly address: string; readonly commit: string };

/**
 * The line under **On**: "Trusted on 3 Nov · version 1.2.0 · from github.com/example/weather".
 * A part Halonic doesn't know is left out.
 */
export function onLine(
  trusted: string | undefined,
  version: string,
  origin: PluginOrigin | undefined,
): string {
  return [
    trusted === undefined ? undefined : `Trusted on ${trusted}`,
    `version ${version}`,
    origin === undefined ? undefined : `from ${originText(origin)}`,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}

/** A git address without `https://` and `.git`, or a folder's path as it was given. */
export function originText(origin: PluginOrigin): string {
  if (origin.kind === "folder") return origin.path;
  return origin.address.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/\.git\/?$/, "");
}

const shortMonths = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * The day of an ISO time, as the page says it: "3 Nov", with the year when it isn't this year's.
 * Text that isn't a time gives `undefined`, so the line leaves the date out.
 *
 * @example
 * trustedDay("2026-11-03T09:00:00Z", new Date(2026, 10, 12)); // "3 Nov"
 */
export function trustedDay(iso: string | undefined, now: Date): string | undefined {
  if (iso === undefined) return undefined;
  const day = new Date(iso);
  if (Number.isNaN(day.getTime())) return undefined;
  const date = `${day.getDate()} ${shortMonths[day.getMonth()]}`;
  return day.getFullYear() === now.getFullYear() ? date : `${date} ${day.getFullYear()}`;
}

/** The section that lists what the plugin adds. */
export const WHAT_IT_ADDS = "What it adds";

/** The group of the plugin's tools in What it adds. */
export const TOOLS_FOR_AGENTS = "Tools for agents";

/** The line under the tools: a backend's tools reach agents only through a connector (CHECK P6). */
export const TOOLS_LINE = "Give them to an agent with a connector.";

/** The risk chips of a tool (T7). */
export const RISK_WORDS: Readonly<Record<PluginToolRisk, string>> = {
  read: "Reads",
  write: "Changes things",
  send: "Sends",
};

/** The groups after the tools, each title followed by where it shows. */
export const ADDS_COMMAND = "Command";
export const ADDS_COMMANDS = "Commands";
export const ADDS_CARD = "Card";
export const ADDS_CARDS = "Cards";
export const ADDS_PANEL = "Panel";
export const IN_CTRL_K = "in Ctrl K";
export const ON_HOME = "on Home";
export const OPENS_IN_A_TAB = "opens in a tab";

/** A plugin's own text in quotes, as every description of a plugin shows (checklist 1, D 2). */
export function quoted(text: string): string {
  return `“${text}”`;
}
