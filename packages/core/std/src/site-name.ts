// A site's name as a screen shows it: plain text, capped in length, with the
// registrable domain apart so it can stand out. Julian's conditions for
// showing blocked and allowed sites (HAL-1673): a look-alike name must never
// pass for the real one, and a long name must never push the real domain out
// of sight.

import { asciiHost } from "./ascii-host.ts";
import { registrableDomain } from "./registrable-domain.ts";

/** A site's name, split so a screen can show the registrable domain apart. */
export interface SiteName {
  /** The labels before the domain, with their last dot, such as `registry.`; empty when there are none. */
  readonly prefix: string;
  /** The registrable domain, such as `npmjs.org`, or the whole address of an IP host. */
  readonly domain: string;
  /** Whether the name was shortened to fit {@link siteNameMaxLength}; the text then holds `…`. */
  readonly cut: boolean;
}

/** The most characters `prefix` and `domain` hold together, `…` and escapes included. */
export const siteNameMaxLength = 64;

const ellipsis = "…";
/** The characters shown as they are; any other is escaped. */
const plainCharacter = /^[a-z0-9.\-:[\]]$/;
const ipv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/**
 * Writes a host name the way a screen shows a site (requirement
 * `std.site-name`). It is lowercased and loses a trailing dot. Any character
 * other than `a`–`z`, `0`–`9`, `.`, `-`, `:`, `[` and `]` is written as
 * `\u{…}`, so a Cyrillic letter, a full-width dot or a bidi mark can't look
 * like the real thing. Punycode (`xn--`) labels stay as they are, never
 * decoded. `domain` is the registrable domain from our pinned copy of the
 * public suffix list, private section included, looked up on the host's
 * ASCII form so a suffix written in Unicode (`公司.cn`) is found; an IP
 * address is all domain.
 *
 * A name longer than {@link siteNameMaxLength} keeps its domain whole and
 * loses the middle of its prefix, or all of it when the domain alone fills
 * the cap. A domain too long by itself loses its start.
 * Either way `cut` is set and the text holds `…`.
 *
 * @param host - the host as the sandbox reported it, without a port
 * @returns the plain-text parts to show; never a link
 *
 * @example
 * siteName("registry.npmjs.org.evil.example");
 * // => { prefix: "registry.npmjs.org.", domain: "evil.example", cut: false }
 */
export function siteName(host: string): SiteName {
  const plainHost = host.endsWith(".") ? host.slice(0, -1) : host;
  const tokens = shownCharacters(plainHost);
  const text = tokens.join("");
  const domainStart = isIpAddress(text) ? 0 : domainStartOf(tokens, plainHost);
  const prefixTokens = tokens.slice(0, domainStart);
  const domainTokens = tokens.slice(domainStart);
  const domain = domainTokens.join("");
  if (text.length <= siteNameMaxLength) {
    return { prefix: prefixTokens.join(""), domain, cut: false };
  }
  if (domain.length === siteNameMaxLength) return { prefix: "", domain, cut: true };
  if (domain.length < siteNameMaxLength) {
    return {
      prefix: middleCut(prefixTokens, siteNameMaxLength - domain.length),
      domain,
      cut: true,
    };
  }
  const kept = lastTokens(domainTokens, siteNameMaxLength - ellipsis.length);
  return { prefix: "", domain: ellipsis + kept.join(""), cut: true };
}

/** The host's characters as shown: ASCII letters lowercased, others plain or escaped. */
function shownCharacters(host: string): string[] {
  return Array.from(host, (character) => {
    const lower = /^[A-Z]$/.test(character) ? character.toLowerCase() : character;
    if (plainCharacter.test(lower)) return lower;
    const codePoint = lower.codePointAt(0) ?? 0;
    return `\\u{${codePoint.toString(16)}}`;
  });
}

function isIpAddress(text: string): boolean {
  return ipv4.test(text) || text.includes(":");
}

/**
 * Where the registrable domain starts in the shown tokens. The list is read
 * on the ASCII form, which has the same labels: only a plain `.` separates
 * them in both, and an escaped character is never one.
 */
function domainStartOf(tokens: readonly string[], host: string): number {
  const domainLabels = registrableDomain(asciiHost(host)).split(".").length;
  let dots = 0;
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    if (tokens[index] !== ".") continue;
    dots += 1;
    if (dots === domainLabels) return index + 1;
  }
  return 0;
}

/** `tokens` in at most `budget` characters, with `…` in place of the middle. Never splits an escape. */
function middleCut(tokens: readonly string[], budget: number): string {
  const room = budget - ellipsis.length;
  // The end gets the odd character, so a prefix keeps its last dot.
  const tail = lastTokens(tokens, Math.ceil(room / 2));
  const head = firstTokens(tokens, room - Math.ceil(room / 2));
  return head.join("") + ellipsis + tail.join("");
}

function firstTokens(tokens: readonly string[], budget: number): string[] {
  const kept: string[] = [];
  let characters = 0;
  for (const token of tokens) {
    if (characters + token.length > budget) break;
    kept.push(token);
    characters += token.length;
  }
  return kept;
}

function lastTokens(tokens: readonly string[], budget: number): string[] {
  return firstTokens([...tokens].reverse(), budget).reverse();
}
