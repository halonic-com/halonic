/**
 * An e-mail address: a local part, `@`, then a domain whose last label is
 * letters only, so a package version such as `zod@3.23.8` is not an
 * address. The lookbehind makes a match start only where a local part
 * starts; without it, a long run with no `@` is tried again from every
 * character.
 */
const EMAIL =
  /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,})(?![A-Za-z0-9-])/g;

/** The domains kept for examples (RFC 2606). Only these are safe to offer. */
const EXAMPLE_DOMAINS = ["example.com", "example.org", "example.net"];

/** True for an example domain or a domain under one, such as `mail.example.com`. */
function isExampleDomain(domain: string): boolean {
  const lower = domain.toLowerCase();
  return EXAMPLE_DOMAINS.some((example) => lower === example || lower.endsWith(`.${example}`));
}

/** The e-mail addresses on a line that are not on an example domain. */
export function findRealEmails(line: string): string[] {
  return [...line.matchAll(EMAIL)]
    .filter((match) => !isExampleDomain(match[1] ?? ""))
    .map((match) => match[0]);
}
