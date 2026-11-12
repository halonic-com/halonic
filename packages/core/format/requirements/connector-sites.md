# format.connector-sites

- Status: active
- Since: 0.1.0
- Source: HAL-2310 (D45: workspace stdio connectors run in the agent sandbox, board on HAL-2257 Q3; decided by Liam on HAL-2303)

When `parseFile` reads a connector file, the format shall accept `transport.stdio.sites`, an optional list of at most 50 sites the local program may reach when it runs in a sandbox, each checked by the same rule as the agent file's `allowedSites` (`format.agent-sandbox-fields`): a host name with at least two labels, or `*.` and such a domain, and no bare `*`, address, port, scheme, path or local-network name. A refused entry shall fail at its own path. A connector without `sites` shall read as before, and `sites` shall not be accepted on any other transport.

## Examples

- Given a stdio connector with `sites: [API.Example.com, "*.docs.example.com"]`,
  when it is parsed,
  then it passes and keeps both sites as written.
- Given `sites: [api.example.com, "*", "*.com", 127.0.0.1, "[::1]", localhost, "example.com:443"]`,
  when it is parsed,
  then each entry but the first fails at its own index.
- Given 51 sites,
  when it is parsed,
  then `transport.stdio.sites` fails at the list with "Name at most 50 sites", while 50 sites pass.
- Given an `http` connector with `sites`,
  when it is parsed,
  then it fails.
