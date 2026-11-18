# Decision: the bridge's MCP server reports its internal errors to the run

- Approval: HAL-12564, follow-up of HAL-11272, reviewed by the CTO (maintainer)
- Kind: user-visible

## What changes

`harness-bridge.mcp` gets one sentence and one example. When listing or checking the tools fails,
the program still gets an internal JSON-RPC error without the failure's own text, as before. The
failure itself now goes to the run's `reportError`, without the run token, instead of being dropped.

The MCP tool server takes a required `reportError`, and a bridge route gets one in its request
context. It goes to the same hook the bridge already uses for a route that throws, so the run
token is replaced the same way and a hook that throws can't break the reply.

## Why

The tool server caught every error with an empty `catch` and recorded nothing, so the cause of a
failed `tools/list` or tool check was lost. Halonic's rule is that errors are never swallowed.
`reportError` already exists for failures the bridge doesn't name to the program, and with HAL-11272
it lands in the run log as `bridge.failed`, so the MCP server uses it too rather than a new path.

The reply to the program doesn't change, so a program sees nothing new. What a user may see is a
`bridge.failed` line in the run log where there was nothing before.

## Tests

No test was weakened or removed. The tool server's tests check that a failed listing or check is
reported and that a refused call or a tool's own error is not; the route's test checks, over HTTP,
that the run hears the cause without the run token.

## Covers

- harness-bridge.mcp
