# Decision: Studio's connector page says a program stopped right after it started

- Approval: Liam approves this change on HAL-15606 (https://paperclip.halonic.com/HAL/issues/HAL-15606), from flow check C600 (#1c) on HAL-15594. The words follow `halonic tools review`'s, approved on HAL-13731 and HAL-13732; Tomas decided the Studio line as the team (HAL-2282 rule: a small wording on an approved screen, built on approved words).
- Kind: user-visible

## What changes

A connector whose program stops by itself right after it starts made the connector page say
"Couldn't list the tools: boom stopped before it answered." with Copy details and no next step,
while `halonic tools review` says the program stopped and how to see why.

- The agent host answers `connector_failed` with `reason: "program-stopped"` and the `program` for a
  `ProgramStoppedAtStartError`, checked before the general `stopped`, which a program that doesn't
  answer in time keeps. Never the program's output.
- The agent host client reads it into `ConnectorFailedError` (kind `unavailable`, message "The
  program sh stopped right after it started.").
- The connector page says "Couldn't list the tools: the program `sh` of boom stopped right after it
  started. To see why, run the command and args from its connector file yourself." with Try again
  and no Copy details: the details hold nothing more.

The sandboxed connector throws `ProgramStoppedAtStartError` from PR #4788 on; until then, this line
shows for connectors that run without the sandbox, and the others keep the "stopped" line.

## Tests

No test is removed or weakened. New tests: the host's answer, the client's error and kind, and the
page's line.

## Why

C600 asked for one set of words for the same failure in the CLI and Studio, with a next step.

## Covers

- agent-host.connector-failure-reasons
- agent-host-client.connector-failure
- library.listed-tools-waiting
