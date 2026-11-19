# agent-host.connector-failure-reasons

- Status: active
- Since: unreleased
- Source: HAL-12410 (UX check C2 on HAL-12390: the agent host says why a connector failed)

When a connector's start or call fails, the agent host shall answer 502 `connector_failed` with its fixed message and, when the error's type says why, a `reason` Studio can word: `program-missing` with the `program` that isn't on this computer, `secret-missing` with the name of the `secret` that isn't set, `secret-refused` when the server refused the secret (HTTP 401 or 403), and `stopped` when the program ended or didn't answer in time. For any other failure it shall answer without a `reason`. The answer shall never hold the error's own text, the program's output or a secret's value; the detail goes only to the host's log.

## Examples

- Given an open connector whose program `npx` isn't on this computer,
  when Studio lists its tools,
  then the answer is 502 `connector_failed` with `reason` `program-missing` and `program` `npx`.
- Given an open connector whose secret `NOTES_TOKEN` isn't set,
  when Studio lists its tools,
  then the answer has `reason` `secret-missing` and `secret` `NOTES_TOKEN`, and no value.
- Given an open connector whose server answers 401,
  when Studio calls a tool,
  then the answer has `reason` `secret-refused`.
- Given an open connector whose program ends or doesn't answer in time,
  when Studio calls a tool,
  then the answer has `reason` `stopped`.
- Given any other failure,
  when Studio lists the tools,
  then the answer has no `reason`.
