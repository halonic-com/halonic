// The lines under a trust check row (cli-output 3.5): a label and its value,
// the values lined up past the longest label. `trust-check-rows.ts` builds
// the rows themselves.

import { type ConnectorTrustFields, connectorTrustFields } from "@halonicjs/app";
import type { ConnectorTrustContent } from "@halonicjs/workspace";
import { columnGap } from "../messages/columns.ts";
import { markPart, type Phrase, phrase, visibleLength } from "../messages/phrase.ts";
import { trustMessages } from "../messages/trust.ts";
import { printable } from "./printable.ts";

/**
 * The first column: a row's id, at least as wide as cli-output 3.5's example,
 * so short ids line up the same way. Lines under a row start past it.
 */
export const firstColumn = 14;

/** Where a section's rows start. */
export const rowIndent = "  ";

/** Where the lines under a row start: under its second column. */
export const underRow = " ".repeat(rowIndent.length + firstColumn);

/** A line under a row: its label, empty to continue the one above, and its value. */
export type LabelledLine = readonly [label: Phrase, value: Phrase];

/** "Allowed sites" and the first site, then every other site under it. */
export function siteLines(sites: readonly string[]): LabelledLine[] {
  return sites.map((site, index) => [
    index === 0 ? trustMessages.allowedSites().phrase : phrase``,
    shownSite(site),
  ]);
}

/**
 * The lines every connector's row has under it when its file sets them: "Offered tools" when
 * `tools.allow` limits them, "Asks first" and "Without asking" with its tool lists, "Headers" with
 * an HTTP connector's headers and "Other settings" with each field the schema doesn't know, one
 * entry per line. All of them are in the fingerprint, so the check shows them (HAL-16336).
 */
export function connectorLines(connector: ConnectorTrustContent): LabelledLine[] {
  const fields = connectorTrustFields(connector);
  return [
    ...toolLines(fields),
    ...entryLines(trustMessages.headers().phrase, fields.headers),
    ...entryLines(trustMessages.otherSettings().phrase, fields.otherSettings),
  ];
}

function toolLines(fields: ConnectorTrustFields): LabelledLine[] {
  const names = (tools: readonly string[]) => phrase`${printable(tools.join(", "))}`;
  return [
    ...(fields.offeredTools === undefined
      ? []
      : [[trustMessages.offeredTools().phrase, names(fields.offeredTools)] as const]),
    ...(fields.asksFirst === "all"
      ? [[trustMessages.asksFirst().phrase, trustMessages.everyTool().phrase] as const]
      : []),
    ...(fields.asksFirst !== "all" && fields.asksFirst.length > 0
      ? [[trustMessages.asksFirst().phrase, names(fields.asksFirst)] as const]
      : []),
    ...(fields.withoutAsking.length === 0
      ? []
      : [[trustMessages.withoutAsking().phrase, names(fields.withoutAsking)] as const]),
  ];
}

/** The label and the first entry, then every other entry under it, escaped. */
function entryLines(label: Phrase, entries: readonly string[]): LabelledLine[] {
  return entries.map((entry, index) => [
    index === 0 ? label : phrase``,
    phrase`${printable(entry)}`,
  ]);
}

/** The lines under a row, their values lined up past the longest label. */
export function labelledLines(lines: readonly LabelledLine[]): Phrase[] {
  const width = Math.max(0, ...lines.map(([label]) => visibleLength(label, true)));
  return lines.map(([label, value]) => {
    const padding = " ".repeat(width - visibleLength(label, true) + columnGap);
    return phrase`${underRow}${label}${padding}${value}`;
  });
}

/** A site in its stored form, with its note: a wildcard names its domain, Punycode is flagged. */
function shownSite(site: string): Phrase {
  const notes = [
    ...(site.startsWith("*.")
      ? [trustMessages.everySiteUnder(printable(site.slice(2))).phrase]
      : []),
    ...(site.split(".").some((label) => label.startsWith("xn--"))
      ? [trustMessages.nonLatin().phrase]
      : []),
  ];
  return notes.reduce(
    (shown, note) => phrase`${shown} ${markPart("separator")} ${note}`,
    phrase`${printable(site)}`,
  );
}

/**
 * What a connector's row shows after its id, when it isn't a program, a local integration or a
 * plugin: an HTTP connector's address, a Paperclip connector's connection as
 * "paperclip · acme-ops" (HAL-19787), or else its transport's name.
 */
export function transportAddress(connector: ConnectorTrustContent): Phrase {
  const setting = (name: string) => {
    const value = connector.settings[name];
    return printable(typeof value === "string" ? value : "");
  };
  if (connector.transport === "http") return phrase`${setting("url")}`;
  if (connector.transport === "paperclip") {
    return phrase`${printable(connector.transport)} ${markPart("separator")} ${setting("connection")}`;
  }
  return phrase`${printable(connector.transport)}`;
}
