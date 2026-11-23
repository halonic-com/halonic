# Decision: move the bridge's MCP tool server into the mcp package

- Approval: Paperclip task HAL-16751, PR 2 of the plan Owen posted on HAL-16737; Liam reviews the PR and signs this note there
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:M/U2ZyfNYWx8o4kYYVdgrP6hY4LkbXL+ZG5ih26+obYA6JSm9Z1drGBHIK4eIqPioMlShIlQIu8esh6TOTbRBQ==

The harness bridge's transport-free MCP tool server (`McpToolServer`, `McpToolSet` and its
JSON-RPC reading) moves, unchanged, to `@halonicjs/adapter-mcp`, as the new entry
`@halonicjs/adapter-mcp/server`, so the in-sandbox coding tool server (HAL-16737) uses the same
code as the bridge instead of its own copy. Nothing the bridge answers changes.

`packages/adapters/harness-bridge/src/json-rpc.test.ts` moves with the code it tests, to
`packages/adapters/mcp/src/server/json-rpc.test.ts`, and now verifies the new requirement
`mcp.tool-server`. So `harness-bridge.mcp` has those 9 tests fewer; its other tests stay. The
bridge's `mcp-tool-server.test.ts` keeps testing the bridge's tools through the shared server.

`tooling/check/policy.json` gains the `./server` entry for `@halonicjs/adapter-mcp` under
`extraExports`.

## Covers

- harness-bridge.mcp
- packages/adapters/harness-bridge/src/json-rpc.test.ts
- tooling/check/policy.json
