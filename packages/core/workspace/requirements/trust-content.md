# workspace.trust-content

- Status: active
- Since: 0.1.0
- Source: HAL-188 (HAL-65 section 4, and the "Fingerprint coverage" rules from HAL-675); HAL-1954

The workspace package shall build a workspace's trust content from its connectors, holding everything that decides which programs run and where they talk to: the transport kind; for a program, the command and the absolute path it resolves to, the arguments as a list, the working folder relative to the workspace, and every environment variable with its value as written; for a remote server, the full URL with its host in ASCII and every header; the secret names, never their values; the tool lists and `local`; and every other field of the connector file as written, apart from the known fields. Only a connector's name and description stay out. A connector whose URL has user info, a backslash before its query, or no `//` after `http:` or `https:` shall be refused instead, with the reason and without its URL, and content with a refused connector shall have no fingerprint.

## Examples

- Given a trusted program connector, when `NODE_OPTIONS`, `PYTHONSTARTUP` or `LD_PRELOAD` is added to its variables, or set from a secret, then the content changes.
- Given a program connector, when its working folder, command or an argument changes, then the content changes; the arguments `["a b"]` and `["a", "b"]` differ.
- Given a remote connector, when the URL's path, scheme, port or query changes on the same host, or the host becomes a look-alike, then the content changes.
- Given a connector, when it switches from `http` to `stdio`, then the content changes.
- Given a connector, when a tool leaves `approve`, the `allow` list grows or goes away, or the connector is marked `local`, then the content changes.
- Given a connector, when a field the schema doesn't know yet is added to it or to its tools, then the content changes.
- Given a connector, when a field the schema doesn't know yet is named like a known one (`settings`, `transport`, `path`), then the content changes and the known field keeps its value.
- Given a remote connector, when its URL is `https://evil.test\@mcp.acme.test/` or `https://ops:pw@mcp.acme.test/`, then the connector is refused, the password isn't in the content, and the content has no fingerprint.
- Given a connector, when only its name, its description, the order of its tool names or the order of connectors changes, or its folder or host is written another way (`./tools/..`, capitals, Unicode or Punycode), then the content stays the same.
- Given a secret variable `API_KEY` from the secret `files-key`, then the content shows `‹secret files-key›` and never the secret's value.
