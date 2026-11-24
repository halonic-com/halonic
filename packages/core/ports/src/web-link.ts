/** A GitHub pull request page and nothing else: no user info, port, query or fragment. */
const gitHubPullRequest =
  /^https:\/\/github\.com\/(?!\.{1,2}\/)[\w.-]+\/(?!\.{1,2}\/)[\w.-]+\/pull\/\d+$/;

/** An `https` origin in lower case, with a port at most: no user info and no path. */
const httpsOrigin = /^https:\/\/[a-z0-9.-]+(:\d{1,5})?$/;

/** Printable ASCII with no space, so no tab, newline or other character a browser drops or rewrites. */
const printable = /^[\x21-\x7e]+$/;

/**
 * Whether a team status web link may open in the system browser
 * (requirement `ports.team-status`): a GitHub pull request page, or a page
 * on the connection's own Paperclip origin, port included. The provider
 * drops a link that fails it, and every opener checks it again.
 *
 * Core has no `URL` class, so this matches the link's canonical spelling
 * instead of parsing it. Anything a parser would read differently (upper
 * case, a default port, user info, a backslash, a `..` segment) is refused
 * rather than normalised, so a refusal is the only way to be wrong.
 *
 * @example
 * isAllowedWebLink("https://github.com/acme/app/pull/12", "https://paperclip.acme.test"); // true
 * isAllowedWebLink("https://github.com.evil.io/acme/app/pull/12", "https://paperclip.acme.test"); // false
 */
export function isAllowedWebLink(link: string, connectionOrigin: string | undefined): boolean {
  if (!printable.test(link)) return false;
  if (gitHubPullRequest.test(link)) return true;
  if (connectionOrigin === undefined || !httpsOrigin.test(connectionOrigin)) return false;
  if (!link.startsWith(connectionOrigin)) return false;
  const rest = link.slice(connectionOrigin.length);
  return rest === "" || rest.startsWith("/");
}
