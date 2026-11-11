// Finds a host's registrable domain with our pinned copy of the public suffix
// list (P7 on HAL-1782): the part a person or company registered, such as
// `example.co.uk` in `api.example.co.uk`. The list's own algorithm is at
// https://github.com/publicsuffix/list/wiki/Format.

import { publicSuffixRules } from "./public-suffixes.generated.ts";

/** The list's rules, split by kind. */
interface SuffixRules {
  readonly exact: ReadonlySet<string>;
  /** `*.ck` is kept as `ck`: any one label under it is a suffix. */
  readonly wildcard: ReadonlySet<string>;
  /** `!www.ck` is kept as `www.ck`: not a suffix, though a wildcard says so. */
  readonly exception: ReadonlySet<string>;
}

// Split on first use, not when the package loads: most programs that use std
// never show a site. The rules never change while a program runs.
let rules: SuffixRules | undefined;

/**
 * The registrable domain of `host`: its public suffix and one label before
 * it. A host that is a public suffix itself, or has a single label, is its
 * own domain. A suffix the list doesn't know is the last label, as the list
 * says. Labels are compared as they are, so pass a lowercase ASCII host.
 *
 * @param host - a lowercase host name in ASCII form, without a trailing dot
 * @returns the registrable domain, at the end of `host`
 */
export function registrableDomain(host: string): string {
  const labels = host.split(".");
  const suffixLength = publicSuffixLength(labels);
  if (labels.length <= suffixLength) return host;
  return labels.slice(-(suffixLength + 1)).join(".");
}

/** How many labels at the end of `labels` are the public suffix. */
function publicSuffixLength(labels: readonly string[]): number {
  const { exact, wildcard, exception } = suffixRules();
  // From the longest candidate to the shortest, so the first rule that
  // matches is the longest. An exception rule wins over the wildcard it
  // undoes: its suffix is the candidate without its first label.
  for (let start = 0; start < labels.length; start += 1) {
    const candidate = labels.slice(start).join(".");
    if (exception.has(candidate)) return labels.length - start - 1;
    if (exact.has(candidate)) return labels.length - start;
    const parent = labels.slice(start + 1).join(".");
    if (start + 1 < labels.length && wildcard.has(parent)) return labels.length - start;
  }
  return 1;
}

function suffixRules(): SuffixRules {
  rules ??= splitRules(publicSuffixRules);
  return rules;
}

function splitRules(text: string): SuffixRules {
  const exact = new Set<string>();
  const wildcard = new Set<string>();
  const exception = new Set<string>();
  for (const rule of text.split("\n")) {
    if (rule === "") continue;
    if (rule.startsWith("!")) exception.add(rule.slice(1));
    else if (rule.startsWith("*.")) wildcard.add(rule.slice(2));
    else exact.add(rule);
  }
  return { exact, wildcard, exception };
}
