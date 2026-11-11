import { siteName } from "@halonicjs/std";
import { Fragment, type ReactNode } from "react";
import { type BlockedSitesKey, blockedSitesWords, maxShownTries } from "./blocked-sites-words.ts";

const placeholder = /\{(\w+)\}/;

/**
 * The words of `key` with each `{name}` replaced by its value, which may be text or an element (a
 * site name keeps its bold domain inside a sentence).
 *
 * @throws Error when the words name a value that isn't given, so a missing value never shows as
 *   `{agent}`
 * @example
 * fill("sandbox.blocked-sites.action", { agent: "Writer" }); // "Open Writer's allowed sites"
 */
export function fill(key: BlockedSitesKey, values: Readonly<Record<string, ReactNode>> = {}) {
  // split() with a capture group gives text, name, text, name, …: the odd parts are names.
  const parts = blockedSitesWords[key].split(placeholder);
  return parts.map((part, index) => {
    if (index % 2 === 0) return part;
    if (!(part in values)) throw new Error(`${key}: no value for {${part}}`);
    const value = values[part];
    if (typeof value === "string" || typeof value === "number") return String(value);
    return <Fragment key={part}>{value}</Fragment>;
  });
}

/** The words of `key` as plain text, for words whose values are all text. */
export function fillText(
  key: BlockedSitesKey,
  values: Readonly<Record<string, string | number>> = {},
) {
  return fill(key, values).join("");
}

/** "1 try", "12 tries", or "999+ tries" past {@link maxShownTries}. */
export function triesText(tries: number): ReactNode {
  if (tries === 1) return fill("sandbox.blocked-sites.tries.one");
  if (tries > maxShownTries) return fill("sandbox.blocked-sites.tries.over");
  return fill("sandbox.blocked-sites.tries.many", { count: tries });
}

/** "Blocked 1 site" or "Blocked 3 sites". */
export function stepSummaryText(sites: number): ReactNode {
  return sites === 1
    ? fill("sandbox.blocked-sites.step-summary.one")
    : fill("sandbox.blocked-sites.step-summary.many", { count: sites });
}

/**
 * A site's name as plain text, never a link: the part before the registrable domain muted, the
 * domain in `fg` weight 500, capped and escaped by `siteName` (Julian's conditions, HAL-1673). It
 * can be selected and copied.
 *
 * @example
 * <SiteNameText host="registry.npmjs.org" /> // registry.**npmjs.org**
 */
export function SiteNameText({ host }: { readonly host: string }) {
  const { prefix, domain } = siteName(host);
  return (
    <span>
      {prefix === "" ? null : <span className="text-fg-muted">{prefix}</span>}
      <span className="font-medium text-fg">{domain}</span>
    </span>
  );
}
