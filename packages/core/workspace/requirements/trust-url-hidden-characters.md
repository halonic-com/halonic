# workspace.trust-url-hidden-characters

- Status: active
- Since: unreleased
- Source: HAL-16338

When the trust content is written for a URL (`trustUrl`) that holds a control character (C0, DEL or C1) anywhere, or whitespace at its start or end, the workspace shall refuse it with "the URL has a hidden character, such as a line break, or a space at its start or end", so it can never be trusted: a URL parser drops such characters, so the URL it reaches could have user info or another host than the text that was checked.

## Examples

- Given the URL `https://ops@mcp.acme.test/` with a control character U+0001 before it,
  when it is written for the trust content,
  then it is refused, as the same URL without it is refused for its user info.
- Given `https://mcp.acme.test/` with a line break inside its host,
  when it is written for the trust content,
  then it is refused.
