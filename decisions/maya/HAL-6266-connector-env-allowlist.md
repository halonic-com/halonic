# Decision: a local connector program gets only the base of the app's environment

- Approval: Paperclip task HAL-6266 (follow-up to Liam's decision on HAL-6257, option 2; design on HAL-6266)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:fKe8JHnvimiexCC38Hg7NQk0yxwGR3jyHQg6jABgcqNEuv7sl0wazhpD3LvQWSrDapFU2tt9zVBaZ2t54nYrCA==

Until now a `stdio` connector started on this computer inherited the CLI's whole environment
(`cliConnectorFactories(…, process.env)`), so a connector program could read the model keys and
tokens in the person's shell. Secrets were only scrubbed from its error output.

HAL-6266 decides: a program gets only a fixed base of the app's environment (`app.connector-base-env`,
new): the program lookup, home, user, temp and locale variables, the person's proxy, certificate
and library folders, and on Windows the system folders a program needs, the same names the official
MCP SDKs pass to a stdio server. `NODE_TLS_REJECT_UNAUTHORIZED`, `LD_PRELOAD` and
`DYLD_INSERT_LIBRARIES` are left out, as is a value that is an exported bash function. On top of it
come, as before, the connector's `env`, the pinned launcher's own settings and `secretEnv`.

- `mcp.stdio-connector`: "with the inherited environment" becomes "with only the base of the app's
  environment"; one example is added (a model key stays out).
- `mcp.pinned-launcher`: it starts from the base, not the whole inherited environment, and keeps the
  proxy, certificate or library folder the base holds (no longer a preload).
- `memory.connector-client`: the memory stand-in spawns from the same base; one clause is added. Its
  test for a program without a pin now expects a model key to stay out instead of every inherited
  variable to pass; it runs the same number of `expect` calls.

Nothing in the requirements is removed besides the whole-environment inheritance, and no test is
removed. A later pull request adds `inheritEnv`, a list of names a connector may take from the app's
environment, for variables such as `AWS_PROFILE` that are neither in the base nor secrets.

## Covers

- mcp.stdio-connector
- mcp.pinned-launcher
- memory.connector-client
