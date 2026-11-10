# contracts.connector-call-hints

- Status: active
- Since: 0.1.0
- Source: HAL-1532, part 4 of step 4(c) of the [HAL-186 implementation plan](/HAL/issues/HAL-186#document-implementation-plan); Liam's conditions on HAL-3756 (a contract case that an adapter accepts the hint and still works when it ignores it); `ports.connector-call-hints`

Where an adapter implements `ConnectorFactory`, its client shall accept `callTool` with an `idempotencyKey` hint, and shall answer the call as it answers the same call without the hint: the same text, and the same tool and arguments reaching the server or the service, with no hint added to the arguments.

## Examples

- Given a trusted `http` or `stdio` connector,
  when `update_note` is called with `{ idempotencyKey: "r-acme:call-2" }`,
  then it returns the server's text for `update_note` and those arguments, and the server got exactly those arguments.
- Given the built-in `google` connector,
  when its `read` tool is called with the hint,
  then it is answered as without the hint.
