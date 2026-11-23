# Decision: an HTTP connector lists its tools only with a trust grant

- Approval: HAL-16909, Liam approves this note in review (he owns `ports` and the connector rules)
- Kind: internal
- Task: HAL-16909

## What changes

Without a trust grant, the MCP HTTP connector's `listTools` now throws before it starts a
session, the way `callTool` already did and the way a `stdio` connector refuses both. The memory
adapter's `http` stand-in follows the same rule, and the port's documentation says so.

`mcp.http-connector` and `contracts.connector-client` said an untrusted `http` connector still
lists its tools; they now say it refuses to. The contract case that listed an untrusted `http`
connector's tools now expects the listing to throw, and still expects every call to throw and
nothing to reach the server. The draft `ports.connector-trust-enforcement` gains the same rule.

## Why

Hardening: one rule for both server kinds, so a connector does nothing for a workspace a person
hasn't trusted. Every place that lists a connector's tools for a person (the CLI's `tools review`,
Studio's listed tools, the agent host) already checks trust first, and the engine reports a refused
listing like any other, so nothing a user does stops working.

No test was weakened: the contract case checks the same call and the same server, now with a
stricter expectation, and the HTTP connector gains a regression test.

## Covers

- mcp.http-connector
- contracts.connector-client
