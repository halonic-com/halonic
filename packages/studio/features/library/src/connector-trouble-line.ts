import type { ConnectorTrouble, ConnectorTroubleKind } from "@halonicjs/app";
import type { RefusalLinePart } from "./refusal-line.ts";

/**
 * The line a local integration's connector page shows when its last call failed, and its button
 * (lines 1–5 of the I7 card, approved by the team: Chief on HAL-19173). The service is the host the
 * call went to, set in code type, or the connector's name when the log names no host. A field
 * name is set in code type too: it was cleaned to path characters (`app.connector-trouble`).
 */
export const connectorTroubleWords = {
  look: "Let the assistant look",
  pasteToken: "Paste a new token",
  replyChanged: "answered differently than before",
  notAccepted: "didn't accept the token. It may be mistyped or revoked.",
  notAllowed: "Your token isn't allowed to do this. Check its permissions at ",
  notFound: (name: string) =>
    ` couldn't find what ${name} asked for. The service may have changed.`,
  slowDown: "asked Halonic to slow down. Try again in a few minutes.",
} as const;

/** The troubles whose line has **Let the assistant look**: the ones new code can fix. */
const lookKinds: ReadonlySet<ConnectorTroubleKind> = new Set(["reply-changed", "not-found"]);

/** How many field names the line names; the chat gets them all. */
const fieldsInLine = 3;

/**
 * Whether the trouble's line offers **Paste a new token**: the service refused the token (401),
 * which a new one in the page's Secrets section can fix.
 */
export function troubleHasPasteToken(trouble: ConnectorTrouble): boolean {
  return trouble.kind === "not-accepted";
}

/** Whether the trouble's line offers **Let the assistant look**. */
export function troubleHasLook(trouble: ConnectorTrouble): boolean {
  return lookKinds.has(trouble.kind);
}

/**
 * The trouble's line, in parts as a refusal's line is, for the connector named `name`.
 *
 * @example
 * troubleLine({ kind: "slow-down", host: "shop.example.com", fields: [] }, "Shop orders");
 * // [{ text: "shop.example.com", code: true }, { text: " asked Halonic to slow down. Try again in a few minutes." }]
 */
export function troubleLine(trouble: ConnectorTrouble, name: string): readonly RefusalLinePart[] {
  const words = connectorTroubleWords;
  const service: RefusalLinePart =
    trouble.host === "" ? { text: name } : { text: trouble.host, code: true };
  switch (trouble.kind) {
    case "reply-changed":
      return [service, { text: ` ${words.replyChanged}` }, ...goneFields(trouble.fields)];
    case "not-accepted":
      return [service, { text: ` ${words.notAccepted}` }];
    case "not-allowed":
      return [{ text: words.notAllowed }, service, { text: "." }];
    case "not-found":
      return [service, { text: words.notFound(name) }];
    case "slow-down":
      return [service, { text: ` ${words.slowDown}` }];
  }
}

/**
 * What **Let the assistant look** puts in the new Build chat's box, unsent: the line, the
 * integration's folder, the kind of trouble and the cleaned field names. It holds nothing the
 * service sent; the chat reads the rest from the request log.
 */
export function troubleAsk(trouble: ConnectorTrouble, name: string, folder: string): string {
  const line = troubleLine(trouble, name)
    .map((part) => (part.code === true ? `\`${part.text}\`` : part.text))
    .join("");
  const fields = trouble.fields.map((field) => `\`${field}\``).join(", ");
  return [
    line,
    "",
    `Integration: \`${folder}\``,
    `Trouble: \`${trouble.kind}\``,
    ...(fields === "" ? [] : [`Fields: ${fields}`]),
  ].join("\n");
}

/** " (the `a` and `b` fields are gone)." with at most {@link fieldsInLine} names, or "." with none. */
function goneFields(fields: readonly string[]): readonly RefusalLinePart[] {
  if (fields.length === 0) return [{ text: "." }];
  const named = fields.slice(0, fieldsInLine);
  const more = fields.length - named.length;
  const parts: RefusalLinePart[] = [{ text: " (the " }];
  named.forEach((field, index) => {
    if (index > 0) parts.push({ text: index === named.length - 1 && more === 0 ? " and " : ", " });
    parts.push({ text: field, code: true });
  });
  if (more > 0) parts.push({ text: ` and ${more} more` });
  parts.push({ text: fields.length === 1 ? " field is gone)." : " fields are gone)." });
  return parts;
}
