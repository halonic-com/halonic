/**
 * The words for blocked sites (microcopy 23.2), by a stable key, so the wording can change without
 * touching a component. `{name}` marks a value filled in at run time. Placeholder text until the
 * board approves the sandbox screens (HAL-1784); the keys stay.
 *
 * "No connection was made." replaces the design's "nothing reached them": on Windows a blocked
 * name may still be looked up outside the sandbox, so only "no connection" is true everywhere
 * (Julian, HAL-6208).
 */
export const blockedSitesWords = {
  "sandbox.blocked-sites.step-summary.one": "Blocked 1 site",
  "sandbox.blocked-sites.step-summary.many": "Blocked {count} sites",
  "sandbox.blocked-sites.title": "Blocked sites",
  "sandbox.blocked-sites.tries.one": "1 try",
  "sandbox.blocked-sites.tries.many": "{count} tries",
  "sandbox.blocked-sites.tries.over": "999+ tries",
  "sandbox.blocked-sites.more.one": "and 1 more site",
  "sandbox.blocked-sites.more.many": "and {count} more sites",
  "sandbox.blocked-sites.hint.why.one": "This site isn't in {agent}'s allowed sites.",
  "sandbox.blocked-sites.hint.why.many": "These sites aren't in {agent}'s allowed sites.",
  "sandbox.blocked-sites.no-connection": "No connection was made.",
  "sandbox.blocked-sites.hint.allow.one":
    "To allow it, add it to {agent}'s allowed sites. {agent} can then send that site anything it can read.",
  "sandbox.blocked-sites.hint.allow.many":
    "To allow one, add it to {agent}'s allowed sites. {agent} can then send that site anything it can read.",
  "sandbox.blocked-sites.action": "Open {agent}'s allowed sites",
  "sandbox.blocked-sites.phone-fix": "Fix this on your computer: {agent} › Harness › Allowed sites",
  "sandbox.blocked-sites.log-line": "Blocked: {site} ({tries})",
  "sandbox.blocked-sites.log-more.one": "and 1 more site",
  "sandbox.blocked-sites.log-more.many": "and {count} more sites",
  "sandbox.blocked-sites.banner-many":
    "The sandbox stopped {agent} from reaching {count} sites that aren't in its allowed sites, such as {site}.",
  "sandbox.blocked-sites.banner-action": "See the step",
} as const satisfies Readonly<Record<string, string>>;

/** A key of {@link blockedSitesWords}. */
export type BlockedSitesKey = keyof typeof blockedSitesWords;

/** The most tries a count shows; more reads "999+ tries". */
export const maxShownTries = 999;
