# @halonicjs/adapter-harness-claude-code

Runs Claude Code as an agent's harness. It finds the `claude` program, checks
its version and whether someone is signed in, and points it at the run's
Halonic bridge. Claude Code always runs inside Halonic's sandbox; integrations,
secrets and approvals stay in Halonic.

- **Layer:** adapters
- **Owner:** owen
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-harness-claude-code`

So far it has `detectClaudeCode` and `claudeCodeEnvironment`; starting a run
(`start`, `send`, `cancel`) follows with the `stream-json` reader (HAL-194
build plan, C2 and C3).

## Example

```ts
import { addHarnessEnvironment } from "@halonicjs/ports";
import { claudeCodeEnvironment, detectClaudeCode } from "@halonicjs/adapter-harness-claude-code";

const found = await detectClaudeCode(probe);
if (found.status === "ready") {
  const env = addHarnessEnvironment(profile.env, claudeCodeEnvironment(bridge, profile));
  const session = await sandbox.open({ ...profile, env });
}
```

## Supported versions

Claude Code 2.1.311 or newer (`supportedVersions`): the stable channel on
9 Nov 2026, which is what the adapter is tested against. `detect()` reads the
leading `X.Y.Z` of `claude --version`, such as `2.1.321 (Claude Code)`.

## Sign-in

`claude auth status` exits with 1 and prints `"loggedIn": false` when no one
is signed in; `detect()` then answers `signed-out`. Any other answer is
`ready`: Halonic never guesses. A sign-in that has expired at Anthropic still
looks signed in here. Claude Code then prints "Login expired · Please run
/login" on its first request; `findSignInProblem` recognises it, and the run
ends with a `SignInError` before its first event, so the engine reports
`harness-start-failed`.
