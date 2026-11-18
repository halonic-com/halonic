# Decision: a connector failure with a reason is a kinded error in Studio

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12410
- Kind: user-visible

Sofia's UX check (HAL-12390, row C2) asks the connector page to say why a local program's tools
couldn't be listed (program missing, secret missing or refused, program stopped), instead of
"Halonic ran into a problem it can't explain yet." with a **Try again** that can't help.

The agent host now adds a `reason` to `connector_failed` when the error's type says why
(`agent-host.connector-failure-reasons`, new), and the stand-in connector in `agent-host-client`
throws that answer as a `ConnectorFailedError`, a `KindedError` with the cause and its one name
(`agent-host-client.connector-failure`, new). A secret that isn't set before the stand-in calls the
host gives the same error, with the same message as before.

`agent-host-client.connector` said that "a refusal shall throw the host's status, kind and
message". It now names the one exception, a `connector_failed` refusal with a reason; the host's
status and kind stay on the error's `cause`. No test of it changes, and none is removed.

## Covers

- agent-host-client.connector
