# mcp.connector-start-errors

- Status: active
- Since: unreleased
- Source: HAL-12410 (UX check C2 on HAL-12390: the agent host says why a connector failed); HAL-13731 (Nina's C220 check on HAL-13670: a program that stops right after it starts read as "a problem it can't explain yet")

When a connector's program isn't on this computer, the Node program starter and the pinned launcher shall refuse the start with a `ProgramNotFoundError` that names the program as the connector's file wrote it (or `node`, when an npm runner's `node` is missing). When a secret a connector names isn't set, the stdio and HTTP connectors shall refuse with a `SecretNotSetError` that names the secret. When a stdio program ends, stops reading its input or doesn't answer a request in time while the request waits, or an MCP server stops before it answers, the request shall fail with an `McpStoppedError`, an `McpError` with code `unavailable`, so a caller can say the program stopped. When a stdio connector's program stops by itself while `initialize` waits (it exits, or closes its input or output), the stdio connector shall refuse the start with a `ProgramStoppedAtStartError`, an `McpStoppedError` that names the program as the connector's file wrote it; a program that doesn't answer `initialize` in time stays a plain `McpStoppedError`. Each message shall stay the one given before, and none shall hold a secret's value or the program's own output, so a caller can name the cause without passing on any other text.

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
- Given a stdio program that ends while `initialize` waits, or doesn't answer it within the time limit,
  when the session opens,
  then it rejects with an `McpStoppedError` of code `unavailable`.
- Given a trusted stdio connector whose program `notes-mcp` writes an error and exits while `initialize` waits,
  when its tools are listed,
  then it rejects with a `ProgramStoppedAtStartError` whose `program` is `notes-mcp`, of code `unavailable`, and its message holds none of the program's output.
- Given a trusted stdio connector whose program never answers `initialize`,
  when its tools are listed and the time limit passes,
  then it rejects with an `McpStoppedError` that isn't a `ProgramStoppedAtStartError`.
