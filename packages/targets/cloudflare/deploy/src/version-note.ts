/** Cloudflare keeps at most this many characters of a version's message. */
const maxMessageLength = 100;
const shortLength = 12;
const notePattern = /^halonic ([0-9a-f]{12}) ([0-9a-f]{12})(?: |$)/;

/** What a deploy leaves on a version so `status` can say which commit and bundle is live. */
export interface VersionNote {
  readonly commit: string;
  readonly bundleHash: string;
}

/**
 * The message a deploy gives its version: `halonic <12 of the commit> <12 of the bundle hash>`,
 * then the caller's own text as far as it fits.
 */
export function versionNote(input: VersionNote & { readonly message?: string }): string {
  const head = `halonic ${input.commit.slice(0, shortLength)} ${input.bundleHash.slice(0, shortLength)}`;
  const text = input.message ? `${head} ${input.message}` : head;
  return text.slice(0, maxMessageLength);
}

/** The short commit and bundle hash a deploy left in a version's message, or `undefined` for any other message. */
export function parseVersionNote(message: string | undefined): VersionNote | undefined {
  const match = message === undefined ? null : notePattern.exec(message);
  if (!match) return undefined;
  const [, commit = "", bundleHash = ""] = match;
  return { commit, bundleHash };
}

/** True when `short` (what a note holds) is the start of `full`. */
export function startsLike(full: string, short: string): boolean {
  return short.length > 0 && full.toLowerCase().startsWith(short.toLowerCase());
}
