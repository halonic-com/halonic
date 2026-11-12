# Decision: both launchers give a program the variables its connector names in `inheritEnv`

- Approval: Paperclip task HAL-6266 (Liam's review of halonic#1971 and halonic#1976; design on HAL-6266)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:CaQTakbROee1m7o9/Jzier9HDgnpPRuh1+IQo5m4iG7L8rEutuROlxh3qloW1doCtyxgaLSPtH2P3j+l2OSADQ==

halonic#1971 gave a local connector program only a base of the app's environment, and halonic#1976
let a connector name more variables in `inheritEnv`. This makes the launchers read that list, and
shows it in the trust check in the same change, since the trust check is where a person sees which
variables a workspace takes (Liam's review: the word test can't catch every secret's name, such as
`DATABASE_URL`, so the trust line is the real gate).

- `app.connector-inherited-env` (new): the base and each named variable that is set. A name the
  word test calls a secret is never taken, even when the format check didn't run.
- `mcp.stdio-connector` and `mcp.pinned-launcher`: a program gets the base and the named variables,
  then its `env`, the launcher's own variables and its secrets, in that order. A pinned connector
  still can't name a blocked variable (`app.package-runner-launch`, halonic#1976). One example each.
- `memory.connector-client`: the stand-in does the same.
- `connector-stdio-sandbox.session-start`: a connector with `inheritEnv` is refused in a sandbox,
  since the session has no variable from this computer to give. One clause and one test.
- `cli.trust-check`: a program's row ends "· takes AWS_PROFILE from your environment" after its
  secrets. A detail of the approved trust check, decided by the team (HAL-2282). One clause and one
  example.
- `app.package-manager-variable`: wording only. It no longer says a pinned launch keeps a preload
  variable; the base environment (halonic#1971) leaves `LD_PRELOAD` out. The examples stay.
- The pinned-launch contract now also checks that a key outside the base, `ANTHROPIC_API_KEY`, never
  reaches a pinned program (Liam's second read of halonic#1971). The mcp README says the connector
  trims the app's environment.

Nothing is removed and no test is removed or weakened.

## Covers

- mcp.stdio-connector
- mcp.pinned-launcher
- memory.connector-client
- connector-stdio-sandbox.session-start
- cli.trust-check
- app.package-manager-variable
