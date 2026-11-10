# @halonicjs/adapter-harness-claude-code

Runs Claude Code as an agent's harness. It finds the `claude` program, checks
its version and whether someone is signed in, and points it at the run's
Halonic bridge. Claude Code always runs inside Halonic's sandbox; integrations,
secrets and approvals stay in Halonic.

- **Layer:** adapters
- **Owner:** owen
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-harness-claude-code`

So far it has `detectClaudeCode` and `claudeCodeEnvironment`, and, inside
the package, the reader that turns Claude Code's `stream-json` output into
run events. Starting a run (`start`, `send`, `cancel`) follows (HAL-194 build
plan, C3).

## Reading the output

Claude Code runs with `--output-format stream-json`, one JSON object per line.
The reader turns a subagent into `agent.started` and `agent.finished` with a
`parent`, and any other tool call into `tool.called` and `tool.result`. A call
through the bridge (`mcp__halonic__…`) and every model call are left out: the
bridge records those. The `result` line is the run's final `agent.finished`;
an error result ends the run with an error. Line types it doesn't know are
skipped, so a newer Claude Code can add some, and a line that isn't JSON ends
the run with an error that never quotes it.

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

## The settings folder

`CLAUDE_CONFIG_DIR` points Claude Code at the agent's own settings folder in
Halonic's data. Before a run, the harness writes two files there:

- `settings.json` turns Claude Code's own sandbox off, because Halonic's
  sandbox is already around it, and denies `WebFetch` and `WebSearch`, in a
  sandbox and on this computer alike (decision 7, HAL-2076).
- `halonic-mcp.json` names the bridge's MCP server, `halonic`, at `/mcp` on
  the bridge's address. Its address and token header are written as
  `${ANTHROPIC_BASE_URL}` and `${HALONIC_RUN_TOKEN}`, which Claude Code fills
  in from its environment, so the files never hold the run token and are the
  same for every run.

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
