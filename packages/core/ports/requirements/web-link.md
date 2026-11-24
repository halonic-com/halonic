# ports.web-link

- Status: active
- Since: unreleased
- Source: phase 2 architecture note, section 1.5 (HAL-17511), with Julian's security read on HAL-17540; approved with the phase 2 card by the board on HAL-17544 (24 Nov); task HAL-17623

The ports package shall have one check, `isAllowedWebLink(link, connection)`, that the provider and every opener use before a web page a provider gave opens in the system browser. It shall take a link and the connection's origin as its caller parsed them with the platform's own `URL`, so the check and the browser read a link the same way, and shall allow the link only when it uses `https:`, has no user name or password, and either its origin is exactly `https://github.com` and its path is `/<owner>/<repo>/pull/<number>` and nothing more, or its origin equals the connection's origin, port included.

## Examples

- Given `https://github.com/acme/rockets/pull/12`,
  when it is checked,
  then it is allowed.
- Given a page at the connection's own origin,
  when it is checked,
  then it is allowed.
- Given `http:`, a user name or password, `github.com.evil.io`, `evil.io/github.com`, a GitHub page that isn't a pull request, or the connection's host on another port,
  when it is checked,
  then it is refused.
