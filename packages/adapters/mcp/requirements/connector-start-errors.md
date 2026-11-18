# mcp.connector-start-errors

- Status: active
- Since: unreleased
- Source: HAL-12410 (UX check C2 on HAL-12390: the agent host says why a connector failed)

When a connector's program isn't on this computer, the Node program starter and the pinned launcher shall refuse the start with a `ProgramNotFoundError` that names the program as the connector's file wrote it (or `node`, when an npm runner's `node` is missing). When a secret a connector names isn't set, the stdio and HTTP connectors shall refuse with a `SecretNotSetError` that names the secret. Each error's message shall stay the one the start gave before, and neither shall hold a secret's value or the program's own output, so a caller can name the cause without passing on any other text.

## Examples

- Given a launch of the program `acme-missing` and a `PATH` without it,
  when the Node program starter starts it,
  then it rejects with a `ProgramNotFoundError` whose `program` is `acme-missing`.
- Given a pinned connector whose runner `npx` isn't on this computer,
  when its refused lookup is turned into an error,
  then it is a `ProgramNotFoundError` whose `program` is `npx`, and its message says Halonic didn't start the connector.
- Given a runner lookup refused for another reason, such as a relative path,
  when it is turned into an error,
  then it is a plain error, not a `ProgramNotFoundError`.
- Given a trusted connector whose `secretEnv` names `notes-token`, which isn't set,
  when its tools are listed,
  then it rejects with a `SecretNotSetError` whose `secretName` is `notes-token`.
