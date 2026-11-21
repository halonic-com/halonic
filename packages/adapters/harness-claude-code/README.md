# @halonicjs/adapter-harness-claude-code

Runs Claude Code as an agent's harness. It finds the `claude` program, checks
its version and whether someone is signed in, and points it at the run's
Halonic bridge. Claude Code always runs inside Halonic's sandbox; integrations,
secrets and approvals stay in Halonic.

- **Layer:** adapters
- **Owner:** owen
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-harness-claude-code`

`claudeCodeHarness({ probe })` is the `Harness` the host offers for
`harness: claude-code`. A run writes the settings folder, starts
`claude -p` with `stream-json` in and out inside the run's sandbox session,
sends the prompt on standard input and turns what Claude Code prints into
run events. `send` passes a person's answer on as the next user message;
approvals go through the bridge's `approve_permission` tool instead, so `send`
refuses an approval decision. `cancel`
stops Claude Code and everything it started. It passes the `harness`
contract suite.

## The command

Claude Code gets the bridge's MCP server from the settings folder and no other,
and `approve_permission` as its permission-prompt tool. `--model` and
`--append-system-prompt` are added only when the agent's file sets a model or
instructions. The prompt and every later answer go in as `stream-json` user
messages on standard input, never in the arguments. A line of output longer
than 16 Mi characters ends the reading with an error.

## The environment

`claudeCodeEnvironment(bridge, folders)` (also `harness.environment`) gives
six variables: `ANTHROPIC_BASE_URL` (the run's bridge), `ANTHROPIC_CUSTOM_HEADERS`
(the run token in the bridge's own header, so `Authorization` stays free for
the person's sign-in), `CLAUDE_CONFIG_DIR`, `CLAUDE_CODE_TMPDIR` (the
session's own temp folder), `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` (`1`, so
Claude Code sends no telemetry, error reports or update checks, which the
sandbox would block) and `HALONIC_RUN_TOKEN`. When the bridge serves
Anthropic with a key Halonic keeps (its `keyProviders` names `anthropic`), it
also sets `ANTHROPIC_API_KEY` to `claudeCodeStandInKey`, a fixed stand-in that
holds no secret: without a key or a sign-in, Claude Code says "Not logged in"
and never calls its model, and the bridge puts the real key in its place. With
the person's own sign-in it stays unset. It throws when the profile
has no settings folder. The run token is removed from every event and error.

`claudeCodeEnvironment(bridge, folders, model)` also points Claude Code's own
model choices at the task's model when the agent's file named a `models.yaml`
alias (`modelForEveryCall`): `ANTHROPIC_DEFAULT_HAIKU_MODEL`,
`ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL`,
`ANTHROPIC_SMALL_FAST_MODEL` and `CLAUDE_CODE_SUBAGENT_MODEL`. A compatible
provider such as Z.ai has none of Claude's models, so its background and
subagent calls must ask for the agent's model too. For a name Claude Code knows
itself, such as `sonnet`, it sets none of them.

Studio runs harnesses in the agent host but computes the environment on its
own page, so `claudeCodeEnvironment`, its `ClaudeCodeFolders` type and
`claudeCodeRunTokenVariable` (`HALONIC_RUN_TOKEN`) are also their own entry
point, `@halonicjs/adapter-harness-claude-code/environment`. That entry imports only
`@halonicjs/ports`, never Node, so a page can load it.

`claudeCodeSignIn` (also `harness.signIn`) is Claude Code's own sign-in for
one agent: `claude auth login` with `CLAUDE_CONFIG_DIR` set to the agent's
settings folder, the one its runs get. Studio runs it in a terminal the
person can see.

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
import { claudeCodeHarness } from "@halonicjs/adapter-harness-claude-code";

const claudeCode = claudeCodeHarness({ probe });
if ((await claudeCode.detect()).status === "ready") {
  const extra = claudeCode.environment?.(bridge, profile) ?? {};
  const session = await sandbox.open({
    ...profile,
    env: addHarnessEnvironment(profile.env, extra),
  });
  for await (const event of claudeCode.start(task, session, bridge)) record(event);
}
```

## The settings folder

`CLAUDE_CONFIG_DIR` points Claude Code at the agent's own settings folder in
Halonic's data. Before a run, the harness writes two files there:

- `settings.json` turns Claude Code's own sandbox off, because Halonic's
  sandbox is already around it, and denies `WebFetch` and `WebSearch`, in a
  sandbox and on this computer alike (decision 7, HAL-2076). It allows
  Halonic's tools (`mcp__halonic`), because the bridge checks them and asks
  a person itself; asking in Claude Code too would ask twice.
- `halonic-mcp.json` names the bridge's two MCP servers on the bridge's
  address: `halonic` at `/mcp`, with Halonic's tools, and `halonic-approvals`
  at `/mcp/permission-prompt`, with `approve_permission` alone, so Codex,
  which also uses `/mcp`, never sees that tool. Their address and token
  header are written as `${ANTHROPIC_BASE_URL}` and `${HALONIC_RUN_TOKEN}`,
  which Claude Code fills in from its environment, so the files never hold
  the run token and are the same for every run. A file that already holds the
  same text is left alone.

## Supported versions

Claude Code 2.1.311 or newer (`supportedVersions`): the stable channel on
9 Nov 2026, which is what the adapter is tested against. `detect()` reads the
leading `X.Y.Z` of `claude --version`, such as `2.1.321 (Claude Code)`.

## Sign-in

`claude auth status` exits with 1 and prints `"loggedIn": false` when no one
is signed in; `detect()` then answers `signed-out`. Any other answer is
`ready`: Halonic never guesses. A sign-in that has expired at Anthropic still
looks signed in here. Claude Code then prints "Login expired · Please run
/login" (or "Not logged in", or "Authentication required") on its first
request; `findSignInProblem` recognises it, and the run
ends with a `SignInError` before its first event, so the engine reports
`harness-start-failed`.
