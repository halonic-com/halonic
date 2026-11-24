/** A GitHub pull request's path: `/<owner>/<repo>/pull/<number>`, nothing more. */
const pullRequestPath = /^\/[\w.-]+\/[\w.-]+\/pull\/\d+$/;

const github = "https://github.com";

/**
 * Whether a web page a provider gave may open in the system browser
 * (requirement `ports.web-link`). The provider drops a link that fails, and
 * each opener, desktop and phone, checks it again before it opens. Only two
 * kinds pass: a GitHub pull request page, and a page at the connection's own
 * Paperclip origin, port included. Both need `https:` and no user name or
 * password. The host is compared whole, never by its ending.
 *
 * It takes links its caller parsed with the platform's own `URL` (the core
 * has no `URL` to call), so the check and the browser read a link the same
 * way. A text that doesn't parse is never a link to open.
 *
 * @example
 * const link = URL.canParse(text) ? new URL(text) : undefined;
 * if (link !== undefined && isAllowedWebLink(link, new URL(connection))) open(link.href);
 */
export function isAllowedWebLink(link: URL, connection: URL): boolean {
  if (link.protocol !== "https:") return false;
  if (link.username !== "" || link.password !== "") return false;
  if (link.origin === github) return pullRequestPath.test(link.pathname);
  return link.origin === connection.origin;
}
