# Decision: the Harness page's readiness check moves into the agent host parts, with its test

- Requirements: `studio.workspace-agents`, `studio.workspace-agents-sign-in`
- Task: HAL-6351, reviewed on HAL-6351 (one task per PR for Studio)
- Approval: Liam asked for "Sign in for this agent" on HAL-6351 and reviews this PR there
- Kind: internal

## What changes

`apps/studio/src/agents/agent-host-harness-detect.ts` and its test are removed. The readiness
check now lives in `agent-host-harness-parts.ts`, next to the new `openSignIn`, because both first
ask the agent host for that agent's own settings folder (`POST /v1/harnesses/settings-folder`).

The old test checked that the check asks `POST /v1/harnesses/detect` and passes the answer on. Its
place is the first test in `agent-host-harness-parts.test.ts`, which checks the same thing and
also that the check names the agent's own settings folder.

## Why

The old check named no settings folder, so the host reported the program's own state and
"signed out" could never reach the page. Keeping a second, folder-less check next to the new one
would leave a way to ask about the wrong sign-in.

## Tests

No test was weakened. Every assertion of the removed test is kept in the new one, which asserts
more: both routes the host is asked, in order, and the folder sent with `detect`.

## Covers

- studio.workspace-agents
- apps/studio/src/agents/agent-host-harness-detect.test.ts
