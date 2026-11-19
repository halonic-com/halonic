# agent-host-client.connector-failure

- Status: active
- Since: unreleased
- Source: HAL-12410 (UX check C2 on HAL-12390: a page words why a connector failed)

When the agent host answers a connector route with `connector_failed` and a `reason` (`agent-host.connector-failure-reasons`), the stand-in connector shall throw a `ConnectorFailedError`: a kinded error whose `failure` holds the reason and its name (`program` or `secret`), with the host's refusal as its `cause`. Its kind shall be `unavailable` for `program-missing` and `stopped`, `invalid_input` for `secret-missing` and `unauthenticated` for `secret-refused`, and its message a plain sentence safe to show. When a secret the connector names isn't set before it opens, the stand-in shall throw the same error with `secret-missing`. A `connector_failed` answer without a known reason shall stay an `AgentHostError`.

## Examples

- Given the host answers the tools request with `connector_failed`, `program-missing` and `npx`,
  when the engine lists the tools,
  then it throws a `ConnectorFailedError` of kind `unavailable` whose `failure` is `program-missing` with `npx`.
- Given a connector whose secret `notes-key` isn't set,
  when the engine lists its tools,
  then it throws a `ConnectorFailedError` of kind `invalid_input` with `secret-missing` and `notes-key`, without calling the host.
- Given the host answers `connector_failed` without a reason,
  when the engine calls a tool,
  then it throws an `AgentHostError` with status 502 and kind `connector_failed`.
