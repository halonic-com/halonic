# Decision: there is no command line flag to run without the sandbox

- Approval: Liam decided this on HAL-11107 (from the HAL-11098 design check); the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:SX8+LSgJX6T0Sl8cnuKk+82kmigbcO3CSgYK8JEsjxbbVCkbId6S0egCKR5hpQ7++6twA6hefWPNJLptmvC7AQ==
- Task: HAL-11119

## What changes

`app.no-sandbox` described a command line `--no-sandbox` that was allowed only when the saved setting
already said `none`. That sentence and its four examples are removed, and the requirement now says
there is no command line flag to run without the sandbox. `NoSandboxService.cliFlag()` and the type
`NoSandboxFlagDecision` are removed, with their four tests. A new test checks that the service offers
only `choose` and `takeBack`. The examples for choosing and taking back the choice are unchanged.

## Why

The approved words (cli-output 3.4) say "There's no flag to run without the sandbox, and none is ever
suggested." Nothing called `cliFlag()`, but it invited someone to wire it. The choice stays a person's
click in Studio only. `halonic run` already treats `--no-sandbox` as an unknown option (usage error).

## Covers

- app.no-sandbox
- packages/core/app/src/no-sandbox.test.ts
