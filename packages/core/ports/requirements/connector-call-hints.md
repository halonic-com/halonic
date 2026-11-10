# ports.connector-call-hints

- Status: active
- Since: 0.1.0
- Source: HAL-1532, part 4 of step 4(c) of the [HAL-186 implementation plan](/HAL/issues/HAL-186#document-implementation-plan); option (a) decided by Liam on HAL-3756; port list ADR, "Additive after the freeze: optional hints"

The `callTool` method of `ConnectorClient` shall take an optional third argument, `ConnectorCallOptions`, an object of hints, so that later hints need no further argument. Its one hint is `idempotencyKey`, the same for every attempt at one call. Every hint shall be optional, and an adapter whose `callTool` takes only a name and arguments shall still implement `ConnectorClient`, so the port's version stays 1.

## Examples

- Given a `ConnectorClient`,
  when `callTool` is called with a name and arguments only, or with `{ idempotencyKey: "r-acme:call-2" }` as well,
  then both compile.
- Given an adapter whose `callTool` takes only a name and arguments,
  when it is used as a `ConnectorClient`,
  then it compiles.
