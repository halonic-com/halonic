# mcp.stdio-connector

- Status: active
- Since: 0.1.0
- Source: HAL-6266 (a program gets only the base of the app's environment and the variables its connector names in `inheritEnv`, not a model key in it; follow-up to HAL-6257); HAL-230 (Liam's approval, change 5, 10 Nov 2026; package runners start once the pinned launcher exists, HAL-2544); `ConnectorFactory` port v1; `contracts.connector-client`

The MCP stdio connector factory shall pass `contracts.connector-client` for `stdio`. Without a trust grant, a connector shall read no secret and start no program. It shall refuse a connector where programs can't start, before anything starts. A connector with a `pin` starts through the pinned launcher (`mcp.pinned-launcher`). Any other connector, a package runner without a `pin` too, shall start its program on the first call, once while it runs (a program that stops starts again as `mcp.stdio-restart` says), in the connector's `cwd` resolved against the workspace, with only the base of the app's environment and the variables its connector names in `inheritEnv` (`app.connector-inherited-env`), the connector's `env`, which replaces a named variable, and each secret of `secretEnv` in the environment only, never as an argument, and with the harness agents' working folders of the context, when there are any, for the starter to check (`mcp.program-starter`). It shall refuse a secret that isn't set, naming the secret, and try the start again on the next call. It shall list each tool with the `risk` and `untrusted` the server wrote in its `_meta`. A tool's own failure shall throw an error whose message is ours, keeping the tool's text apart. After `close`, calls shall be refused without starting again.

## Examples

- Given a connector without a trust grant whose `secretEnv` names `notes-token`,
  when its tools are listed,
  then it throws, the secrets are never read and no program has started.
- Given a trusted connector with `secretEnv` `NOTES_TOKEN: notes-token`,
  when it starts,
  then `NOTES_TOKEN` is in the program's environment and not among its arguments.
- Given the app's environment `PATH` and `ANTHROPIC_API_KEY`, and a trusted connector whose `env` is `NOTES_MODE: quiet`,
  when it starts,
  then the program's environment holds `PATH` and `NOTES_MODE` and not `ANTHROPIC_API_KEY`.
- Given the app's environment `PATH`, `AWS_PROFILE` and `GITHUB_TOKEN`, and a trusted connector whose `inheritEnv` names `AWS_PROFILE` and `GITHUB_TOKEN`,
  when it starts,
  then the program's environment holds `PATH` and `AWS_PROFILE` and not `GITHUB_TOKEN`.
